import { isDeepStrictEqual } from "node:util";

import {
  createInteractiveCanvasState,
  reduceInteractiveCanvasState,
  type CanvasAgentPatchOperation,
} from "../../../../canvas/src/state/actions.ts";
import {
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
} from "../../../../canvas/src/state/schema.ts";

/**
 * The eval file API and the eval harness are spawned per run on ephemeral
 * ports (queue.ts), so their origins are not fixed constants: the suite hands
 * them to each scenario child in the environment. Reusing a service from an
 * earlier run is what let a three-day-old tool surface answer a live eval, so
 * there is deliberately no default origin to fall back to.
 */
export const EVAL_FILE_API_ORIGIN_ENV = "EVAL_FILE_API_ORIGIN";
export const EVAL_HARNESS_ORIGIN_ENV = "EVAL_HARNESS_ORIGIN";

export function requireServiceOrigin(
  variable: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env[variable];
  if (!raw || raw.trim() === "") {
    throw new Error(
      `${variable} must be set: eval services listen on per-run ephemeral ports, so the suite queue passes their origins to every scenario child.`,
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${variable} is not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${variable} must be an http(s) origin: ${raw}`);
  }
  return url.origin;
}

export function evalFileApiOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return requireServiceOrigin(EVAL_FILE_API_ORIGIN_ENV, env);
}

export function evalHarnessOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return requireServiceOrigin(EVAL_HARNESS_ORIGIN_ENV, env);
}

export type SessionStatus =
  | "running"
  | "proposal-ready"
  | "accepted"
  | "rejected"
  | "abandoned"
  | "error";

export interface SessionProposal {
  n: number;
  operations: CanvasAgentPatchOperation[];
  summary: string;
  delta: string;
  lint: string;
}

export interface SessionState {
  sessionId: string;
  canvasId: string;
  status: SessionStatus;
  instruction: string;
  scopeObjectIds: string[];
  baselineHash: string;
  proposalCount: number;
  proposal: SessionProposal | null;
  error: string | null;
}

export interface CreatedSession {
  sessionId: string;
  baselineHash: string;
  containerId: string;
}

export interface AcceptedSession {
  operations: CanvasAgentPatchOperation[];
  summary: string;
  rebased: boolean;
}

export interface TranscriptToolCall {
  toolName?: string;
  resultText?: string | null;
}

export interface TranscriptTurn {
  toolCalls?: TranscriptToolCall[];
}

export interface TranscriptPiSession {
  turns?: TranscriptTurn[];
}

export interface SessionTranscript {
  container_id: string;
  pi_sessions: TranscriptPiSession[];
  [key: string]: unknown;
}

export class HttpRequestError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly url: string,
    readonly body: string,
  ) {
    super(`${method} ${url} failed: ${status}${body ? ` ${body}` : ""}`);
  }
}

async function responseBody(response: Response): Promise<string> {
  return (await response.text()).trim();
}

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new HttpRequestError(
      response.status,
      init?.method ?? "GET",
      url,
      await responseBody(response),
    );
  }
  return response;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return await (await fetchOk(url, init)).json() as T;
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export class CanvasFileClient {
  constructor(readonly origin: string) {}

  async listCanvases(): Promise<{ canvases: Array<{ id: string }> }> {
    return await fetchJson(`${this.origin}/api/canvases`);
  }

  async deleteCanvas(canvasId: string): Promise<boolean> {
    const url = `${this.origin}/api/canvases/${encodeURIComponent(canvasId)}`;
    const response = await fetch(url, { method: "DELETE" });
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new HttpRequestError(
        response.status,
        "DELETE",
        url,
        await responseBody(response),
      );
    }
    return true;
  }

  async createCanvas(
    canvasId: string,
    canvas: InteractiveCanvasDocument,
  ): Promise<void> {
    await fetchOk(
      `${this.origin}/api/canvases`,
      jsonRequest("POST", { id: canvasId, canvas }),
    );
  }

  async getCanvas(canvasId: string): Promise<InteractiveCanvasDocument> {
    const payload = await fetchJson<{ canvas: InteractiveCanvasDocument }>(
      `${this.origin}/api/canvases/${encodeURIComponent(canvasId)}`,
    );
    return payload.canvas;
  }

  async putCanvas(
    canvasId: string,
    canvas: InteractiveCanvasDocument,
  ): Promise<InteractiveCanvasDocument> {
    await fetchOk(
      `${this.origin}/api/canvases/${encodeURIComponent(canvasId)}`,
      jsonRequest("PUT", { canvas }),
    );
    return await this.getCanvas(canvasId);
  }

  async previewSvg(canvasId: string): Promise<string> {
    return await (
      await fetchOk(
        `${this.origin}/api/canvases/${encodeURIComponent(canvasId)}/preview.svg?fit=content&pad=48`,
      )
    ).text();
  }
}

export class HarnessClient {
  constructor(readonly origin: string) {}

  private sessionsUrl(canvasId: string): string {
    return `${this.origin}/api/canvases/${encodeURIComponent(canvasId)}/agent/sessions`;
  }

  async health(): Promise<{ status: string; kernel: string }> {
    return await fetchJson(`${this.origin}/health`);
  }

  async createSession(
    canvasId: string,
    instruction: string,
    scopeObjectIds: string[],
  ): Promise<CreatedSession> {
    return await fetchJson(
      this.sessionsUrl(canvasId),
      jsonRequest("POST", { instruction, scopeObjectIds }),
    );
  }

  async getSession(canvasId: string, sessionId: string): Promise<SessionState> {
    return await fetchJson(
      `${this.sessionsUrl(canvasId)}/${encodeURIComponent(sessionId)}`,
    );
  }

  async acceptSession(
    canvasId: string,
    sessionId: string,
  ): Promise<AcceptedSession> {
    return await fetchJson(
      `${this.sessionsUrl(canvasId)}/${encodeURIComponent(sessionId)}/accept`,
      { method: "POST" },
    );
  }

  async rejectSession(canvasId: string, sessionId: string): Promise<void> {
    await fetchOk(
      `${this.sessionsUrl(canvasId)}/${encodeURIComponent(sessionId)}/reject`,
      { method: "POST" },
    );
  }

  async draftSvg(canvasId: string, sessionId: string): Promise<string> {
    return await (
      await fetchOk(
        `${this.sessionsUrl(canvasId)}/${encodeURIComponent(sessionId)}/draft.svg`,
      )
    ).text();
  }

  async transcript(containerId: string): Promise<SessionTranscript> {
    return await fetchJson(
      `${this.origin}/api/agent/kernel/sessions/${encodeURIComponent(containerId)}/transcript`,
    );
  }
}

function canonicalDocument(document: InteractiveCanvasDocument): InteractiveCanvasDocument {
  const validation = validateInteractiveCanvasDocument(document);
  if (!validation.ok) {
    throw new Error(`Canvas patch produced an invalid document: ${JSON.stringify(validation.issues)}`);
  }
  // Documents are compared against disk/API roundtrips, so undefined-valued keys must not survive canonicalization.
  return JSON.parse(JSON.stringify(validation.document)) as InteractiveCanvasDocument;
}

export function applyProposalOperations(
  document: InteractiveCanvasDocument,
  operations: CanvasAgentPatchOperation[],
  summary: string,
): InteractiveCanvasDocument {
  const next = reduceInteractiveCanvasState(createInteractiveCanvasState(document), {
    type: "canvas.applyAgentPatch",
    operations,
    summary,
  });
  return canonicalDocument(next.document);
}

function missingPatchFields<T extends Record<string, unknown>>(
  current: Record<string, unknown>,
  patch: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(
      ([field, value]) => !isDeepStrictEqual(current[field], value),
    ),
  ) as Partial<T>;
}

export function absentProposalOperations(
  live: InteractiveCanvasDocument,
  operations: CanvasAgentPatchOperation[],
): CanvasAgentPatchOperation[] {
  const objects = new Map(live.objects.map((object) => [object.id, object]));
  const connections = new Map(
    live.connections.map((connection) => [connection.id, connection]),
  );
  const absent: CanvasAgentPatchOperation[] = [];

  for (const operation of operations) {
    switch (operation.type) {
      case "addObject":
        if (!objects.has(operation.object.id)) absent.push(operation);
        objects.set(operation.object.id, operation.object);
        break;
      case "updateObject": {
        const current = objects.get(operation.objectId);
        if (!current) {
          throw new Error(`Cannot recover updateObject for missing ${operation.objectId}.`);
        }
        const patch = missingPatchFields(
          current as unknown as Record<string, unknown>,
          operation.patch as Record<string, unknown>,
        );
        if (Object.keys(patch).length > 0) {
          absent.push({ ...operation, patch });
        }
        objects.set(operation.objectId, {
          ...current,
          ...operation.patch,
          geometry: operation.patch.geometry
            ? { ...current.geometry, ...operation.patch.geometry }
            : current.geometry,
          style: operation.patch.style
            ? { ...current.style, ...operation.patch.style }
            : current.style,
        });
        break;
      }
      case "removeObject":
        if (objects.has(operation.objectId)) absent.push(operation);
        objects.delete(operation.objectId);
        break;
      case "addConnection":
        if (!connections.has(operation.connection.id)) absent.push(operation);
        connections.set(operation.connection.id, operation.connection);
        break;
      case "updateConnection": {
        const current = connections.get(operation.connectionId);
        if (!current) {
          throw new Error(
            `Cannot recover updateConnection for missing ${operation.connectionId}.`,
          );
        }
        const patch = missingPatchFields(
          current as unknown as Record<string, unknown>,
          operation.patch as Record<string, unknown>,
        );
        if (Object.keys(patch).length > 0) {
          absent.push({ ...operation, patch });
        }
        connections.set(operation.connectionId, {
          ...current,
          ...operation.patch,
        });
        break;
      }
      case "removeConnection":
        if (connections.has(operation.connectionId)) absent.push(operation);
        connections.delete(operation.connectionId);
        break;
    }
  }
  return absent;
}

export async function materializeAcceptedProposal(options: {
  files: CanvasFileClient;
  canvasId: string;
  live: InteractiveCanvasDocument;
  operations: CanvasAgentPatchOperation[];
  summary: string;
  prior?: InteractiveCanvasDocument;
  recoverAccepted409?: boolean;
}): Promise<{ canvas: InteractiveCanvasDocument; appliedOperationCount: number }> {
  let operations = options.operations;
  let expected: InteractiveCanvasDocument | undefined;

  if (options.recoverAccepted409) {
    if (!options.prior) {
      throw new Error("Accepted-session recovery requires the prior stage document.");
    }
    expected = applyProposalOperations(options.prior, options.operations, options.summary);
    if (isDeepStrictEqual(options.live, expected)) {
      return { canvas: options.live, appliedOperationCount: 0 };
    }
    operations = absentProposalOperations(options.live, options.operations);
  }

  const intended = applyProposalOperations(options.live, operations, options.summary);
  const verified = await options.files.putCanvas(options.canvasId, intended);
  if (!isDeepStrictEqual(verified, intended)) {
    throw new Error("Canvas PUT/GET verification did not match the materialized proposal.");
  }
  if (expected && !isDeepStrictEqual(verified, expected)) {
    throw new Error("Accepted-session recovery did not reproduce the intended document.");
  }
  return { canvas: verified, appliedOperationCount: operations.length };
}

export function proposalWouldDestroyContent(
  before: InteractiveCanvasDocument,
  after: InteractiveCanvasDocument,
): string | null {
  // The base section is an ordinary unlocked section the agent may resize,
  // recolor, and retitle — the only structural invariant is that the board
  // keeps at least one section for content to live on.
  const hasSection = after.objects.some((object) => object.type === "section");
  if (!hasSection) {
    return "the proposal leaves the board without any section";
  }
  const beforeContent = before.objects.filter((object) => object.id !== "page-frame").length;
  const afterContent = after.objects.filter((object) => object.id !== "page-frame").length;
  if (beforeContent > 0 && afterContent === 0) {
    return "the proposal destroys all board content";
  }
  return null;
}

export function transcriptEndsOnRenderDraftStart(
  transcript: SessionTranscript,
): boolean {
  for (let sessionIndex = transcript.pi_sessions.length - 1; sessionIndex >= 0; sessionIndex -= 1) {
    const turns = transcript.pi_sessions[sessionIndex]?.turns ?? [];
    for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
      const calls = turns[turnIndex]?.toolCalls ?? [];
      if (calls.length === 0) continue;
      const lastCall = calls[calls.length - 1];
      return lastCall?.toolName === "render_draft"
        && (lastCall.resultText === null || lastCall.resultText === undefined);
    }
  }
  return false;
}

export function liveScopeObjectIds(document: InteractiveCanvasDocument): string[] {
  return [
    "page-frame",
    ...document.objects
      .map((object) => object.id)
      .filter((id) => id !== "page-frame"),
  ];
}
