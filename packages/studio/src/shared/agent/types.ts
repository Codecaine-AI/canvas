import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas";
import type {
  AgentProposal,
  AgentSessionAnnotation,
  AgentSessionEvent,
  CreateAgentSessionResponse,
} from "@codecaine-ai/canvas-agent/protocol";

import type { CreateSessionBody } from "./session-client";

export type AgentSessionUiStatus =
  | "idle"
  | "running"
  | "proposal-ready"
  | "accepted"
  | "rejected"
  | "failed";

export type AgentSessionFailureKind =
  | "abandoned"
  | "harness-unavailable"
  | "request-failed"
  | "stream";

export interface AgentSessionFailure {
  kind: AgentSessionFailureKind;
  message: string;
}

export interface AgentSessionAbandonment {
  reason: string;
  /** The 1-based initial/refine attempt that was abandoned. */
  attemptNumber: number;
  /** The proposal that remains acceptable, when an earlier attempt committed. */
  fallbackProposalNumber: number | null;
}

export type AgentAcceptConflictIntent = "discard" | "retry-current-board";

export interface AgentAcceptConflictAction {
  intent: AgentAcceptConflictIntent;
  label: "Discard" | "Try again on the current board";
}

export interface AgentAcceptConflict {
  message: string;
  /** The server's more specific reason, retained for diagnostics. */
  detail: string;
  actions: readonly AgentAcceptConflictAction[];
}

export interface AgentSessionAttemptState {
  number: number;
  instruction: string;
  events: AgentSessionEvent[];
}

export interface AgentAcceptResult {
  operations: CanvasAgentPatchOperation[];
  summary: string;
  rebased: boolean;
}

/**
 * A flush callback may also return freshly captured invoke context. Returning
 * nothing is the normal case when the caller only needs to await autosave.
 */
export type BeforeAgentStartSnapshot = Partial<
  Pick<CreateSessionBody, "annotations" | "viewport" | "baselineHash">
>;

export interface UseAgentSessionOptions {
  canvasId: string;
  beforeStart: () =>
    | void
    | BeforeAgentStartSnapshot
    | Promise<void | BeforeAgentStartSnapshot>;
  dispatchAgentPatch: (
    operations: CanvasAgentPatchOperation[],
    summary?: string,
  ) => void;
}

export interface UseAgentSessionResult {
  status: AgentSessionUiStatus;
  sessionId: string | null;
  events: AgentSessionEvent[];
  /** Advances whenever the server may have updated the rendered draft. */
  previewRefreshSignal: number;
  attempts: AgentSessionAttemptState[];
  /** The proposal committed by the current attempt, if it has one. */
  proposal: AgentProposal | null;
  /** Survives refine and is the accept/ghost fallback after abandonment. */
  lastGoodProposal: AgentProposal | null;
  abandonment: AgentSessionAbandonment | null;
  failure: AgentSessionFailure | null;
  error: string | null;
  harnessUnavailable: boolean;
  acceptConflict: AgentAcceptConflict | null;
  acceptedResult: AgentAcceptResult | null;
  /**
   * The draft's annotation threads as of the last harness announcement — the
   * agent opening a thread, replying, or closing one mid-run.
   */
  draftAnnotations: AgentSessionAnnotation[];
  start(payload: CreateSessionBody): Promise<CreateAgentSessionResponse | null>;
  refine(instruction: string): Promise<boolean>;
  accept(): Promise<AgentAcceptResult | null>;
  reject(): Promise<void>;
  stop(): Promise<void>;
  /** Clears a settled surface so the sidebar can show the queue again. */
  reset(): void;
}

export interface AgentSessionState {
  status: AgentSessionUiStatus;
  sessionId: string | null;
  events: AgentSessionEvent[];
  previewRefreshSignal: number;
  attemptInstructions: string[];
  proposal: AgentProposal | null;
  lastGoodProposal: AgentProposal | null;
  abandonment: AgentSessionAbandonment | null;
  failure: AgentSessionFailure | null;
  acceptConflict: AgentAcceptConflict | null;
  acceptedResult: AgentAcceptResult | null;
  /** The draft's annotation threads as the harness last announced them. */
  draftAnnotations: AgentSessionAnnotation[];
}

export type StateAction =
  | { type: "begin"; instruction: string }
  | { type: "created"; sessionId: string }
  | { type: "refine"; instruction: string }
  | { type: "reset-events" }
  | { type: "event"; event: AgentSessionEvent }
  | { type: "failure"; failure: AgentSessionFailure }
  | { type: "accept-conflict"; conflict: AgentAcceptConflict }
  | { type: "accepted"; result: AgentAcceptResult }
  | { type: "rejected" }
  | { type: "reset" };
