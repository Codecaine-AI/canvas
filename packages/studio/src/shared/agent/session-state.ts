import type { AgentSessionEvent } from "@codecaine-ai/canvas-agent/protocol";

import { INITIAL_STATE } from "./constants";
import type {
  AgentSessionAttemptState,
  AgentSessionState,
  StateAction,
} from "./types";

function abandonedState(
  state: AgentSessionState,
  reason: string,
): AgentSessionState {
  const fallback = state.lastGoodProposal;
  return {
    ...state,
    status: fallback ? "proposal-ready" : "failed",
    proposal: null,
    abandonment: {
      reason,
      attemptNumber: Math.max(1, state.attemptInstructions.length),
      fallbackProposalNumber: fallback?.n ?? null,
    },
    failure: fallback ? null : { kind: "abandoned", message: reason },
    acceptConflict: null,
  };
}

export function reduceState(
  state: AgentSessionState,
  action: StateAction,
): AgentSessionState {
  switch (action.type) {
    case "begin":
      return {
        ...INITIAL_STATE,
        status: "running",
        attemptInstructions: [action.instruction],
      };
    case "created":
      return { ...state, sessionId: action.sessionId };
    case "refine":
      return {
        ...state,
        status: "running",
        attemptInstructions: [...state.attemptInstructions, action.instruction],
        proposal: null,
        abandonment: null,
        failure: null,
        acceptConflict: null,
        acceptedResult: null,
      };
    case "reset-events":
      return { ...state, events: [] };
    case "failure":
      return {
        ...state,
        status: "failed",
        proposal: null,
        failure: action.failure,
        acceptConflict: null,
      };
    case "accept-conflict":
      return { ...state, acceptConflict: action.conflict };
    case "accepted":
      return {
        ...state,
        status: "accepted",
        proposal: null,
        abandonment: null,
        failure: null,
        acceptConflict: null,
        acceptedResult: action.result,
      };
    case "rejected":
      return {
        ...state,
        status: "rejected",
        proposal: null,
        abandonment: null,
        failure: null,
        acceptConflict: null,
      };
    case "reset":
      return INITIAL_STATE;
    case "event": {
      const event = action.event;
      const next = {
        ...state,
        events: [...state.events, event],
        previewRefreshSignal:
          state.previewRefreshSignal +
          (
            event.type === "delta" ||
            event.type === "proposal" ||
            event.type === "rendering" ||
            event.type === "proposal-ready"
            ? 1
            : 0
          ),
      };

      switch (event.type) {
        case "proposal-ready":
          return {
            ...next,
            status: "proposal-ready",
            proposal: event.proposal,
            lastGoodProposal: event.proposal,
            abandonment: null,
            failure: null,
            acceptConflict: null,
          };
        case "abandoned":
          return abandonedState(next, event.reason);
        case "error":
          return {
            ...next,
            status: "failed",
            proposal: null,
            failure: { kind: "request-failed", message: event.message },
            acceptConflict: null,
          };
        case "status":
          switch (event.status) {
            case "running":
              return {
                ...next,
                status: "running",
                proposal: null,
                abandonment: null,
                failure: null,
                acceptConflict: null,
              };
            case "proposal-ready":
              return { ...next, status: "proposal-ready", failure: null };
            case "accepted":
              return { ...next, status: "accepted", proposal: null };
            case "rejected":
              return { ...next, status: "rejected", proposal: null };
            case "abandoned":
              return abandonedState(
                next,
                next.abandonment?.reason ?? "The agent abandoned this attempt.",
              );
            case "error":
              return {
                ...next,
                status: "failed",
                proposal: null,
                failure: next.failure ?? {
                  kind: "request-failed",
                  message: "The agent session failed.",
                },
              };
          }
        case "annotations":
          return { ...next, draftAnnotations: event.annotations };
        case "fitted":
        case "proposal":
        case "delta":
        case "rendering":
          return next;
      }
    }
  }
}

export function groupAttempts(
  instructions: readonly string[],
  events: readonly AgentSessionEvent[],
): AgentSessionAttemptState[] {
  if (instructions.length === 0) return [];

  const attempts = instructions.map((instruction, index) => ({
    number: index + 1,
    instruction,
    events: [] as AgentSessionEvent[],
  }));
  let attemptIndex = 0;

  for (const event of events) {
    // The initial run starts with `fitted`; each follow-up starts with this
    // status marker. This also rebuilds grouping correctly after SSE replay.
    if (
      event.type === "status" &&
      event.status === "running" &&
      attempts[attemptIndex]!.events.length > 0 &&
      attemptIndex < attempts.length - 1
    ) {
      attemptIndex += 1;
    }
    attempts[attemptIndex]!.events.push(event);
  }

  return attempts;
}
