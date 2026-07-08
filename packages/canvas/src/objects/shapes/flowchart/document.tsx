"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/** Document wavy-bottom silhouette geometry (moved from theme/tokens.ts in the theme dispersal). */
export const DOCUMENT_GEOMETRY = {
  waveShoulderYRatio: 0.82,
  waveCrestYRatio: 0.96,
} as const;

/**
 * Wavy-bottom document silhouette geometry. Coordinates are object-local,
 * preserving the original 100x100 proportions at the object's true size.
 * Shared with the document-stack def, which draws the same wave twice at an
 * offset.
 */
export function documentWavyPath(x = 0, y = 0, width = 100, height = 100): string {
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
 * Document (W5) — inline SVG wavy-bottom silhouette (CSS clip-path can't
 * express the wave) painted behind the label/body content; the button
 * chrome stays fully transparent so only one outline is visible. Stroke
 * width follows the object's resolved stroke width.
 */
export const documentShapeDef: ShapeDef = {
  type: "document",
  shape: "document",
  buttonBorder: "suppressed",
  silhouette: {
    className: "interactive-canvas-object-document",
    silhouette: ({ object, colors, strokeWidth }) => (
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
        viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="document"
      >
        <path
          d={documentWavyPath(0, 0, object.geometry.width, object.geometry.height)}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  /*
   * Moved from CanvasStage's grouped rule (document shares its selector
   * group there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/plus/chevron/off-page-connector/
   * trapezoid/manual-input/hexagon/or-junction/summing-junction — 17
   * selectors total). Paint declarations moved here; document itself carries no
   * additional per-shape follow-up rule in the legacy block (unlike folder/
   * document-stack/triangle, which do).
   */
  css: `
        .interactive-canvas-object-document {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Document", keywords: ["document", "file", "page", "wavy"] },
};

export const documentDef = shapeObjectDef(documentShapeDef);
