import type { CreateAgentSessionResponse } from "@codecaine-ai/canvas-agent/protocol";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import {
  ACCEPT_CONFLICT_ACTIONS,
  ACCEPT_CONFLICT_MESSAGE,
  INITIAL_STATE,
} from "./constants";
import { groupAttempts, reduceState } from "./session-state";
import {
  AgentSessionClientError,
  accept as acceptSession,
  createSession,
  reject as rejectSession,
  sendMessage,
  subscribe,
  type CreateSessionBody,
} from "./session-client";
import type {
  AgentAcceptResult,
  UseAgentSessionOptions,
  UseAgentSessionResult,
} from "./types";
import {
  failureFrom,
  invokeSnapshot,
  refineSnapshot,
  toCanvasOperation,
} from "./wire";

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
      dispatch({ type: "begin", instruction: payload.instruction });

      try {
        const freshSnapshot = invokeSnapshot(await beforeStartRef.current());
        if (generation !== generationRef.current) return null;

        const effectivePayload: CreateSessionBody = {
          ...payload,
          ...freshSnapshot,
        };

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

      const operations = response.operations.map(toCanvasOperation);
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
    previewRefreshSignal: state.previewRefreshSignal,
    attempts,
    proposal: state.proposal,
    lastGoodProposal: state.lastGoodProposal,
    abandonment: state.abandonment,
    failure: state.failure,
    error: state.failure?.message ?? null,
    harnessUnavailable: state.failure?.kind === "harness-unavailable",
    acceptConflict: state.acceptConflict,
    acceptedResult: state.acceptedResult,
    draftAnnotations: state.draftAnnotations,
    start,
    refine,
    accept,
    reject,
    stop: reject,
    reset,
  };
}
