"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/** Chat icon fill+stroke (moved from theme/tokens.ts in the theme dispersal). */
export const CHAT_ICON_COLORS = {
  fill: "#FF9E42",
  stroke: "#EB7500",
} as const;

/**
 * Chat (W2 restyle) — a filled, saturated, borderless speech-bubble SVG
 * silhouette (CSS clip-path can't express the tail) with the bold label
 * BELOW the icon. An explicit paletteToken/tone/fill/stroke on the object
 * still overrides the fixed CHAT_ICON_COLORS so the semantic-palette system
 * keeps working for anyone who deliberately recolors one.
 *
 * Below 100px height, unlike person, only the body copy is dropped — the
 * below-icon label always renders (legacy `isCompactSilhouette` in
 * ObjectShape only gates the `.interactive-canvas-object-body` span; the
 * `labelBelowIcon` span is unconditional there). Hence `compactDrops: "body"`.
 */
export const chatShapeDef: ShapeDef = {
  type: "chat",
  shape: "chat",
  outline: {
    className: "interactive-canvas-object-chat",
    silhouette: ({ colors, hasExplicitColor }) => {
      const fill = hasExplicitColor ? colors.fill : CHAT_ICON_COLORS.fill;
      const stroke = hasExplicitColor ? colors.border : CHAT_ICON_COLORS.stroke;
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
          data-canvas-shape-silhouette="chat"
        >
          <path
            d="M 8 6 L 92 6 C 96.4 6 100 9.6 100 14 L 100 74 C 100 78.4 96.4 82 92 82
           L 26 82 L 12 98 L 15 82 L 8 82 C 3.6 82 0 78.4 0 74
           L 0 14 C 0 9.6 3.6 6 8 6 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth={2}
          />
        </svg>
      );
    },
  },
  text: { kind: "label-below-icon", compactBelowHeightPx: 100, compactDrops: "body" },
  defaultSize: { width: 180, height: 110 },
  defaultTone: "process",
  /*
   * Moved from CanvasStage's grouped rules (chat shared selector groups with
   * database/chip-icon there). Declarations are verbatim; the two same-
   * selector rules mirror the original two groups so the declaration cascade
   * (padding: 8px, then padding-bottom: 10%) is preserved exactly.
   */
  css: `
        .interactive-canvas-object-chat {
          /* The SVG silhouette (ShapeSilhouette) paints the fill/border-free
             shape itself — the button chrome stays fully transparent so only
             one outline is visible. */
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          padding: 8px;
        }
        .interactive-canvas-object-chat {
          align-items: center;
          justify-content: flex-end;
          text-align: center;
          padding-bottom: 10%;
        }
        .interactive-canvas-object-chat:hover,
        .interactive-canvas-object-chat[data-selected="true"] {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
        }
`,
  catalog: { label: "Chat", keywords: ["chat", "speech", "bubble", "message"] },
};

export const chatDef = shapeObjectDef(chatShapeDef);
