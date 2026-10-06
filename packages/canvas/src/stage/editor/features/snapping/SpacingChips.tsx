"use client";

import { flat } from "@codecaine-ai/design-system";
import type { SpacingHint } from "./snapping";
import { worldToScreen, type ViewportState } from "../../../viewport";
import { stageMarkColors } from "../../../../theme/canvas-style";
import { useCanvasStyle } from "../../../../theme/canvas-style-context";

/**
 * Small pill chip showing the px gap value, centered on an equal-gap segment
 * (FigJam-style spacing hint). One chip per segment in the hint. A stage mark
 * in the board's ink (decision 56): the fill and border are the stage's ink
 * variables (theme/tokens.ts canvasSurfaceStyle), the text the ink itself;
 * radius and type are resolved design-system base tokens (the stage never
 * reads host CSS).
 */
export function SpacingChips({ viewport, hint }: { viewport: ViewportState; hint: SpacingHint }) {
  const { ink } = stageMarkColors(useCanvasStyle());
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
              color: ink,
              border: "1px solid var(--interactive-canvas-guide)",
              borderRadius: flat.base["radius.pill"],
              padding: "1px 6px",
              fontSize: flat.base["font.size.micro"],
              fontWeight: flat.base["font.weight.semibold"],
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
