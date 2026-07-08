"use client";

import { documentWavyPath } from "./document";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/** Document-stack silhouette geometry (moved from theme/tokens.ts in the theme dispersal). */
export const DOCUMENT_STACK_GEOMETRY = {
  offsetPx: 6,
} as const;

/**
 * Document Stack (W5) — two offset wavy-bottom document silhouettes (the
 * back page dimmed via opacity, the front page full-opacity) drawn via
 * inline SVG behind the label/body content; the button chrome stays fully
 * transparent so only one outline is visible. Moved verbatim from the
 * now-deleted render/ShapeSilhouette.tsx's document-stack branch. Reuses
 * `documentWavyPath` from the document def (../objects/shapes/document.tsx),
 * which was that file's last non-def importer before it was deleted. Stroke
 * width follows the object's resolved stroke width (see folder.tsx's note —
 * the shared shape view always resolves a concrete value, so no `?? 2`
 * fallback is needed here).
 */
export const documentStackShapeDef: ShapeDef = {
  type: "document-stack",
  shape: "document-stack",
  buttonBorder: "suppressed",
  silhouette: {
    className: "interactive-canvas-object-document-stack",
    silhouette: ({ colors, strokeWidth }) => {
      const offset = DOCUMENT_STACK_GEOMETRY.offsetPx;
      const pageSize = 100 - offset;
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
          data-canvas-shape-silhouette="document-stack"
        >
          <path
            d={documentWavyPath(0, 0, pageSize, pageSize)}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            opacity={0.82}
          />
          <path
            d={documentWavyPath(offset, offset, pageSize, pageSize)}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      );
    },
  },
  /*
   * Moved from CanvasStage's grouped rule (document-stack shared its
   * selector group there with folder/cylinder-horizontal). Paint declarations moved here.
   */
  css: `
        .interactive-canvas-object-document-stack {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Document stack", keywords: ["document-stack", "documents", "stack", "pages"] },
};

export const documentStackDef = shapeObjectDef(documentStackShapeDef);
