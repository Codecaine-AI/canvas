"use client";

import type { SpacingHint } from "../../interaction/snapping";
import { worldToScreen, type ViewportState } from "../viewport";

/**
 * Small pill chip showing the px gap value, centered on an equal-gap segment
 * (FigJam-style spacing hint). One chip per segment in the hint.
 */
export function SpacingChips({ viewport, hint }: { viewport: ViewportState; hint: SpacingHint }) {
  return (
    <>
      {hint.segments.map((segment, index) => {
        const mid = (segment.start + segment.end) / 2;
        const center =
          hint.axis === "x"
            ? worldToScreen(viewport, { x: mid, y: segment.cross })
            : worldToScreen(viewport, { x: segment.cross, y: mid });
        return (
          <div
            key={`${hint.axis}-${index}`}
            data-canvas-spacing-chip="true"
            style={{
              position: "absolute",
              left: `${center.x}px`,
              top: `${center.y}px`,
              transform: "translate(-50%, -50%)",
              background: "var(--interactive-canvas-highlight)",
              color: "var(--foreground)",
              border: "1px solid var(--interactive-canvas-guide)",
              borderRadius: "999px",
              padding: "1px 6px",
              fontSize: "10px",
              fontWeight: 600,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {Math.round(hint.gap)}
          </div>
        );
      })}
    </>
  );
}
