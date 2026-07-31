import { useMemo } from "react";
import type { KernelTraceSessionDetail } from "@agent-kernel/viewer-core";
import type { DetailBlockProvider } from "@agent-kernel/viewer-ui";
import type { CanvasViewerExtensionContext } from "../../viewer-extension";
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
  apiBase: string,
  createProvider: (
    context: CanvasViewerExtensionContext,
  ) => DetailBlockProvider,
): CanvasTraceExtensions {
  const containerId = detail
    ? detail.session.containerId || detail.session.id
    : null;
  const transcriptState = useSessionTranscript(containerId, apiBase);
  const transcript =
    transcriptState.status === "ready" ? transcriptState.transcript : null;

  const toolCallIndex = useMemo(
    () =>
      transcript
        ? indexTranscriptToolCalls(transcript)
        : new Map<string, TranscriptToolCallEntry>(),
    [transcript],
  );

  const detailBlockProvider = useMemo(
    () =>
      createProvider({
        apiBase,
        transcript:
          containerId && transcriptState.status === "ready"
            ? { containerId, toolCallIndex }
            : undefined,
      }),
    [
      apiBase,
      containerId,
      createProvider,
      toolCallIndex,
      transcriptState.status,
    ],
  );

  return { detailBlockProvider };
}
