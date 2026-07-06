"use client";

import type { CanvasToneStyle } from "./theme";
import {
  CHAT_ICON_COLORS,
  CHIP_ICON_COLORS,
  DOCUMENT_GEOMETRY,
  DOCUMENT_STACK_GEOMETRY,
  FOLDER_GEOMETRY,
} from "./figjam-tokens";

function documentWavyPath(x = 0, y = 0, width = 100, height = 100): string {
  const top = y;
  const left = x;
  const right = x + width;
  const waveShoulderY = y + height * DOCUMENT_GEOMETRY.waveShoulderYRatio;
  const waveCrestY = y + height * DOCUMENT_GEOMETRY.waveCrestYRatio;
  return [
    `M ${left} ${top}`,
    `L ${right} ${top}`,
    `L ${right} ${waveShoulderY}`,
    `C ${x + width * 0.83} ${waveShoulderY} ${x + width * 0.83} ${waveCrestY} ${x + width * 0.66} ${waveCrestY}`,
    `C ${x + width * 0.5} ${waveCrestY} ${x + width * 0.5} ${waveShoulderY} ${x + width * 0.33} ${waveShoulderY}`,
    `C ${x + width * 0.16} ${waveShoulderY} ${x + width * 0.16} ${waveCrestY} ${left} ${waveCrestY}`,
    "Z",
  ].join(" ");
}

/**
 * Inline SVG background layer for silhouettes CSS clip-path can't express
 * (database's cylinder, chat's tail, chip-icon's CPU pins). Rendered
 * absolutely-positioned behind the label/body content.
 * viewBox tracks the object's own aspect ratio (0 0 100 100 scaled non-
 * uniformly via preserveAspectRatio="none") so the silhouette always fills
 * its box regardless of the object's actual width/height.
 *
 * W2 restyle: chat/chip-icon are FILLED, SATURATED, borderless icon
 * glyphs per the V2 Flow reference (figjam-tokens.ts CHAT_ICON_COLORS /
 * CHIP_ICON_COLORS) — an explicit paletteToken/tone on
 * the object still overrides these defaults (falls back to `colors`, the
 * resolveObjectColors result) so the semantic-palette system keeps working
 * for anyone who deliberately recolors one of these. `database` keeps the
 * older tone-driven pastel-pair styling (not named in the W2 restyle scope).
 *
 * (`person`, the third W2-restyled silhouette, moved into its registry def —
 * see objects/shapes/person.tsx.)
 */
export function ShapeSilhouette({
  shape,
  colors,
  hasExplicitColor,
  strokeWidth,
}: {
  shape: "database" | "chat" | "chip-icon" | "document" | "folder" | "document-stack" | "cylinder-horizontal";
  colors: CanvasToneStyle;
  /** True when the object has an explicit paletteToken/tone — overrides the shape's default fixed fill. */
  hasExplicitColor?: boolean;
  strokeWidth?: number;
}) {
  const common = {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    overflow: "visible",
    pointerEvents: "none" as const,
  };
  const silhouetteStrokeWidth = strokeWidth ?? 2;

  if (shape === "database") {
    return (
      <svg
        style={common}
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
    );
  }

  if (shape === "document") {
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="document"
      >
        <path
          d={documentWavyPath()}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (shape === "folder") {
    const tabWidth = FOLDER_GEOMETRY.tabWidthRatio * 100;
    const tabTop = 8;
    const tabBottom = 24;
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="folder"
      >
        <path
          d={`M 0 ${tabTop} H ${tabWidth} V ${tabBottom} H 100 V 100 H 0 Z`}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (shape === "document-stack") {
    const offset = DOCUMENT_STACK_GEOMETRY.offsetPx;
    const pageSize = 100 - offset;
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="document-stack"
      >
        <path
          d={documentWavyPath(0, 0, pageSize, pageSize)}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
          strokeLinejoin="round"
          opacity={0.82}
        />
        <path
          d={documentWavyPath(offset, offset, pageSize, pageSize)}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (shape === "cylinder-horizontal") {
    return (
      <svg
        style={common}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="cylinder-horizontal"
      >
        <path
          d="M 18 5 H 82 C 92 5 98 25 98 50 C 98 75 92 95 82 95 H 18 C 8 95 2 75 2 50 C 2 25 8 5 18 5 Z"
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
          strokeLinejoin="round"
        />
        <path
          d="M 18 5 C 28 5 34 25 34 50 C 34 75 28 95 18 95"
          fill="none"
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
        />
        <path
          d="M 82 5 C 72 5 66 25 66 50 C 66 75 72 95 82 95"
          fill="none"
          stroke={colors.border}
          strokeWidth={silhouetteStrokeWidth}
        />
      </svg>
    );
  }

  if (shape === "chip-icon") {
    const fill = hasExplicitColor ? colors.fill : CHIP_ICON_COLORS.fill;
    const stroke = hasExplicitColor ? colors.border : CHIP_ICON_COLORS.stroke;
    return (
      <svg
        style={common}
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
  }

  // chat: rounded speech bubble with a small tail at bottom-left.
  const chatFill = hasExplicitColor ? colors.fill : CHAT_ICON_COLORS.fill;
  const chatStroke = hasExplicitColor ? colors.border : CHAT_ICON_COLORS.stroke;
  return (
    <svg
      style={common}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-canvas-shape-silhouette="chat"
    >
      <path
        d="M 8 6 L 92 6 C 96.4 6 100 9.6 100 14 L 100 74 C 100 78.4 96.4 82 92 82
           L 26 82 L 12 98 L 15 82 L 8 82 C 3.6 82 0 78.4 0 74
           L 0 14 C 0 9.6 3.6 6 8 6 Z"
        fill={chatFill}
        stroke={chatStroke}
        strokeWidth={2}
      />
    </svg>
  );
}
