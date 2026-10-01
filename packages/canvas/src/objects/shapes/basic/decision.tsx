"use client";

import type { CanvasStyle } from "../../../theme/canvas-style";
import { DIAMOND_OUTLINE, outlinePolygonForSpec } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Whether the diamond draws its true outline. The figjam tint mode keeps the
 * historical trim — the button clipped into the diamond by CSS `clip-path`,
 * which clips the button's border away too, so it paints as a borderless
 * pastel diamond (pixel parity with every existing board). Every other mode
 * — card fills sit almost on the board color — draws the outlined diamond
 * the static renderer draws: an SVG polygon with the fill and the ink border.
 */
function outlinedDiamond(canvasStyle: CanvasStyle): boolean {
  return !(canvasStyle.theme === "figjam" && canvasStyle.shapeFill === "tint");
}

/**
 * Decision (rendered as a diamond). In the figjam tint mode a pure CSS
 * `clip-path` outline, no SVG silhouette: the base button trim is clipped
 * into the diamond shape directly. Elsewhere (see outlinedDiamond) a
 * true-outline SVG polygon — the same DIAMOND_OUTLINE vertex math anchors
 * and hit-testing use — paints fill + ink border over an unclipped,
 * transparent, borderless button. Center text uses the shared analytic
 * inscribed rect either way.
 */
export const decisionShapeDef: ShapeDef = {
  type: "decision",
  shape: "diamond",
  outline: DIAMOND_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-diamond",
    silhouette: ({ object, colors, strokeWidth, canvasStyle }) => {
      if (!outlinedDiamond(canvasStyle)) return null;
      const { width, height } = object.geometry;
      const points = outlinePolygonForSpec(DIAMOND_OUTLINE, { x: 0, y: 0, width, height }, object)
        .map((point) => `${point.x},${point.y}`)
        .join(" ");
      return (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette="diamond"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <polygon points={points} fill={colors.fill} stroke={colors.border} strokeWidth={strokeWidth} />
        </svg>
      );
    },
    trim: (canvasStyle) =>
      outlinedDiamond(canvasStyle)
        ? { buttonBorder: "suppressed", style: { clipPath: "none", background: "transparent", overflow: "visible" } }
        : undefined,
  },
  css: `
        .interactive-canvas-object-diamond {
          clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
        }
`,
  catalog: { label: "Decision", keywords: ["decision", "diamond", "condition", "branch"] },
};

export const decisionDef = shapeObjectDef(decisionShapeDef);
