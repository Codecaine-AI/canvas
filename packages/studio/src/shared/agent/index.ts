// The agent session module's public surface: the session names the old src/agent/ barrel exported.
// INITIAL_STATE, AgentSessionState and StateAction stay internal (session-state.ts and the hook use them).
export { ACCEPT_CONFLICT_ACTIONS, ACCEPT_CONFLICT_MESSAGE } from "./constants";
export type {
  AgentAcceptConflict,
  AgentAcceptConflictAction,
  AgentAcceptConflictIntent,
  AgentAcceptResult,
  AgentSessionAbandonment,
  AgentSessionAttemptState,
  AgentSessionFailure,
  AgentSessionFailureKind,
  AgentSessionUiStatus,
  BeforeAgentStartSnapshot,
  UseAgentSessionOptions,
  UseAgentSessionResult,
} from "./types";
export * from "./pending-notes";
export * from "./session-client";
export * from "./useAgentSession";
