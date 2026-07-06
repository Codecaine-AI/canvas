"use client";

import { CHIP_ICON_COLORS } from "../../render/figjam-tokens";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

/**
 * Chip-icon (W2 restyle) — a filled, saturated CPU/chip glyph (square body
 * with 4 pins per side) with the bold label BELOW the icon. An explicit
 * paletteToken/tone/fill/stroke on the object still overrides the fixed
 * CHIP_ICON_COLORS so the semantic-palette system keeps working for anyone
 * who deliberately recolors one. Unlike chat, chip-icon has no compact
 * threshold: the body span renders whenever `object.body` is present,
 * regardless of height (isCompactSilhouette in the old pre-registry
 * renderer was chat-only).
 */
export const chipIconShapeDef: ShapeDef = {
  type: "chip-icon",
  shape: "chip-icon",
  outline: {
    className: "interactive-canvas-object-chip-icon",
    silhouette: ({ colors, hasExplicitColor }) => {
      const fill = hasExplicitColor ? colors.fill : CHIP_ICON_COLORS.fill;
      const stroke = hasExplicitColor ? colors.border : CHIP_ICON_COLORS.stroke;
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
          data-canvas-shape-silhouette="chip-icon"
        >
          {/* CPU/chip glyph: square body with 4 pins per side. */}
          {[22, 42, 62].map((pos) => (
            <g key={pos}>
              <line x1={pos} y1={4} x2={pos} y2={16} stroke={stroke} strokeWidth={4} />
              <line x1={pos} y1={84} x2={pos} y2={96} stroke={stroke} strokeWidth={4} />
              <line x1={4} y1={pos} x2={16} y2={pos} stroke={stroke} strokeWidth={4} />
              <line x1={84} y1={pos} x2={96} y2={pos} stroke={stroke} strokeWidth={4} />
            </g>
          ))}
          <rect x="16" y="16" width="68" height="68" rx="10" fill={fill} stroke={stroke} strokeWidth={4} />
          <rect x="34" y="34" width="32" height="32" rx="4" fill="none" stroke={stroke} strokeWidth={3} />
        </svg>
      );
    },
  },
  text: { kind: "label-below-icon" },
  defaultSize: { width: 120, height: 140 },
  defaultTone: "neutral",
  /*
   * Moved from CanvasStage's grouped rules (chip-icon shared selector groups
   * with database/chat there). Declarations are verbatim; the two
   * same-selector rules mirror the original two groups so the declaration
   * cascade (padding: 8px, then padding-bottom: 10%) is preserved exactly.
   */
  css: `
        .interactive-canvas-object-chip-icon {
          /* The SVG silhouette (ShapeSilhouette) paints the fill/border-free
             shape itself — the button chrome stays fully transparent so only
             one outline is visible. */
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          padding: 8px;
        }
        .interactive-canvas-object-chip-icon {
          align-items: center;
          justify-content: flex-end;
          text-align: center;
          padding-bottom: 10%;
        }
        .interactive-canvas-object-chip-icon:hover,
        .interactive-canvas-object-chip-icon[data-selected="true"] {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
        }
`,
  catalog: { label: "Chip", keywords: ["chip", "cpu", "processor", "microchip"] },
};

export const chipIconDef = shapeObjectDef(chipIconShapeDef);
