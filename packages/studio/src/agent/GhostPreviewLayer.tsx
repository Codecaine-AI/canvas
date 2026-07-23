"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  worldToScreen,
  type InteractiveCanvasDocument,
  type ViewportState,
} from "@codecaine-ai/canvas";
import type { AgentProposal, AgentRect } from "@codecaine-ai/canvas-agent/protocol";
import { classifyChanges, type MovedChange, type ObjectRectChange } from "./classify-changes";

const AGENT_COLOR = "#8C2EF2";
const DISPLACED_COLOR = "#2563EB";
const REMOVED_COLOR = "#B42318";
const SCRIM_COLOR = "rgba(17, 24, 39, 0.14)";

type DraftPreview = {
  rect: AgentRect;
  svg: string;
};

export interface GhostPreviewLayerProps {
  canvasId: string;
  sessionId: string | null;
  /** Increment when a proposal or rendering event arrives. */
  refreshSignal: number;
  baselineDocument: InteractiveCanvasDocument;
  /** Pass the active proposal, or the last good proposal after an abandoned follow-up. */
  proposal: AgentProposal | null;
  /** The fitted scope frame. The SVG's viewBox is used when this is omitted. */
  workFrame?: AgentRect | null;
  /** Shares the parsed SVG viewBox with GhostPreviewScrim in the screen overlay. */
  onPreviewRectChange?: (rect: AgentRect | null) => void;
}

function parseViewBox(svg: string): AgentRect | null {
  const match = svg.match(
    /\bviewBox\s*=\s*["']\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)[,\s]+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)[,\s]+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)[,\s]+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*["']/i,
  );
  if (!match) return null;

  const [x, y, width, height] = match.slice(1).map(Number);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

function rectStyle(rect: AgentRect): CSSProperties {
  return {
    position: "absolute",
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: "border-box",
    pointerEvents: "none",
  };
}

function ChangeOutline({
  change,
  color,
  className,
}: {
  change: MovedChange;
  color: string;
  className: string;
}) {
  return (
    <>
      <div
        data-agent-change={className}
        data-agent-object-id={change.id}
        style={{
          ...rectStyle(change.from),
          zIndex: 2,
          border: `2px dashed ${color}`,
          borderRadius: "10px",
          background: "rgba(255, 255, 255, 0.16)",
        }}
      />
      <div
        data-agent-change={`${className}-destination`}
        data-agent-object-id={change.id}
        style={{
          ...rectStyle(change.to),
          zIndex: 2,
          border: `1px solid ${color}`,
          borderRadius: "10px",
          background: `color-mix(in srgb, ${color} 13%, transparent)`,
        }}
      />
    </>
  );
}

function ChangeChip({
  change,
  label,
  color,
  dashed = false,
}: {
  change: ObjectRectChange;
  label: "new" | "removed";
  color: string;
  dashed?: boolean;
}) {
  const { rect } = change;
  return (
    <>
      {dashed ? (
        <div
          data-agent-change={label}
          data-agent-object-id={change.id}
          style={{
            ...rectStyle(rect),
            zIndex: 2,
            border: `2px dashed ${color}`,
            borderRadius: "10px",
            background: `color-mix(in srgb, ${color} 7%, transparent)`,
          }}
        />
      ) : null}
      <span
        data-agent-change={`${label}-badge`}
        data-agent-object-id={change.id}
        style={{
          position: "absolute",
          left: `${rect.x + rect.width}px`,
          top: `${rect.y}px`,
          zIndex: 3,
          transform: "translate(-100%, -50%)",
          borderRadius: "999px",
          background: color,
          color: "white",
          padding: "2px 7px",
          fontSize: "11px",
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: "0.01em",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {label}
      </span>
    </>
  );
}

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
            border: `2px solid ${AGENT_COLOR}`,
            borderRadius: "18px",
            boxShadow: `0 0 0 5px color-mix(in srgb, ${AGENT_COLOR} 10%, transparent)`,
          }}
        />
      ) : null}

      {changes?.moved
        .filter((change) => !displacedIds.has(change.id))
        .map((change) => (
          <ChangeOutline
            key={`moved-${change.id}`}
            change={change}
            color={AGENT_COLOR}
            className="moved"
          />
        ))}
      {changes?.displaced.map((change) => (
        <ChangeOutline
          key={`displaced-${change.id}`}
          change={change}
          color={DISPLACED_COLOR}
          className="displaced"
        />
      ))}
      {changes?.created.map((change) => (
        <ChangeChip key={`created-${change.id}`} change={change} label="new" color={AGENT_COLOR} />
      ))}
      {changes?.removed.map((change) => (
        <ChangeChip
          key={`removed-${change.id}`}
          change={change}
          label="removed"
          color={REMOVED_COLOR}
          dashed
        />
      ))}
    </div>
  );
}

export interface GhostPreviewScrimProps {
  previewRect: AgentRect | null;
  viewport: ViewportState;
}

/** Mount in InteractiveCanvasEditor's `screenOverlay`. */
export function GhostPreviewScrim({ previewRect, viewport }: GhostPreviewScrimProps) {
  if (!previewRect) return null;

  const topLeft = worldToScreen(viewport, { x: previewRect.x, y: previewRect.y });
  const bottomRight = worldToScreen(viewport, {
    x: previewRect.x + previewRect.width,
    y: previewRect.y + previewRect.height,
  });
  const middleHeight = Math.max(0, bottomRight.y - topLeft.y);

  const panel: CSSProperties = {
    position: "absolute",
    background: SCRIM_COLOR,
    pointerEvents: "none",
  };

  return (
    <div
      data-agent-preview-scrim="true"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <div style={{ ...panel, left: 0, right: 0, top: 0, height: Math.max(0, topLeft.y) }} />
      <div style={{ ...panel, left: 0, right: 0, top: Math.max(0, bottomRight.y), bottom: 0 }} />
      <div
        style={{
          ...panel,
          left: 0,
          top: topLeft.y,
          width: Math.max(0, topLeft.x),
          height: middleHeight,
        }}
      />
      <div
        style={{
          ...panel,
          left: Math.max(0, bottomRight.x),
          right: 0,
          top: topLeft.y,
          height: middleHeight,
        }}
      />
    </div>
  );
}
