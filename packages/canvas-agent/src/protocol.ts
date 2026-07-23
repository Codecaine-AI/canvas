/**
 * @codecaine-ai/canvas-agent/protocol — the wire format between the layout
 * harness (Bun sibling service on :4820) and studio's browser code.
 *
 * Types ONLY: no runtime imports, no pipeline imports, no kernel imports.
 * Studio's client and the harness routes both import from here so the session
 * DTOs, SSE event shapes, and delta-report structure have one source of truth
 * (HARNESS-SETUP-PLAN.md §2).
 *
 * The geometry/patch shapes are duplicated structurally (rather than imported
 * from @codecaine-ai/canvas) to keep this module dependency-free; they must
 * stay assignment-compatible with CanvasGeometry / CanvasAgentPatchOperation.
 */

export interface AgentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Structural mirror of InteractiveCanvasAnnotation (schema/annotations.ts). */
export interface AgentSessionAnnotation {
  id: string;
  intent: string;
  body: string;
  target:
    | { kind: "object"; objectId: string }
    | { kind: "connection"; connectionId: string }
    | { kind: "region"; region: AgentRect };
  status?: string;
  createdBy?: "human" | "agent" | "system";
  [key: string]: unknown;
}

/** The editor viewport at invoke time (world-space rect + zoom). */
export interface AgentSessionViewport {
  rect: AgentRect;
  zoom?: number;
}

/** Body of POST /api/canvases/:id/agent/sessions. */
export interface CreateAgentSessionRequest {
  canvasId: string;
  scopeObjectIds: string[];
  instruction: string;
  annotations?: AgentSessionAnnotation[];
  viewport?: AgentSessionViewport;
  /** The editor's hash of the saved file at invoke time (advisory; the harness rehashes). */
  baselineHash?: string;
}

export interface CreateAgentSessionResponse {
  sessionId: string;
  /** The authoritative hash of the canvas file the session was fitted from. */
  baselineHash: string;
  containerId: string;
}

export type AgentSessionStatus =
  | "running"
  | "proposal-ready"
  | "accepted"
  | "rejected"
  | "abandoned"
  | "error";

/** Structural mirror of CanvasAgentPatchOperation (canvas/actions). */
export type AgentPatchOperation =
  | { type: "addObject"; object: Record<string, unknown> }
  | { type: "updateObject"; objectId: string; patch: Record<string, unknown> }
  | { type: "removeObject"; objectId: string }
  | { type: "addConnection"; connection: Record<string, unknown> }
  | { type: "updateConnection"; connectionId: string; patch: Record<string, unknown> }
  | { type: "removeConnection"; connectionId: string };

/** One committed proposal: the harness's final output for studio to apply. */
export interface AgentProposal {
  /** 1-based proposal ordinal within the session. */
  n: number;
  operations: AgentPatchOperation[];
  /** The agent's one-line commit summary. */
  summary: string;
  /** The plain-language delta report for the proposed document patch. */
  delta: string;
  /** The lint report text for the committed draft. */
  lint: string;
}

export interface AgentSessionState {
  sessionId: string;
  canvasId: string;
  status: AgentSessionStatus;
  instruction: string;
  scopeObjectIds: string[];
  frame: AgentRect;
  baselineHash: string;
  /** Number of draft revisions proposed so far. */
  proposalCount: number;
  /** The committed proposal, once the agent called commit. */
  proposal: AgentProposal | null;
  error: string | null;
}

/** Body of POST .../sessions/:sid/message (refine — same session, new run). */
export interface AgentSessionMessageRequest {
  instruction: string;
  annotations?: AgentSessionAnnotation[];
  viewport?: AgentSessionViewport;
}

/** 200 body of POST .../sessions/:sid/accept. */
export interface AcceptAgentSessionResponse {
  operations: AgentPatchOperation[];
  summary: string;
  /** True when the live file changed and the proposal was safely rebased. */
  rebased: boolean;
}

/** 409 body of POST .../sessions/:sid/accept (rebase conflict, plain language). */
export interface AcceptAgentSessionConflict {
  error: string;
}

// ---------------------------------------------------------------------------
// SSE events (GET .../sessions/:sid/events)
// ---------------------------------------------------------------------------

/** Emitted once the session exists and the scope has been fitted. */
export interface AgentFittedEvent {
  type: "fitted";
  sessionId: string;
  frame: AgentRect;
  scopeObjectIds: string[];
  boundaryArrowCount: number;
}

/** Emitted when the draft changes. */
export interface AgentProposalEvent {
  type: "proposal";
  sessionId: string;
  n: number;
}

/** Emitted right after each proposal with its delta + lint reports. */
export interface AgentDeltaEvent {
  type: "delta";
  sessionId: string;
  n: number;
  delta: string;
  lint: string;
}

/** Emitted when the agent asks for a render of the current draft. */
export interface AgentRenderingEvent {
  type: "rendering";
  sessionId: string;
  n: number;
}

/** Emitted when the agent committed: the proposal is ready to accept. */
export interface AgentProposalReadyEvent {
  type: "proposal-ready";
  sessionId: string;
  proposal: AgentProposal;
}

export interface AgentErrorEvent {
  type: "error";
  sessionId: string;
  message: string;
}

export interface AgentAbandonedEvent {
  type: "abandoned";
  sessionId: string;
  reason: string;
}

/** Session status transitions not covered by the specific events above. */
export interface AgentStatusEvent {
  type: "status";
  sessionId: string;
  status: AgentSessionStatus;
}

export type AgentSessionEvent =
  | AgentFittedEvent
  | AgentProposalEvent
  | AgentDeltaEvent
  | AgentRenderingEvent
  | AgentProposalReadyEvent
  | AgentErrorEvent
  | AgentAbandonedEvent
  | AgentStatusEvent;

// ---------------------------------------------------------------------------
// Catalog DTOs (GET/PUT /api/agent/catalog/:agent)
// ---------------------------------------------------------------------------

/** GET /api/agent/catalog/:agent — manifest + prompt document + rendered snapshot. */
export interface AgentCatalogDetail {
  manifest: Record<string, unknown>;
  /** The canonical PromptDocument (prompt-kit/v1). */
  prompt: Record<string, unknown>;
  promptHash: string;
  /** The rendered system-prompt snapshot (prompt.rendered.md body). */
  rendered: string;
  declaredVariables: string[];
  modelAliases: string[];
}

/** 200 body of PUT /api/agent/catalog/:agent/prompt. */
export interface AgentCatalogPromptSaveResponse {
  ok: true;
  promptHash: string;
}

export interface AgentCatalogPromptSaveError {
  ok: false;
  errors: string[];
}
