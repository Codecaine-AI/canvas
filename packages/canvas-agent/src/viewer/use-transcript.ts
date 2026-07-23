import { useMemo } from "react";
import { transcriptPath } from "./kernel-api";
import { isRecord, useAgentJson } from "./use-agent-json";

/**
 * Session transcript hook — the sibling of useAgentJson for the harness's
 * `GET /kernel/sessions/:containerId/transcript` route (kernel-api.ts). The
 * transcript is the pi-session jsonl the trace events only summarize: per-turn
 * thinking, full tool params (the proposed program text), full result text,
 * and the images the agent actually saw.
 *
 * The route is feature-detected: while the harness doesn't serve it yet the
 * fetch 404s and the hook settles on "absent", which every consumer treats as
 * "render exactly what the viewer rendered before this feature existed" — no
 * error banners, at most a muted note in the inspector.
 */

export interface TranscriptImageRef {
  id: string;
  mimeType: string;
}

export interface TranscriptToolCall {
  toolUseId: string;
  toolName: string;
  params: Record<string, unknown>;
  resultText: string | null;
  isError: boolean;
  images: TranscriptImageRef[];
}

export interface TranscriptTurn {
  index: number;
  timestamp: string | null;
  thinking: string | null;
  text: string | null;
  toolCalls: TranscriptToolCall[];
}

export interface TranscriptUserMessage {
  text: string;
  timestamp: string | null;
}

export interface TranscriptPiSession {
  piSessionId: string;
  file: string;
  startedAt: string | null;
  userMessages: TranscriptUserMessage[];
  agentContext: string | null;
  turns: TranscriptTurn[];
}

export interface SessionTranscript {
  container_id: string;
  pi_sessions: TranscriptPiSession[];
}

export type SessionTranscriptState =
  | { status: "loading" }
  | { status: "absent" }
  | { status: "ready"; transcript: SessionTranscript };

export function useSessionTranscript(
  containerId: string | null,
): SessionTranscriptState {
  const state = useAgentJson(containerId ? transcriptPath(containerId) : null);
  return useMemo<SessionTranscriptState>(() => {
    if (state.status === "loading") return { status: "loading" };
    // 404 (route not built yet), 502 (harness down), or a wrong shape all
    // degrade to the same quiet "absent" — the viewer keeps working as today.
    if (state.status !== "ready" || !isSessionTranscript(state.data)) {
      return { status: "absent" };
    }
    return { status: "ready", transcript: state.data };
  }, [state]);
}

export function isSessionTranscript(value: unknown): value is SessionTranscript {
  return isRecord(value) && Array.isArray(value.pi_sessions);
}

/**
 * One image of the run, flattened into transcript order (pi sessions → turns
 * → tool calls → images), which is chronological. This is the lightbox's
 * navigation order.
 */
export interface TranscriptImageEntry {
  imageId: string;
  mimeType: string;
  toolUseId: string;
  toolName: string;
  turnIndex: number;
  piSessionId: string;
}

export function collectTranscriptImages(
  transcript: SessionTranscript,
): TranscriptImageEntry[] {
  const entries: TranscriptImageEntry[] = [];
  for (const piSession of transcript.pi_sessions) {
    for (const turn of piSession.turns ?? []) {
      for (const call of turn.toolCalls ?? []) {
        for (const image of call.images ?? []) {
          entries.push({
            imageId: image.id,
            mimeType: image.mimeType,
            toolUseId: call.toolUseId,
            toolName: call.toolName,
            turnIndex: turn.index,
            piSessionId: piSession.piSessionId,
          });
        }
      }
    }
  }
  return entries;
}

/** A transcript tool call with the turn + pi session it happened in. */
export interface TranscriptToolCallEntry {
  call: TranscriptToolCall;
  turn: TranscriptTurn;
  piSession: TranscriptPiSession;
}

/**
 * Index tool calls by toolUseId — the join key to trace events, whose
 * event_data carries the same tool_use_id (format like "call_xxx|fc_yyy").
 * Transcript calls with no matching trace event are simply not indexed; the
 * inspector only surfaces calls a trace span joins to.
 */
export function indexTranscriptToolCalls(
  transcript: SessionTranscript,
): Map<string, TranscriptToolCallEntry> {
  const index = new Map<string, TranscriptToolCallEntry>();
  for (const piSession of transcript.pi_sessions) {
    for (const turn of piSession.turns ?? []) {
      for (const call of turn.toolCalls ?? []) {
        if (call.toolUseId && !index.has(call.toolUseId)) {
          index.set(call.toolUseId, { call, turn, piSession });
        }
      }
    }
  }
  return index;
}
