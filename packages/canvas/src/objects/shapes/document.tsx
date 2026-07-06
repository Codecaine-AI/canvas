"use client";

import { DOCUMENT_GEOMETRY } from "../../render/figjam-tokens";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

/**
 * Wavy-bottom document silhouette geometry — moved here verbatim from the
 * now-deleted render/ShapeSilhouette.tsx. Shared with the document-stack
 * def, which draws the same wave twice at an offset.
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
 * width follows the object's resolved stroke width (legacy passed
 * `shapeStrokeWidth` through for document/folder/document-stack/
 * cylinder-horizontal — see ObjectShape's ShapeSilhouette call).
 */
export const documentShapeDef: ShapeDef = {
  type: "document",
  shape: "document",
  outline: {
    className: "interactive-canvas-object-document",
    silhouette: ({ colors, strokeWidth }) => (
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
        data-canvas-shape-silhouette="document"
      >
        <path
          d={documentWavyPath()}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  text: { kind: "label" },
  defaultSize: { width: 160, height: 120 },
  defaultTone: "memory",
  /*
   * Moved from CanvasStage's grouped rule (document shares its selector
   * group there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/plus/chevron/off-page-connector/
   * trapezoid/manual-input/hexagon/or-junction/summing-junction — 17
   * selectors total). Declarations are verbatim; document itself carries no
   * additional per-shape follow-up rule in the legacy block (unlike folder/
   * document-stack/triangle, which do).
   */
  css: `
        .interactive-canvas-object-document {
          align-items: center;
          justify-content: center;
          text-align: center;
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
