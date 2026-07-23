/**
 * Stateful layout-session façade — the one class the routes/cli talk to.
 * Owns session lifecycle (create → running → proposal-ready →
 * accepted/rejected/abandoned/error), reads the baseline canvas file and
 * resolves scope (board/scope.ts), spawns the kernel agent with the four
 * context blocks as sessionData, relays SSE events, and applies the
 * accept/reject flow — accept re-reads the live file and answers 409 when
 * scoped objects changed underneath the session. Editing mechanics live in
 * ./apply-ops, tool implementations in ./tools, snapshots/gates in ./context.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { updateContainerStatus, type KernelDatabase } from "@agent-kernel/db";
import { getRunContext, type KernelInstance } from "@agent-kernel/kernel";

import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
// Relative import so the harness never loads the package's React surface.
import { renderDocumentToSvg } from "../../../../canvas/src/render/static-svg";

import { resolveScope, type ScopeResolution } from "../../board/scope";
import type { Diagnostic } from "../../board/lints";
import type {
  AcceptAgentSessionResponse,
  AgentProposal,
  AgentSessionAnnotation,
  AgentSessionEvent,
  AgentSessionState,
  AgentSessionStatus,
  AgentSessionViewport,
  CreateAgentSessionRequest,
} from "../../protocol";

import { CANVASES_DIR, REPO_ROOT, AGENT_KERNEL_DIR, createLayoutKernel } from "../kernel";
import type { LayoutToolRuntime } from "../tool-runtime";
import {
  boardStateSnapshot,
  documentWithinCrop,
  draftWithPageFrame,
  editorSnapshot,
  expandRect,
  renderCropError,
  solvedFrame,
  userRequestsSnapshot,
} from "./context";
import { createToolRuntime } from "./tools";

const AGENT_NAME = "layout-editor";
/** World-space context ring around the scope frame for the camera + inspect. */
const CONTEXT_RING = 128;
/** Raster width for the operator-facing ghost-preview SVG feed. */
const GHOST_PREVIEW_WIDTH = 1400;
const SESSION_DIR_ROOT = join(AGENT_KERNEL_DIR, "layout-sessions");

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface LayoutSession {
  id: string;
  canvasId: string;
  canvasPath: string;
  baseline: InteractiveCanvasDocument;
  baselineHash: string;
  /** Baseline scope geometry and membership, frozen for rebase checks. */
  scopeResolution: ScopeResolution;
  /** Resolved Ring-0 ids (baseline scope; draft-created ids never join). */
  scopeIds: Set<string>;
  draft: InteractiveCanvasDocument;
  proposalCount: number;
  proposal: AgentProposal | null;
  status: AgentSessionStatus;
  error: string | null;
  instruction: string;
  annotations: AgentSessionAnnotation[];
  viewport: AgentSessionViewport | undefined;
  containerId: string;
  sessionDir: string;
  events: AgentSessionEvent[];
  subscribers: Set<(event: AgentSessionEvent) => void>;
  /** Resolves when the current agent run settles (CLI awaits this). */
  runPromise: Promise<void> | null;
  /** The house-style exemplar is attached to at most the first `board` result. */
  exemplarShown?: boolean;
  /** Diagnostics attached to the previous apply result, for LINTS delta reporting. */
  lastDiagnostics?: Diagnostic[];
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Record an event and fan it out without letting a dead subscriber fail the session. */
export function emitSessionEvent(session: LayoutSession, event: AgentSessionEvent): void {
  session.events.push(event);
  for (const listener of session.subscribers) {
    try {
      listener(event);
    } catch {
      // A dead subscriber never takes the session down.
    }
  }
}

export class LayoutSessionStore {
  readonly kernel: KernelInstance<LayoutToolRuntime>;

  /** Optional sink for render_draft PNGs (the CLI writes them to disk). */
  onRender: ((sessionId: string, png: Buffer, index: number) => void) | null = null;

  private readonly db: KernelDatabase;
  private readonly sessions = new Map<string, LayoutSession>();
  private readonly byContainer = new Map<string, LayoutSession>();

  constructor(db: KernelDatabase) {
    this.db = db;
    this.kernel = createLayoutKernel(db, createToolRuntime({
      currentSession: () => this.currentSession(),
      emit: (session, event) => this.emit(session, event),
      onRender: (sessionId, png, index) => this.onRender?.(sessionId, png, index),
    }));
  }

  get(sessionId: string): LayoutSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new HttpError(404, `Unknown layout session: ${sessionId}`);
    return session;
  }

  list(): LayoutSession[] {
    return [...this.sessions.values()];
  }

  stateOf(session: LayoutSession): AgentSessionState {
    return {
      sessionId: session.id,
      canvasId: session.canvasId,
      status: session.status,
      instruction: session.instruction,
      scopeObjectIds: [...session.scopeIds],
      frame: session.scopeResolution.frame,
      baselineHash: session.baselineHash,
      proposalCount: session.proposalCount,
      proposal: session.proposal,
      error: session.error,
    };
  }

  async createSession(request: CreateAgentSessionRequest): Promise<LayoutSession> {
    const canvasId = request.canvasId;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(canvasId)) {
      throw new HttpError(400, `Invalid canvas id: ${JSON.stringify(canvasId)}`);
    }
    const canvasPath = join(CANVASES_DIR, `${canvasId}.canvas.json`);
    if (!existsSync(canvasPath)) {
      throw new HttpError(404, `Canvas not found: ${canvasId}`);
    }
    if (!Array.isArray(request.scopeObjectIds) || request.scopeObjectIds.length === 0) {
      throw new HttpError(400, "scopeObjectIds must name at least one object.");
    }
    if (typeof request.instruction !== "string" || request.instruction.trim() === "") {
      throw new HttpError(400, "instruction must be a non-empty string.");
    }

    const raw = readFileSync(canvasPath);
    const baseline = JSON.parse(raw.toString("utf8")) as InteractiveCanvasDocument;
    const baselineHash = sha256(raw);

    let resolution: ScopeResolution;
    try {
      resolution = resolveScope(baseline, request.scopeObjectIds);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }

    const sessionId = randomUUID();
    const sessionDir = join(SESSION_DIR_ROOT, sessionId);
    mkdirSync(sessionDir, { recursive: true });

    const container = await this.kernel.container({
      kind: "layout-session",
      key: [canvasId, sessionId],
      label: `Layout: ${request.instruction.slice(0, 72)}`,
      workingDir: REPO_ROOT,
      metadata: {
        app: "canvas-agent",
        canvasId,
        sessionId,
        instruction: request.instruction,
        scopeObjectIds: resolution.scopeObjectIds,
      },
    });

    const session: LayoutSession = {
      id: sessionId,
      canvasId,
      canvasPath,
      baseline,
      baselineHash,
      scopeResolution: resolution,
      scopeIds: new Set(resolution.scopeObjectIds),
      draft: draftWithPageFrame(baseline),
      proposalCount: 0,
      proposal: null,
      status: "running",
      error: null,
      instruction: request.instruction,
      annotations: request.annotations ?? [],
      viewport: request.viewport,
      containerId: container.id,
      sessionDir,
      events: [],
      subscribers: new Set(),
      runPromise: null,
      exemplarShown: false,
    };
    this.sessions.set(sessionId, session);
    this.byContainer.set(container.id, session);

    await updateContainerStatus(this.db, container.id, "active", {
      startedAt: new Date().toISOString(),
    });

    this.emit(session, {
      type: "fitted",
      sessionId,
      frame: resolution.frame,
      scopeObjectIds: resolution.scopeObjectIds,
      boundaryArrowCount: resolution.boundaryArrowCount,
    });

    session.runPromise = this.runAgent(session, request.instruction, false);
    return session;
  }

  /** Refine: a follow-up instruction into the same kernel agent session. */
  message(sessionId: string, instruction: string, snapshot?: {
    annotations?: AgentSessionAnnotation[];
    viewport?: AgentSessionViewport;
  }): LayoutSession {
    const session = this.get(sessionId);
    if (session.status === "accepted" || session.status === "rejected") {
      throw new HttpError(409, `Session is already ${session.status}.`);
    }
    if (typeof instruction !== "string" || instruction.trim() === "") {
      throw new HttpError(400, "instruction must be a non-empty string.");
    }
    session.instruction = instruction;
    if (snapshot?.annotations) session.annotations = snapshot.annotations;
    if (snapshot?.viewport) session.viewport = snapshot.viewport;
    session.status = "running";
    session.error = null;
    this.emit(session, { type: "status", sessionId, status: "running" });
    session.runPromise = this.runAgent(session, instruction, true);
    return session;
  }

  /** Accept: rebase-check against the live file, then hand over the patch. */
  accept(sessionId: string): AcceptAgentSessionResponse {
    const session = this.get(sessionId);
    switch (session.status) {
      case "accepted":
        throw new HttpError(409, "This proposal was already applied.");
      case "rejected":
        throw new HttpError(409, "This session was discarded.");
      case "running":
        throw new HttpError(409, "The agent is still working.");
      case "error":
        throw new HttpError(409, "The session failed; nothing to apply.");
      case "proposal-ready":
      case "abandoned":
        break;
    }
    const proposal = session.proposal;
    if (!proposal) {
      throw new HttpError(409, "No committed proposal to accept yet.");
    }

    const liveRaw = readFileSync(session.canvasPath);
    const liveHash = sha256(liveRaw);
    if (liveHash === session.baselineHash) {
      session.status = "accepted";
      this.emit(session, { type: "status", sessionId, status: "accepted" });
      return {
        operations: proposal.operations as CanvasAgentPatchOperation[],
        summary: proposal.summary,
        rebased: false,
      };
    }

    const live = JSON.parse(liveRaw.toString("utf8")) as InteractiveCanvasDocument;
    const liveById = new Map(live.objects.map((object) => [object.id, object]));
    const moved: string[] = [];
    const deleted: string[] = [];
    for (const id of session.scopeResolution.scopeObjectIds) {
      const baselineObject = session.baseline.objects.find((object) => object.id === id)!;
      const liveObject = liveById.get(id);
      if (!liveObject) {
        deleted.push(id);
        continue;
      }
      const a = baselineObject.geometry;
      const b = liveObject.geometry;
      if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) {
        moved.push(id);
      }
    }
    if (deleted.length > 0 || moved.length > 0) {
      const parts: string[] = [];
      if (deleted.length > 0) parts.push(`deleted (${deleted.join(", ")})`);
      if (moved.length > 0) parts.push(`moved or resized (${moved.join(", ")})`);
      throw new HttpError(
        409,
        `The board changed while the agent was working: objects in the agent's scope were ${parts.join(" and ")}. `
        + "The proposal can't be applied safely — reject it and run the agent again on the current board.",
      );
    }

    session.status = "accepted";
    this.emit(session, { type: "status", sessionId, status: "accepted" });
    return {
      operations: proposal.operations as CanvasAgentPatchOperation[],
      summary: proposal.summary,
      rebased: true,
    };
  }

  reject(sessionId: string): void {
    const session = this.get(sessionId);
    session.status = "rejected";
    this.emit(session, { type: "status", sessionId, status: "rejected" });
  }

  /** The ghost-preview feed: current draft, scope frame + context ring. */
  draftSvg(sessionId: string): { svg: string; width: number; height: number } {
    const session = this.get(sessionId);
    const crop = expandRect(solvedFrame(session), CONTEXT_RING);
    const cropError = renderCropError(crop);
    if (cropError) throw new Error(cropError);
    return renderDocumentToSvg(documentWithinCrop(session.draft, crop), {
      cropRect: crop,
      width: GHOST_PREVIEW_WIDTH,
    });
  }

  subscribe(sessionId: string, listener: (event: AgentSessionEvent) => void): () => void {
    const session = this.get(sessionId);
    for (const event of session.events) listener(event);
    session.subscribers.add(listener);
    return () => session.subscribers.delete(listener);
  }

  private async runAgent(
    session: LayoutSession,
    instruction: string,
    refine: boolean,
  ): Promise<void> {
    try {
      await this.kernel.spawnAgent(AGENT_NAME, instruction, null, {
        containerId: session.containerId,
        trigger: "operator",
        sessionDir: session.sessionDir,
        workingDir: REPO_ROOT,
        displayLabel: "Layout Editor",
        reuseExistingSession: refine,
        sessionData: {
          editorState: editorSnapshot(session),
          userRequests: userRequestsSnapshot(session),
          boardState: boardStateSnapshot(session),
        },
      });
      if (session.status === "running") {
        session.status = "error";
        session.error = "The agent ended its run without committing or abandoning.";
        this.emit(session, { type: "error", sessionId: session.id, message: session.error });
        this.markContainer(session, "error");
      } else if (session.status === "proposal-ready" || session.status === "abandoned") {
        this.markContainer(session, "done");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.status = "error";
      session.error = message;
      this.emit(session, { type: "error", sessionId: session.id, message });
      this.markContainer(session, "error");
    }
  }

  private markContainer(session: LayoutSession, status: string): void {
    void updateContainerStatus(this.db, session.containerId, status, {
      endedAt: new Date().toISOString(),
    }).catch((error) => {
      console.error("canvas-agent container status update failed:", error);
    });
  }

  private emit(session: LayoutSession, event: AgentSessionEvent): void {
    emitSessionEvent(session, event);
  }

  private currentSession(): LayoutSession {
    const ctx = getRunContext();
    const session = this.byContainer.get(ctx.containerId);
    if (!session) {
      throw new Error(`No layout session for container ${ctx.containerId}.`);
    }
    return session;
  }
}
