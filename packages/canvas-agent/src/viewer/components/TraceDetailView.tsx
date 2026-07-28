import { useCallback, useMemo } from "react";
import type { KernelTraceSessionDetail } from "@agent-kernel/viewer-core";
import {
  CLAMP,
  readStringAttr,
  type DetailBlockProvider,
  type DetailBlockSpec,
} from "@agent-kernel/viewer-ui";
import { TranscriptRenderStrip } from "./TranscriptMedia";
import {
  indexTranscriptToolCalls,
  useSessionTranscript,
  type TranscriptToolCallEntry,
} from "../hooks/use-transcript";

/**
 * useCanvasTraceExtensions — the canvas-specific layers over the SHARED
 * KernelTraceWorkspace (which now owns the list/drill-in/tree/detail UX):
 *
 *   - detailBlockProvider: thinking, propose_program source, and render
 *     thumbnails added to the standard tool detail without taking it over
 *
 * All joined from the session transcript (use-transcript.ts) by tool_use_id;
 * while the transcript route 404s everything quietly disappears and the
 * workspace is exactly the standard viewer.
 */
export interface CanvasTraceExtensions {
  detailBlockProvider: DetailBlockProvider;
}

export function useCanvasTraceExtensions(
  detail: KernelTraceSessionDetail | null,
): CanvasTraceExtensions {
  const containerId = detail
    ? detail.session.containerId || detail.session.id
    : null;
  const transcriptState = useSessionTranscript(containerId);
  const transcript =
    transcriptState.status === "ready" ? transcriptState.transcript : null;

  const toolCallIndex = useMemo(
    () =>
      transcript
        ? indexTranscriptToolCalls(transcript)
        : new Map<string, TranscriptToolCallEntry>(),
    [transcript],
  );

  /** The transcript tool call behind a tool_call span, joined by tool_use_id. */
  const transcriptEntryFor = useCallback(
    (
      span: Parameters<DetailBlockProvider>[0],
    ): TranscriptToolCallEntry | null => {
      const eventType = readStringAttr(span, "event_type");
      if (eventType !== "tool_call_start" && eventType !== "tool_call_end") {
        return null;
      }
      const toolUseId = readStringAttr(span, "tool_use_id");
      return (toolUseId && toolCallIndex.get(toolUseId)) || null;
    },
    [toolCallIndex],
  );

  const detailBlockProvider: DetailBlockProvider = useCallback(
    (span) => {
      if (!containerId || transcriptState.status !== "ready") return [];
      const entry = transcriptEntryFor(span);
      if (!entry) return [];

      const blocks: DetailBlockSpec[] = [];
      if (entry.turn.thinking) {
        blocks.push({
          id: "canvas:thinking",
          slot: "input",
          order: -100,
          caption: "Thinking",
          body: entry.turn.thinking,
          language: "text",
          clamp: CLAMP.tight,
        });
      }

      const program = entry.call.params?.program;
      if (
        entry.call.toolName === "propose_program" &&
        typeof program === "string"
      ) {
        blocks.push({
          id: "canvas:program",
          slot: "input",
          order: -50,
          caption: "Program",
          body: program,
          language: "text",
          clamp: CLAMP.block,
        });
      }

      const images = entry.call.images ?? [];
      if (images.length > 0) {
        blocks.push({
          id: "canvas:renders",
          slot: "media",
          caption: images.length === 1 ? "Render" : "Renders",
          node: (
            <TranscriptRenderStrip
              images={images}
              toolName={entry.call.toolName}
              turnIndex={entry.turn.index}
              containerId={containerId}
            />
          ),
        });
      }

      return blocks;
    },
    [containerId, transcriptState.status, transcriptEntryFor],
  );

  return { detailBlockProvider };
}
