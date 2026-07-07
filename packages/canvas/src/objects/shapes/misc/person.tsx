"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/** Person icon fill+stroke (moved from theme/tokens.ts in the theme dispersal). */
export const PERSON_ICON_COLORS = {
  fill: "#66D575",
  stroke: "#3E9B4B",
} as const;

/**
 * Person (D16, W2 restyle) — a filled, saturated, borderless head-and-
 * shoulders SVG silhouette (CSS clip-path can't express it) with the bold
 * label BELOW the icon. An explicit paletteToken/tone/fill/stroke on the
 * object still overrides the fixed PERSON_ICON_COLORS so the semantic-
 * palette system keeps working for anyone who deliberately recolors one.
 * Below 100px height the silhouette wins: label and body are dropped to
 * keep the glyph legible rather than overrun with text.
 */
export const personShapeDef: ShapeDef = {
  type: "person",
  shape: "person",
  outline: {
    className: "interactive-canvas-object-person",
    silhouette: ({ colors, hasExplicitColor }) => {
      const fill = hasExplicitColor ? colors.fill : PERSON_ICON_COLORS.fill;
      const stroke = hasExplicitColor ? colors.border : PERSON_ICON_COLORS.stroke;
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
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          data-canvas-shape-silhouette="person"
        >
          {/* Rounded-shoulders body first (so the head overlaps its top edge). */}
          <path
            d="M 50 52 C 20 52 10 68 8 100 L 92 100 C 90 68 80 52 50 52 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
          />
          <circle cx="50" cy="30" r="22" fill={fill} stroke={stroke} strokeWidth={2} />
        </svg>
      );
    },
  },
  text: { kind: "label-below-icon", compactBelowHeightPx: 100 },
  defaultSize: { width: 120, height: 140 },
  defaultTone: "input",
  /*
   * Moved from CanvasStage's grouped rules (person shared selector groups
   * with database/chat/chip-icon there). Declarations are verbatim; the two
   * same-selector rules mirror the original two groups so the declaration
   * cascade (padding: 8px, then padding-bottom: 10%) is preserved exactly.
   */
  css: `
        .interactive-canvas-object-person {
          /* The SVG silhouette paints the fill/border-free shape itself — the
             button chrome stays fully transparent so only one outline is
             visible. */
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          padding: 8px;
        }
        .interactive-canvas-object-person {
          align-items: center;
          justify-content: flex-end;
          text-align: center;
          padding-bottom: 10%;
        }
`,
  catalog: { label: "Person", keywords: ["person", "user", "actor", "people"] },
};

export const personDef = shapeObjectDef(personShapeDef);
