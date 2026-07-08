"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Database — a cylinder silhouette (lid ellipse + body path) drawn via inline
 * SVG behind the slot text; the button chrome stays fully transparent so only
 * one outline is visible. Unlike icon glyph shapes, database keeps the
 * older tone-driven pastel-pair styling (colors.fill/colors.border) rather
 * than a fixed icon-color pair — it was not in the W2 restyle scope.
 */
export const databaseShapeDef: ShapeDef = {
  type: "database",
  shape: "database",
  buttonBorder: "suppressed",
  silhouette: {
    className: "interactive-canvas-object-database",
    silhouette: ({ object, colors, strokeWidth }) => {
      const width = object.geometry.width;
      const height = object.geometry.height;
      const left = width * 0.04;
      const right = width * 0.96;
      const centerX = width * 0.5;
      const lidY = height * 0.22;
      const lidControlY = height * 0.12;
      const bottomY = height * 0.78;
      const bottomControlY = height * 0.88;
      const radiusX = width * 0.46;
      const radiusY = height * 0.12;
      const bodyPath = [
        `M ${left} ${lidY}`,
        `C ${left} ${lidControlY} ${right} ${lidControlY} ${right} ${lidY}`,
        `L ${right} ${bottomY}`,
        `C ${right} ${bottomControlY} ${left} ${bottomControlY} ${left} ${bottomY}`,
        "Z",
      ].join(" ");

      return (
        <svg
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          data-canvas-shape-silhouette="database"
        >
          <path d={bodyPath} fill={colors.fill} stroke={colors.border} strokeWidth={strokeWidth} />
          <ellipse
            cx={centerX}
            cy={lidY}
            rx={radiusX}
            ry={radiusY}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={strokeWidth}
          />
        </svg>
      );
    },
  },
  /*
   * Moved from CanvasStage's grouped rules (database shared selector groups
   * with other bbox silhouettes there). Paint declarations moved here.
   */
  css: `
        .interactive-canvas-object-database {
          /* The inline SVG silhouette paints the fill/border; the button
             chrome stays fully transparent so only one outline is visible. */
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
        }
`,
  catalog: { label: "Database", keywords: ["database", "storage", "data", "cylinder"] },
};

export const databaseDef = shapeObjectDef(databaseShapeDef);
