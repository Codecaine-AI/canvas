"use client";

import type { SnapGuide } from "../../interaction/snapping";
import { worldToScreen, type ViewportState } from "../../editor/viewport";

/**
 * Screen-space 1px alignment guide line, projected from a world-space
 * SnapGuide (position + perpendicular span). Rendered in the untransformed
 * overlay slot so the line stays crisp at any zoom level.
 */
export function SnapGuideLine({ viewport, guide }: { viewport: ViewportState; guide: SnapGuide }) {
  if (guide.axis === "x") {
    const top = worldToScreen(viewport, { x: guide.position, y: guide.span.start });
    const bottom = worldToScreen(viewport, { x: guide.position, y: guide.span.end });
    return (
      <div
        data-canvas-snap-guide="x"
        style={{
          position: "absolute",
          left: `${top.x}px`,
          top: `${Math.min(top.y, bottom.y)}px`,
          width: "1px",
          height: `${Math.abs(bottom.y - top.y)}px`,
          background: "var(--interactive-canvas-guide)",
          pointerEvents: "none",
        }}
      />
    );
  }
  const left = worldToScreen(viewport, { x: guide.span.start, y: guide.position });
  const right = worldToScreen(viewport, { x: guide.span.end, y: guide.position });
  return (
    <div
      data-canvas-snap-guide="y"
      style={{
        position: "absolute",
        left: `${Math.min(left.x, right.x)}px`,
        top: `${left.y}px`,
        width: `${Math.abs(right.x - left.x)}px`,
        height: "1px",
        background: "var(--interactive-canvas-guide)",
        pointerEvents: "none",
      }}
    />
  );
}
