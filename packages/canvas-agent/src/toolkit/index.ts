/**
 * The layout editor's toolkit, bound to a canvas file instead of a kernel run.
 *
 * The layout-editor agent edits a board through one surface: the 25 gesture
 * tools (`operationTools`) and the workflow tools (`workflowTools`), dispatched
 * through a `LayoutToolRuntime` bound to a `LayoutSession`. That binding is the
 * only thing the kernel contributes — `createToolRuntime(host)` asks its host
 * for "the current session" and every tool body works from there. This module
 * supplies a second host: a session opened straight from a
 * `canvases/<id>.canvas.json` file, whose edits are written back to that file
 * after every applied change. External agents (the canvas MCP, anything else
 * that wants the agent's hands without the agent's harness) get the exact
 * tool declarations, validation, and code paths the in-app agent runs.
 *
 * What differs from a kernel session is only the lifecycle around the tools:
 *
 * - **Open** reads the file, hashes its bytes, resolves the whole board as the
 *   scope (there is no operator selection), and builds the draft the same way
 *   `LayoutSessionStore.createSession` does — page-frame injection, lint
 *   baseline, request-queue sync. No container, session directory, or
 *   registry entry is created: nothing on this path reads them.
 * - **Persist** replaces the propose/accept round trip. Edits save
 *   immediately, through the same patch path Studio's Accept uses: the diff
 *   since the last write replays onto the on-disk document through the canvas
 *   reducer's `canvas.applyAgentPatch`, so the file lands exactly as an
 *   accepted proposal would leave it. A file that changed underneath the
 *   session is never clobbered — the caller must re-open it.
 * - **finalize** is not on the surface: there is no proposal to commit.
 *
 * Import discipline: this module and everything it reaches must load without
 * `@agent-kernel/*`, `service/kernel.ts`, `service/session/store.ts`, or React.
 * Session internals are therefore imported by deep path, never through the
 * `service/session` barrel (which re-exports the kernel-backed store), and
 * `LayoutSession` is a type-only import.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import { validateToolArguments, type TSchema } from "@mariozechner/pi-ai";
import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAgentPatchOperation,
} from "@codecaine-ai/canvas/actions";
import {
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
} from "@codecaine-ai/canvas/schema";

import { diffDocuments } from "../board/doc-diff";
import { runDiagnostics } from "../board/lints/run";
import { resolveScope } from "../board/scope";
import {
  boardStateSnapshot,
  draftWithPageFrame,
  injectedPageFrame,
  syncSessionRequests,
} from "../service/session/snapshots/context";
import type { LayoutSession } from "../service/session/store";
import { createToolRuntime } from "../service/session/tools/create-runtime";
import { operationTools, type OperationTool } from "../service/session/tools/operations";
import type {
  LayoutToolRenderResult,
  LayoutToolRuntime,
} from "../service/session/tools/runtime";
import { workflowTools } from "../service/session/tools/workflow";
import type { WorkflowTool } from "../service/session/tools/workflow/workflow-tool";

export { boardStateSnapshot, operationTools, workflowTools };
export type { LayoutSession, LayoutToolRenderResult, LayoutToolRuntime, OperationTool, WorkflowTool };

/**
 * Workflow tools with no meaning outside a kernel run. `finalize` ends a run
 * and turns the draft into a proposal for operator review; a file session has
 * neither a run nor a proposal, because every applied change is already on
 * disk.
 */
const RUN_ONLY_WORKFLOW_TOOLS = new Set(["finalize"]);

/**
 * One tool on the file-session surface: the agent's own descriptor, unchanged,
 * tagged with the roster it came from. `parameters` is the same TypeBox object
 * the agent registers, which is JSON Schema already.
 */
export interface ToolkitTool {
  readonly kind: "operation" | "workflow";
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: TSchema;
}

/**
 * The file-session surface, in the agent's registration order: the 25 gestures
 * first, then every workflow tool except the run-only ones. `resolve_request`
 * stays — its disposition is a reply and a status change on the annotation
 * thread, which is document content and persists like any edit.
 */
export const toolkitTools: readonly ToolkitTool[] = [
  ...operationTools.map((tool) => ({
    kind: "operation" as const,
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
  })),
  ...workflowTools
    .filter((tool) => !RUN_ONLY_WORKFLOW_TOOLS.has(tool.name))
    .map((tool) => ({
      kind: "workflow" as const,
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
    })),
];

const toolkitToolsByName = new Map(toolkitTools.map((tool) => [tool.name, tool]));
const workflowToolsByName = new Map(workflowTools.map((tool) => [tool.name, tool]));

/**
 * Raised when the canvas file changed on disk since this session last read or
 * wrote it. The message is written for the calling agent: it names the fix.
 */
export class CanvasFileConflictError extends Error {
  constructor(readonly canvasPath: string) {
    super(
      `The canvas file ${basename(canvasPath)} changed on disk since it was opened `
      + "(another editor saved it). This edit was NOT saved. Call canvas_open again "
      + "to reload the current board, then redo the edit against it.",
    );
    this.name = "CanvasFileConflictError";
  }
}

/**
 * A layout session whose authority is a file on disk.
 *
 * `session` is a complete `LayoutSession`, so every tool, perception block,
 * and snapshot helper takes it as-is. The fields beside it track the file:
 * the bytes' hash and parsed document as last read or written (the conflict
 * guard and the next diff's base), and the id of the page frame injected into
 * the draft, which is draft-only scaffolding and never written back.
 */
export interface CanvasFileSession {
  readonly canvasId: string;
  readonly canvasPath: string;
  readonly session: LayoutSession;
  readonly runtime: LayoutToolRuntime;
  /** sha256 of the file bytes as last read or written by this session. */
  diskHash: string;
  /** The on-disk document as last read or written: the base of the next persist diff. */
  persisted: InteractiveCanvasDocument;
  /** Id of the page frame `draftWithPageFrame` injected at open, or null when the board had one. */
  readonly injectedFrameId: string | null;
  /**
   * Set when a persist found the file changed underneath the session. The
   * draft then holds an edit the file never received, so every further call
   * is refused until the caller re-opens.
   */
  conflicted: boolean;
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** `<id>.canvas.json` → `<id>`; any other file name keeps its base name. */
function canvasIdOf(canvasPath: string): string {
  return basename(canvasPath).replace(/\.canvas\.json$/, "");
}

/**
 * Open a canvas file as a layout session bound to a fresh tool runtime.
 *
 * The session mirrors `LayoutSessionStore.createSession`: the file is the
 * baseline, the draft carries an injected page frame when the board has no
 * root section, the lint baseline is seeded so the first edit reports a delta,
 * and the request queue is synced from the document's annotation threads.
 * Scope is the whole board — every object in the draft, the injected frame
 * included — since an external caller edits the board rather than a selection.
 * `containerId` and `sessionDir` are inert labels: nothing outside the kernel
 * store reads them.
 */
export function openCanvasFile(canvasPath: string): CanvasFileSession {
  const raw = readFileSync(canvasPath);
  const baseline = JSON.parse(raw.toString("utf8")) as InteractiveCanvasDocument;
  const validation = validateInteractiveCanvasDocument(baseline);
  if (!validation.ok) {
    const issues = validation.issues.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`);
    throw new Error(`${basename(canvasPath)} is not a valid canvas document: ${issues.join("; ")}`);
  }
  const baselineHash = sha256(raw);
  const frame = injectedPageFrame(baseline);
  const draft = draftWithPageFrame(baseline);
  const scopeResolution = resolveScope(draft, draft.objects.map((object) => object.id));
  const canvasId = canvasIdOf(canvasPath);
  const id = randomUUID();

  const session: LayoutSession = {
    id,
    canvasId,
    canvasPath,
    baseline,
    baselineHash,
    scopeResolution,
    scopeIds: new Set(scopeResolution.scopeObjectIds),
    draft,
    proposalCount: 0,
    proposal: null,
    status: "running",
    error: null,
    instruction: "",
    annotations: [],
    viewport: undefined,
    containerId: `canvas-file:${canvasId}`,
    sessionDir: "",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    requests: [],
    views: [],
    viewCount: 0,
    changeRenders: [],
  };
  session.lastDiagnostics = runDiagnostics(session.draft);
  syncSessionRequests(session);

  // Run-UX events (proposal/delta/annotations) feed Studio's live agent panel;
  // a file session has no subscriber, so they are dropped rather than buffered
  // for the life of the process. Renders arrive in `look`'s own result.
  const runtime = createToolRuntime({
    currentSession: () => session,
    emit: () => {},
    onRender: () => {},
  });

  return {
    canvasId,
    canvasPath,
    session,
    runtime,
    diskHash: baselineHash,
    persisted: baseline,
    injectedFrameId: frame?.id ?? null,
    conflicted: false,
  };
}

/**
 * The draft as the file should hold it: the injected page frame removed, with
 * any connection or annotation anchored to it, since neither can outlive its
 * endpoint on disk. Membership (`parentId`) needs no rewrite — the diff omits
 * it and the reducer re-derives it from geometry.
 */
function draftForDisk(file: CanvasFileSession): InteractiveCanvasDocument {
  const draft = file.session.draft;
  const frameId = file.injectedFrameId;
  if (frameId === null || !draft.objects.some((object) => object.id === frameId)) return draft;
  return {
    ...draft,
    objects: draft.objects.filter((object) => object.id !== frameId),
    connections: draft.connections.filter((connection) =>
      connection.from.objectId !== frameId && connection.to.objectId !== frameId),
    annotations: draft.annotations?.filter((annotation) =>
      annotation.target.kind !== "object" || annotation.target.objectId !== frameId),
  };
}

/** Write through a sibling temp file and rename — atomic on one filesystem, as Studio saves. */
function writeFileAtomic(filePath: string, contents: string): void {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, contents);
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    try { unlinkSync(tempPath); } catch { /* the rename error is the one worth reporting */ }
    throw error;
  }
}

export interface PersistResult {
  /** False when the draft already matched the file, so nothing was written. */
  written: boolean;
  /** The patch replayed onto the file (empty when nothing was written). */
  operations: CanvasAgentPatchOperation[];
  /**
   * Patch operations still separating the saved file from the draft after the
   * replay — normally zero. Non-zero means the reducer derived something the
   * draft did not predict (e.g. membership or waypoints the gesture pipeline
   * reconciled differently), and the file is the truth.
   */
  residual: number;
}

/**
 * Save the session's edits since the last persist to its canvas file.
 *
 * 1. Re-read the file. If its bytes hash differently from what this session
 *    last read or wrote, someone else saved it: throw `CanvasFileConflictError`
 *    and mark the session conflicted rather than overwrite their work.
 * 2. Diff the last-persisted document against the disk form of the draft
 *    (`diffDocuments`, the differ `finalize` builds proposals with).
 * 3. Replay that patch onto the on-disk document through the canvas reducer's
 *    `canvas.applyAgentPatch` — the path Studio's Accept dispatches — so the
 *    file ends exactly where an accepted proposal would leave it.
 * 4. Validate, write atomically in Studio's format, and advance the stored
 *    hash and persisted base. `session.baseline` stays the document as opened,
 *    so the cumulative diff `look` reports reads "since canvas_open".
 */
export function persistCanvasFile(
  file: CanvasFileSession,
  summary = "Agent edit",
): PersistResult {
  const raw = readFileSync(file.canvasPath);
  if (sha256(raw) !== file.diskHash) {
    file.conflicted = true;
    throw new CanvasFileConflictError(file.canvasPath);
  }
  const target = draftForDisk(file);
  const operations = diffDocuments(file.persisted, target);
  if (operations.length === 0) return { written: false, operations, residual: 0 };

  const onDisk = JSON.parse(raw.toString("utf8")) as InteractiveCanvasDocument;
  const next = reduceInteractiveCanvasState(createInteractiveCanvasState(onDisk), {
    type: "canvas.applyAgentPatch",
    operations,
    summary,
  }).document;
  const validation = validateInteractiveCanvasDocument(next);
  if (!validation.ok) {
    const issues = validation.issues.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`);
    throw new Error(`The edited board failed canvas validation and was not saved: ${issues.join("; ")}`);
  }
  const contents = `${JSON.stringify(validation.document, null, 2)}\n`;
  writeFileAtomic(file.canvasPath, contents);
  file.diskHash = sha256(contents);
  file.persisted = JSON.parse(contents) as InteractiveCanvasDocument;
  file.session.baselineHash = file.diskHash;
  return {
    written: true,
    operations,
    residual: diffDocuments(file.persisted, target).length,
  };
}

/** The result of one toolkit call, with what the persist step did. */
export interface ToolkitCallResult extends LayoutToolRenderResult {
  persisted?: PersistResult;
}

/**
 * Run one toolkit tool against a file session, then save.
 *
 * Arguments are validated against the tool's own schema with pi-ai's
 * `validateToolArguments`, the same check the agent runtime applies before
 * `execute`. A call that changed the draft (an APPLIED operation, a
 * description, a thread reply) is persisted immediately; errors, no-ops, and
 * `look` leave the draft untouched and write nothing. A failed save comes back
 * as an error result — the edit is not on disk, whatever the tool text said.
 */
export async function callToolkitTool(
  file: CanvasFileSession,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolkitCallResult> {
  const tool = toolkitToolsByName.get(name);
  if (!tool) {
    return { isError: true, text: `ERROR · ${name} — not a canvas toolkit tool.` };
  }
  if (file.conflicted) {
    return { isError: true, text: new CanvasFileConflictError(file.canvasPath).message };
  }
  let params: Record<string, unknown>;
  try {
    params = validateToolArguments(
      { name: tool.name, description: tool.description, parameters: tool.parameters },
      { type: "toolCall", id: randomUUID(), name: tool.name, arguments: args },
    ) as Record<string, unknown>;
  } catch (error) {
    return {
      isError: true,
      text: `ERROR · ${name} — ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const before = file.session.draft;
  const result: LayoutToolRenderResult = tool.kind === "operation"
    ? file.runtime.operation(name, params)
    : await workflowToolsByName.get(name)!.invoke(file.runtime, params);
  if (result.isError || file.session.draft === before) return result;

  try {
    const persisted = persistCanvasFile(file, `${name} (canvas toolkit)`);
    return { ...result, persisted };
  } catch (error) {
    return {
      ...result,
      isError: true,
      text: `${result.text}\n\nSAVE FAILED · ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
