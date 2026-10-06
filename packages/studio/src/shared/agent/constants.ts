import type { AgentAcceptConflictAction, AgentSessionState } from "./types";

export const ACCEPT_CONFLICT_MESSAGE =
  "The board changed while the agent was working, and the proposal no longer fits. Nothing was applied.";

export const ACCEPT_CONFLICT_ACTIONS: readonly AgentAcceptConflictAction[] = [
  { intent: "discard", label: "Discard" },
  {
    intent: "retry-current-board",
    label: "Try again on the current board",
  },
];

export const INITIAL_STATE: AgentSessionState = {
  status: "idle",
  sessionId: null,
  events: [],
  previewRefreshSignal: 0,
  attemptInstructions: [],
  proposal: null,
  lastGoodProposal: null,
  abandonment: null,
  failure: null,
  acceptConflict: null,
  acceptedResult: null,
  draftAnnotations: [],
};
