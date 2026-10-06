"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCanvasStyle, type InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import type { AgentProposal, AgentRect } from "@codecaine-ai/canvas-agent/protocol";
import { classifyChanges } from "../../classify-changes";
import { ChangeChip } from "./_components/ChangeChip";
import { ChangeOutline } from "./_components/ChangeOutline";
import { HALO_SPREAD, MARK_RADIUS, MARK_WIDTH } from "./constants";
import type { DraftPreview } from "./types";
import { markColors, parseViewBox, rectStyle } from "./utils";

export type GhostPreviewLayerProps = {
  canvasId: string;
  sessionId: string | null;
  /** Increment whenever an operation, proposal, or rendering event arrives. */
  refreshSignal: number;
  baselineDocument: InteractiveCanvasDocument;
  /** Pass the active proposal, or the last good proposal after an abandoned follow-up. */
  proposal: AgentProposal | null;
  /** The fitted scope frame. The SVG's viewBox is used when this is omitted. */
  workFrame?: AgentRect | null;
  /** Shares the parsed SVG viewBox with GhostPreviewScrim in the screen overlay. */
  onPreviewRectChange?: (rect: AgentRect | null) => void;
};

/**
 * Mount in InteractiveCanvasEditor's `worldOverlay`. The fetched standalone
 * SVG is sized to its own world-coordinate viewBox, so the stage's existing
 * transform keeps the draft aligned with the live board at every pan/zoom.
 */
export function GhostPreviewLayer({
  canvasId,
  sessionId,
  refreshSignal,
  baselineDocument,
  proposal,
  workFrame,
  onPreviewRectChange,
}: GhostPreviewLayerProps) {
  const [draft, setDraft] = useState<DraftPreview | null>(null);
  const onPreviewRectChangeRef = useRef(onPreviewRectChange);
  onPreviewRectChangeRef.current = onPreviewRectChange;

  useEffect(() => {
    setDraft(null);
    onPreviewRectChangeRef.current?.(null);
  }, [canvasId, sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const controller = new AbortController();
    const url = `/api/canvases/${encodeURIComponent(canvasId)}/agent/sessions/${encodeURIComponent(sessionId)}/draft.svg`;

    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Draft preview failed (${response.status}).`);
        const svg = await response.text();
        const rect = parseViewBox(svg);
        if (!rect) throw new Error("Draft preview has no usable viewBox.");
        return { rect, svg };
      })
      .then((nextDraft) => {
        if (controller.signal.aborted) return;
        setDraft(nextDraft);
        onPreviewRectChangeRef.current?.(nextDraft.rect);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // Session-level error UI owns degraded-state copy. Keep the last
        // successfully fetched ghost during a transient preview failure.
        if (error instanceof Error) console.warn(error.message);
      });

    return () => controller.abort();
  }, [canvasId, refreshSignal, sessionId]);

  useEffect(
    () => () => {
      onPreviewRectChangeRef.current?.(null);
    },
    [],
  );

  const changes = useMemo(
    () => (proposal ? classifyChanges(baselineDocument, proposal.operations) : null),
    [baselineDocument, proposal],
  );
  const displacedIds = useMemo(
    () => new Set(changes?.displaced.map((change) => change.id) ?? []),
    [changes],
  );
  const frame = workFrame ?? draft?.rect ?? null;
  const style = useCanvasStyle();
  const colors = useMemo(() => markColors(style), [style]);

  if (!draft) return null;

  return (
    <div data-agent-ghost-preview="true" style={{ pointerEvents: "none" }} aria-hidden="true">
      <div
        className="[&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        data-agent-draft-svg="true"
        style={{ ...rectStyle(draft.rect), zIndex: 0, overflow: "hidden" }}
        dangerouslySetInnerHTML={{ __html: draft.svg }}
      />

      {frame ? (
        <div
          data-agent-work-frame="true"
          style={{
            ...rectStyle(frame),
            zIndex: 1,
            border: `${MARK_WIDTH} solid ${colors.agent}`,
            borderRadius: MARK_RADIUS,
            boxShadow: `0 0 0 ${HALO_SPREAD} color-mix(in srgb, ${colors.agent} 10%, transparent)`,
          }}
        />
      ) : null}

      {changes?.moved
        .filter((change) => !displacedIds.has(change.id))
        .map((change) => (
          <ChangeOutline
            key={`moved-${change.id}`}
            change={change}
            color={colors.agent}
            surface={colors.surface}
            className="moved"
          />
        ))}
      {changes?.displaced.map((change) => (
        <ChangeOutline
          key={`displaced-${change.id}`}
          change={change}
          color={colors.displaced}
          surface={colors.surface}
          className="displaced"
        />
      ))}
      {changes?.created.map((change) => (
        <ChangeChip
          key={`created-${change.id}`}
          change={change}
          label="new"
          color={colors.agent}
          onColor={colors.agentOn}
        />
      ))}
      {changes?.removed.map((change) => (
        <ChangeChip
          key={`removed-${change.id}`}
          change={change}
          label="removed"
          color={colors.removed}
          onColor={colors.removedOn}
          dashed
        />
      ))}
    </div>
  );
}
