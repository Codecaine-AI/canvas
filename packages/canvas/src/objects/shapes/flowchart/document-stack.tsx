"use client";

import { documentWavyPath } from "./document";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/** Document-stack silhouette geometry (moved from theme/tokens.ts in the theme dispersal). */
export const DOCUMENT_STACK_GEOMETRY = {
  offsetRatio: 0.06,
} as const;

/**
 * Document Stack (W5) — two offset wavy-bottom document silhouettes (the
 * back page dimmed via opacity, the front page full-opacity) drawn via
 * inline SVG behind the label/body content; the button chrome stays fully
 * transparent so only one outline is visible. The original 100x100 silhouette
 * proportions are projected into object-local coordinates so the SVG stroke
 * width remains in true canvas px. Reuses `documentWavyPath` from the document
 * def, and stroke width follows the object's resolved stroke width.
 */
export const documentStackShapeDef: ShapeDef = {
  type: "document-stack",
  shape: "document-stack",
  buttonBorder: "suppressed",
  silhouette: {
    className: "interactive-canvas-object-document-stack",
    silhouette: ({ object, colors, strokeWidth }) => {
      const offsetX = object.geometry.width * DOCUMENT_STACK_GEOMETRY.offsetRatio;
      const offsetY = object.geometry.height * DOCUMENT_STACK_GEOMETRY.offsetRatio;
      const pageWidth = object.geometry.width - offsetX;
      const pageHeight = object.geometry.height - offsetY;
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
          viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          data-canvas-shape-silhouette="document-stack"
        >
          <path
            d={documentWavyPath(0, 0, pageWidth, pageHeight)}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            opacity={0.82}
          />
          <path
            d={documentWavyPath(offsetX, offsetY, pageWidth, pageHeight)}
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
