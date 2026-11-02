/**
 * The layout session's event and proposal shapes: what the tools emit and
 * record on a LayoutSession (./session).
 *
 * Types ONLY: no runtime imports. The geometry/patch shapes are duplicated
 * structurally (rather than imported from the schema) to keep this module
 * dependency-free; they must stay assignment-compatible with CanvasGeometry /
 * CanvasAgentPatchOperation.
 */

export interface AgentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Structural mirror of CanvasAnnotationReply (schema/annotations.ts). */
export interface AgentSessionAnnotationReply {
  id: string;
  author: "human" | "agent" | "system";
  body: string;
  createdAt?: string;
}

/**
 * Structural mirror of InteractiveCanvasAnnotation (schema/annotations.ts):
 * one thread, whose `body`/`createdBy` are the opening post and whose
 * `replies` carry everything said since, oldest first.
 */
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
  replies?: AgentSessionAnnotationReply[];
  [key: string]: unknown;
}

/** The editor viewport at invoke time (world-space rect + zoom). */
export interface AgentSessionViewport {
  rect: AgentRect;
  zoom?: number;
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
  | { type: "updateTitle"; title: string }
  | { type: "updateDescription"; description: string }
  | { type: "addObject"; object: Record<string, unknown> }
  | { type: "updateObject"; objectId: string; patch: Record<string, unknown> }
  | { type: "removeObject"; objectId: string }
  | { type: "addConnection"; connection: Record<string, unknown> }
  | { type: "updateConnection"; connectionId: string; patch: Record<string, unknown> }
  | { type: "removeConnection"; connectionId: string }
  // Annotation threads. A thread that disappears with its target rides the
  // removeObject/removeConnection cascade, so there is no removal variant.
  | { type: "addAnnotation"; annotation: Record<string, unknown> }
  | { type: "appendAnnotationReply"; annotationId: string; reply: Record<string, unknown> }
  | {
      type: "setAnnotationStatus";
      annotationId: string;
      status: "open" | "applied" | "resolved";
    };

/** One committed proposal: the draft's patch, summary and reports. */
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

// ---------------------------------------------------------------------------
// Session events
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

/**
 * Reserved: renders are pushed with apply results, so nothing emits this
 * today; the type stays so existing SSE consumers keep compiling.
 */
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

/**
 * Emitted whenever the draft's annotation threads change — a thread opened, a
 * reply appended, a status set. Carries the full thread list so studio can
 * re-render the queue without re-reading the draft.
 */
export interface AgentAnnotationsEvent {
  type: "annotations";
  sessionId: string;
  annotations: AgentSessionAnnotation[];
}

export interface AgentErrorEvent {
  type: "error";
  sessionId: string;
  message: string;
}

/** Emitted when the agent finalized with outcome none: no proposal was made. */
export interface AgentAbandonedEvent {
  type: "abandoned";
  sessionId: string;
  /** The agent's operator-facing explanation (the finalize message). */
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
  | AgentAnnotationsEvent
  | AgentErrorEvent
  | AgentAbandonedEvent
  | AgentStatusEvent;
