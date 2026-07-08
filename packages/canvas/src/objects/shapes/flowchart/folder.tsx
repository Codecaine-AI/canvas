"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/** Folder silhouette geometry (moved from theme/tokens.ts in the theme dispersal). */
export const FOLDER_GEOMETRY = {
  tabWidthRatio: 0.38,
} as const;

/**
 * Folder (W5) — inline SVG silhouette (tab + body path, CSS clip-path can't
 * express the tab notch) painted behind the label/body content; the button
 * chrome stays fully transparent so only one outline is visible. Moved
 * verbatim from render/ShapeSilhouette.tsx's folder branch. Stroke width
 * follows the object's resolved stroke width — the shared shape view
 * (objects/shapes/base.tsx) always resolves and passes a concrete
 * `strokeWidth` via `resolveObjectStrokeWidth`, so ShapeSilhouette's
 * `strokeWidth ?? 2` fallback never actually fired for this shape either;
 * this def uses `args.strokeWidth` directly with no fallback.
 */
export const folderShapeDef: ShapeDef = {
  type: "folder",
  shape: "folder",
  buttonBorder: "suppressed",
  silhouette: {
    className: "interactive-canvas-object-folder",
    silhouette: ({ colors, strokeWidth }) => {
      const tabWidth = FOLDER_GEOMETRY.tabWidthRatio * 100;
      const tabTop = 8;
      const tabBottom = 24;
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
          data-canvas-shape-silhouette="folder"
        >
          <path
            d={`M 0 ${tabTop} H ${tabWidth} V ${tabBottom} H 100 V 100 H 0 Z`}
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
   * Moved from CanvasStage's grouped rule (folder shared its selector group
   * there with document-stack/cylinder-horizontal — the last three members
   * of the trans­parent-chrome group, alongside document/triangle/
   * parallelogram/pentagon/octagon/star/plus/chevron/off-page-connector/
   * trapezoid/manual-input/hexagon/or-junction/summing-junction, already
   * converted). Paint declarations moved here.
   */
  css: `
        .interactive-canvas-object-folder {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Folder", keywords: ["folder", "directory", "file"] },
};

export const folderDef = shapeObjectDef(folderShapeDef);
