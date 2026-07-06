"use client";

import type { DistributionGuideSegment } from "../../interaction/snapping";
import {
  DISTRIBUTION_GUIDE_COLOR,
  DISTRIBUTION_TICK_BAR,
} from "../../vendor/blocksuite/snap-distribution";
import { worldToScreen, type ViewportState } from "../../editor/viewport";

/**
 * Equal-spacing ("distribution") guide segment from the ported AFFiNE
 * snap-overlay algorithm (W3b): a magenta line spanning one equalized gap,
 * with short perpendicular tick bars at both ends (upstream's end-tick style,
 * DISTRIBUTION_TICK_BAR view px). Segments arrive in world space on
 * InteractionOverlay.distributionGuides; rendered here as one small SVG per
 * segment so they pan/zoom with the stage.
 */
export function DistributionGuideLine({
  viewport,
  segment,
}: {
  viewport: ViewportState;
  segment: DistributionGuideSegment;
}) {
  const a = worldToScreen(viewport, { x: segment.x1, y: segment.y1 });
  const b = worldToScreen(viewport, { x: segment.x2, y: segment.y2 });
  const horizontal = Math.abs(a.y - b.y) <= Math.abs(a.x - b.x);
  const half = DISTRIBUTION_TICK_BAR / 2;
  const tickA = horizontal
    ? `M ${a.x} ${a.y - half} L ${a.x} ${a.y + half}`
    : `M ${a.x - half} ${a.y} L ${a.x + half} ${a.y}`;
  const tickB = horizontal
    ? `M ${b.x} ${b.y - half} L ${b.x} ${b.y + half}`
    : `M ${b.x - half} ${b.y} L ${b.x + half} ${b.y}`;
  return (
    <svg
      data-canvas-distribution-guide=""
      aria-hidden="true"
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
    >
      <path
        d={`M ${a.x} ${a.y} L ${b.x} ${b.y} ${tickA} ${tickB}`}
        fill="none"
        stroke={DISTRIBUTION_GUIDE_COLOR}
        strokeWidth={2}
      />
    </svg>
  );
}
