"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  worldToScreen,
  type InteractiveCanvasDocument,
  type ViewportState,
} from "@codecaine-ai/canvas";
import type { AgentProposal, AgentRect } from "@codecaine-ai/canvas-agent/protocol";
import { classifyChanges, type MovedChange, type ObjectRectChange } from "./classify-changes";

/*
 * Change marks over the board, drawn as editor chrome from design-system
 * tokens, so they follow the app theme. The agent's own marks (its work frame,
 * moved and new objects) take the AI layer's violet; objects it pushes aside
 * are blue (categorical); removals are the diff's removed red. Each badge
 * color pairs with the glyph color that reads on it.
 */
const AGENT_COLOR = "var(--ds-color-annotation-accent)";
const AGENT_ON_COLOR = "var(--ds-color-text-on-solid)";
const DISPLACED_COLOR = "var(--ds-color-blue-solid)";
const REMOVED_COLOR = "var(--ds-color-diff-del)";
const REMOVED_ON_COLOR = "var(--ds-color-text-on-solid)";
/** Dims the board around the work frame: the dialog backdrop's black, at 14%. */
const SCRIM_COLOR = "color-mix(in srgb, var(--ds-color-backdrop) 35%, transparent)";
const BADGE_RADIUS = "var(--ds-radius-pill)";
/** The marks' outline: 2px, the focus-outline width. */
const MARK_WIDTH = "var(--ds-border-width-focus)";
/** The work frame's halo spread, 5px. No token equals it: focus (2px) + rail (3px) widths. */
const HALO_SPREAD = "calc(var(--ds-border-width-focus) + var(--ds-border-width-rail))";
const MARK_RADIUS = "var(--ds-radius-base)";

type DraftPreview = {
  rect: AgentRect;
  svg: string;
};

export interface GhostPreviewLayerProps {
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
          border: `${MARK_WIDTH} dashed ${color}`,
          borderRadius: MARK_RADIUS,
          background: "color-mix(in srgb, var(--ds-color-surface-page) 16%, transparent)",
        }}
      />
      <div
        data-agent-change={`${className}-destination`}
        data-agent-object-id={change.id}
        style={{
          ...rectStyle(change.to),
          zIndex: 2,
          border: `var(--ds-border-width-hairline) solid ${color}`,
          borderRadius: MARK_RADIUS,
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
  onColor,
  dashed = false,
}: {
  change: ObjectRectChange;
  label: "new" | "removed";
  color: string;
  /** The badge text color, readable on `color`. */
  onColor: string;
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
            border: `${MARK_WIDTH} dashed ${color}`,
            borderRadius: MARK_RADIUS,
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
          borderRadius: BADGE_RADIUS,
          background: color,
          color: onColor,
          padding: "2px 7px",
          fontSize: "var(--ds-font-size-ui-2xs)",
          fontWeight: "var(--ds-font-weight-bold)",
          lineHeight: "var(--ds-line-height-tight)",
          letterSpacing: "var(--ds-letter-spacing-normal)",
          boxShadow: "var(--ds-shadow-glass)",
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
            border: `${MARK_WIDTH} solid ${AGENT_COLOR}`,
            borderRadius: MARK_RADIUS,
            boxShadow: `0 0 0 ${HALO_SPREAD} color-mix(in srgb, ${AGENT_COLOR} 10%, transparent)`,
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
        <ChangeChip
          key={`created-${change.id}`}
          change={change}
          label="new"
          color={AGENT_COLOR}
          onColor={AGENT_ON_COLOR}
        />
      ))}
      {changes?.removed.map((change) => (
        <ChangeChip
          key={`removed-${change.id}`}
          change={change}
          label="removed"
          color={REMOVED_COLOR}
          onColor={REMOVED_ON_COLOR}
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
