import type {
  AgentAcceptResult,
  AgentSessionAbandonment,
  AgentSessionAttemptState,
  AgentSessionUiStatus,
} from "@/shared/agent";

export type AgentSessionViewStatus = AgentSessionUiStatus;

export type AgentSessionViewAttempt = Pick<
  AgentSessionAttemptState,
  "instruction" | "events"
>;

export type AgentAbandonedState = AgentSessionAbandonment;

export type AgentAcceptedNotice = Pick<AgentAcceptResult, "summary" | "rebased">;
