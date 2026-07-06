"use client";

import type { CanvasToneStyle } from "./theme";
import { DOCUMENT_STACK_GEOMETRY, FOLDER_GEOMETRY } from "./figjam-tokens";
// documentWavyPath moved into the document def with its batch-1 conversion;
// document-stack keeps borrowing it from there until its own batch-3 move.
import { documentWavyPath } from "../objects/shapes/document";

/**
 * Inline SVG background layer for silhouettes CSS clip-path can't express.
 * Rendered absolutely-positioned behind the label/body content.
 * viewBox tracks the object's own aspect ratio (0 0 100 100 scaled non-
 * uniformly via preserveAspectRatio="none") so the silhouette always fills
 * its box regardless of the object's actual width/height.
 *
 * Batch-1 registry conversions moved `person`, `database`, `chat`,
 * `chip-icon`, and `document` into their defs (objects/shapes/*.tsx); only
 * the W5 trio below still renders through here until batch 3.
 */
export function ShapeSilhouette({
  shape,
  colors,
  strokeWidth,
}: {
  shape: "folder" | "document-stack" | "cylinder-horizontal";
  colors: CanvasToneStyle;
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

  // cylinder-horizontal — the final W5 holdout branch.
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
