"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Database — a cylinder silhouette (lid ellipse + body path) drawn via inline
 * SVG behind centered text; the button chrome stays fully transparent so only
 * one outline is visible. Unlike chat/chip-icon/person, database keeps the
 * older tone-driven pastel-pair styling (colors.fill/colors.border) rather
 * than a fixed icon-color pair — it was not in the W2 restyle scope — and the
 * legacy renderer never passes a resolved stroke width for it, so the
 * silhouette's strokeWidth is hard-coded to 2 here too.
 */
export const databaseShapeDef: ShapeDef = {
  type: "database",
  shape: "database",
  outline: {
    className: "interactive-canvas-object-database",
    silhouette: ({ colors }) => (
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
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="database"
      >
        <path
          d="M 4 22 C 4 12 96 12 96 22 L 96 78 C 96 88 4 88 4 78 Z"
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={2}
        />
        <ellipse cx="50" cy="22" rx="46" ry="12" fill={colors.fill} stroke={colors.border} strokeWidth={2} />
      </svg>
    ),
  },
  text: { kind: "label" },
  defaultSize: { width: 140, height: 120 },
  defaultTone: "memory",
  /*
   * Moved from CanvasStage's grouped rules (database shared selector groups
   * with chat/chip-icon there). Declarations are verbatim; the two
   * same-selector rules mirror the original two groups so the declaration
   * cascade (padding: 8px, then padding-top: 14%) is preserved exactly.
   */
  css: `
        .interactive-canvas-object-database {
          /* The SVG silhouette (ShapeSilhouette) paints the fill/border-free
             shape itself — the button chrome stays fully transparent so only
             one outline is visible. */
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          padding: 8px;
        }
        .interactive-canvas-object-database {
          align-items: center;
          justify-content: center;
          text-align: center;
          padding-top: 14%;
        }
`,
  catalog: { label: "Database", keywords: ["database", "storage", "data", "cylinder"] },
};

export const databaseDef = shapeObjectDef(databaseShapeDef);
