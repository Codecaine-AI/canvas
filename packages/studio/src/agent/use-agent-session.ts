import type {
  CanvasAgentPatchOperation,
  InteractiveCanvasAnnotation,
  InteractiveCanvasConnection,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas";
import type {
  AgentPatchOperation,
  AgentProposal,
  AgentSessionEvent,
  AgentSessionMessageRequest,
  AgentSessionViewport,
  CreateAgentSessionResponse,
} from "@codecaine-ai/canvas-agent/protocol";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import {
  AgentSessionClientError,
  accept as acceptSession,
  createSession,
  reject as rejectSession,
  sendMessage,
  subscribe,
  type CreateSessionBody,
} from "./session-client";

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

export const ACCEPT_CONFLICT_MESSAGE =
  "The board changed while the agent was working, and the proposal no longer fits. Nothing was applied.";

export const ACCEPT_CONFLICT_ACTIONS: readonly AgentAcceptConflictAction[] = [
  { intent: "discard", label: "Discard" },
  {
    intent: "retry-current-board",
    label: "Try again on the current board",
  },
];

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
  start(payload: CreateSessionBody): Promise<CreateAgentSessionResponse | null>;
  refine(instruction: string): Promise<boolean>;
  accept(): Promise<AgentAcceptResult | null>;
  reject(): Promise<void>;
  stop(): Promise<void>;
  /** Clears a settled surface so the sidebar can show the queue again. */
  reset(): void;
}

interface AgentSessionState {
  status: AgentSessionUiStatus;
  sessionId: string | null;
  events: AgentSessionEvent[];
  attemptInstructions: string[];
  proposal: AgentProposal | null;
  lastGoodProposal: AgentProposal | null;
  abandonment: AgentSessionAbandonment | null;
  failure: AgentSessionFailure | null;
  acceptConflict: AgentAcceptConflict | null;
  acceptedResult: AgentAcceptResult | null;
}

type StateAction =
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

const INITIAL_STATE: AgentSessionState = {
  status: "idle",
  sessionId: null,
  events: [],
  attemptInstructions: [],
  proposal: null,
  lastGoodProposal: null,
  abandonment: null,
  failure: null,
  acceptConflict: null,
  acceptedResult: null,
};

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

function reduceState(
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
      const next = { ...state, events: [...state.events, action.event] };
      const event = action.event;

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
        case "fitted":
        case "proposal":
        case "delta":
        case "rendering":
          return next;
      }
    }
  }
}

function failureFrom(error: unknown): AgentSessionFailure {
  if (
    error instanceof AgentSessionClientError &&
    error.kind === "harness-unavailable"
  ) {
    return { kind: "harness-unavailable", message: error.message };
  }
  return {
    kind: "request-failed",
    message: error instanceof Error ? error.message : String(error),
  };
}

type CanvasOperation<Type extends CanvasAgentPatchOperation["type"]> = Extract<
  CanvasAgentPatchOperation,
  { type: Type }
>;

/**
 * The protocol intentionally mirrors the canvas patch type without importing
 * it, so its nested payloads arrive as records. Keep the bridge at this wire
 * boundary and exhaustively reconstruct the canvas union.
 */
function toCanvasOperation(
  operation: AgentPatchOperation,
): CanvasAgentPatchOperation {
  switch (operation.type) {
    case "addObject":
      return {
        type: "addObject",
        object: operation.object as unknown as InteractiveCanvasObject,
      };
    case "updateObject":
      return {
        type: "updateObject",
        objectId: operation.objectId,
        patch: operation.patch as unknown as CanvasOperation<"updateObject">["patch"],
      };
    case "removeObject":
      return { type: "removeObject", objectId: operation.objectId };
    case "addConnection":
      return {
        type: "addConnection",
        connection: operation.connection as unknown as InteractiveCanvasConnection,
      };
    case "updateConnection":
      return {
        type: "updateConnection",
        connectionId: operation.connectionId,
        patch: operation.patch as unknown as CanvasOperation<"updateConnection">["patch"],
      };
    case "removeConnection":
      return {
        type: "removeConnection",
        connectionId: operation.connectionId,
      };
    case "addAnnotation":
      return {
        type: "addAnnotation",
        annotation: operation.annotation as unknown as InteractiveCanvasAnnotation,
      };
    case "removeAnnotation":
      return {
        type: "removeAnnotation",
        annotationId: operation.annotationId,
      };
    case "fitSectionToChildren":
      return {
        type: "fitSectionToChildren",
        sectionId: operation.sectionId,
        padding: operation.padding,
      };
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

function groupAttempts(
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

function invokeSnapshot(
  value: void | BeforeAgentStartSnapshot,
): BeforeAgentStartSnapshot {
  return value ?? {};
}

function refineSnapshot(
  value: BeforeAgentStartSnapshot,
): Omit<AgentSessionMessageRequest, "instruction"> {
  const snapshot: Omit<AgentSessionMessageRequest, "instruction"> = {};
  if (value.annotations !== undefined) snapshot.annotations = value.annotations;
  if (value.viewport !== undefined) {
    snapshot.viewport = value.viewport as AgentSessionViewport;
  }
  return snapshot;
}

export function useAgentSession({
  canvasId,
  beforeStart,
  dispatchAgentPatch,
}: UseAgentSessionOptions): UseAgentSessionResult {
  const [state, dispatch] = useReducer(reduceState, INITIAL_STATE);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const liveSessionRef = useRef(false);
  const generationRef = useRef(0);
  const streamErrorCountRef = useRef(0);
  const consumedNoteIdsRef = useRef<string[]>([]);
  const canvasIdRef = useRef(canvasId);
  const beforeStartRef = useRef(beforeStart);
  const dispatchAgentPatchRef = useRef(dispatchAgentPatch);
  canvasIdRef.current = canvasId;
  beforeStartRef.current = beforeStart;
  dispatchAgentPatchRef.current = dispatchAgentPatch;

  const closeSubscription = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  const start = useCallback(
    async (
      payload: CreateSessionBody,
    ): Promise<CreateAgentSessionResponse | null> => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      closeSubscription();
      sessionIdRef.current = null;
      liveSessionRef.current = false;
      streamErrorCountRef.current = 0;
      consumedNoteIdsRef.current = [];
      dispatch({ type: "begin", instruction: payload.instruction });

      try {
        const freshSnapshot = invokeSnapshot(await beforeStartRef.current());
        if (generation !== generationRef.current) return null;

        const effectivePayload: CreateSessionBody = {
          ...payload,
          ...freshSnapshot,
        };
        consumedNoteIdsRef.current = [
          ...new Set((effectivePayload.annotations ?? []).map(({ id }) => id)),
        ];

        const response = await createSession(canvasIdRef.current, effectivePayload);
        if (generation !== generationRef.current) return null;

        sessionIdRef.current = response.sessionId;
        liveSessionRef.current = true;
        dispatch({ type: "created", sessionId: response.sessionId });

        unsubscribeRef.current = subscribe(
          canvasIdRef.current,
          response.sessionId,
          {
            onReset: () => {
              if (generation === generationRef.current) {
                dispatch({ type: "reset-events" });
              }
            },
            onEvent: (event) => {
              if (generation !== generationRef.current) return;
              if (
                event.type === "status" &&
                (event.status === "accepted" || event.status === "rejected")
              ) {
                liveSessionRef.current = false;
              }
              dispatch({ type: "event", event });
            },
            onError: (error) => {
              if (generation !== generationRef.current) return;
              streamErrorCountRef.current += 1;
              // EventSource reconnects itself. Keep the first transport drop
              // silent; a second failure becomes an actionable session error.
              if (streamErrorCountRef.current === 1) return;
              closeSubscription();
              dispatch({
                type: "failure",
                failure: {
                  kind: "stream",
                  message: error instanceof Error ? error.message : String(error),
                },
              });
            },
          },
        );

        return response;
      } catch (error) {
        if (generation === generationRef.current) {
          dispatch({ type: "failure", failure: failureFrom(error) });
        }
        return null;
      }
    },
    [closeSubscription],
  );

  const refine = useCallback(async (instruction: string): Promise<boolean> => {
    const sessionId = sessionIdRef.current;
    const trimmedInstruction = instruction.trim();
    if (!sessionId || !trimmedInstruction) return false;

    const generation = generationRef.current;
    dispatch({ type: "refine", instruction: trimmedInstruction });
    try {
      const freshSnapshot = invokeSnapshot(await beforeStartRef.current());
      if (generation !== generationRef.current) return false;
      await sendMessage(canvasIdRef.current, sessionId, {
        instruction: trimmedInstruction,
        ...refineSnapshot(freshSnapshot),
      });
      return generation === generationRef.current;
    } catch (error) {
      if (generation === generationRef.current) {
        dispatch({ type: "failure", failure: failureFrom(error) });
      }
      return false;
    }
  }, []);

  const accept = useCallback(async (): Promise<AgentAcceptResult | null> => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return null;
    const generation = generationRef.current;

    try {
      const response = await acceptSession(canvasIdRef.current, sessionId);
      if (generation !== generationRef.current) return null;

      const operations: CanvasAgentPatchOperation[] = [
        ...response.operations.map(toCanvasOperation),
        ...consumedNoteIdsRef.current.map(
          (annotationId) =>
            ({
              type: "removeAnnotation",
              annotationId,
            }) satisfies AgentPatchOperation,
        ),
      ];
      const result: AgentAcceptResult = {
        operations,
        summary: response.summary,
        rebased: response.rebased,
      };

      dispatchAgentPatchRef.current(operations, response.summary);
      liveSessionRef.current = false;
      closeSubscription();
      dispatch({ type: "accepted", result });
      return result;
    } catch (error) {
      if (generation !== generationRef.current) return null;
      if (
        error instanceof AgentSessionClientError &&
        error.kind === "conflict"
      ) {
        dispatch({
          type: "accept-conflict",
          conflict: {
            message: ACCEPT_CONFLICT_MESSAGE,
            detail: error.message,
            actions: ACCEPT_CONFLICT_ACTIONS,
          },
        });
      } else {
        dispatch({ type: "failure", failure: failureFrom(error) });
      }
      return null;
    }
  }, [closeSubscription]);

  const reject = useCallback(async (): Promise<void> => {
    const sessionId = sessionIdRef.current;
    generationRef.current += 1;
    closeSubscription();
    sessionIdRef.current = null;
    liveSessionRef.current = false;
    dispatch({ type: "rejected" });
    if (!sessionId) return;

    try {
      await rejectSession(canvasIdRef.current, sessionId);
    } catch {
      // Reject/Stop is also the local detach path. The harness never writes
      // the canvas file, so an unreachable orphan can safely finish alone.
    }
  }, [closeSubscription]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    closeSubscription();
    sessionIdRef.current = null;
    liveSessionRef.current = false;
    streamErrorCountRef.current = 0;
    consumedNoteIdsRef.current = [];
    dispatch({ type: "reset" });
  }, [closeSubscription]);

  useEffect(() => {
    return () => {
      const sessionId = sessionIdRef.current;
      closeSubscription();
      if (sessionId && liveSessionRef.current) {
        void rejectSession(canvasIdRef.current, sessionId).catch(() => {});
      }
    };
  }, [closeSubscription]);

  const attempts = useMemo(
    () => groupAttempts(state.attemptInstructions, state.events),
    [state.attemptInstructions, state.events],
  );

  return {
    status: state.status,
    sessionId: state.sessionId,
    events: state.events,
    attempts,
    proposal: state.proposal,
    lastGoodProposal: state.lastGoodProposal,
    abandonment: state.abandonment,
    failure: state.failure,
    error: state.failure?.message ?? null,
    harnessUnavailable: state.failure?.kind === "harness-unavailable",
    acceptConflict: state.acceptConflict,
    acceptedResult: state.acceptedResult,
    start,
    refine,
    accept,
    reject,
    stop: reject,
    reset,
  };
}
