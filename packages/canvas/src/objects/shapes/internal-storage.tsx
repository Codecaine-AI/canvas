"use client";

import { PREDEFINED_PROCESS_GEOMETRY } from "../../theme/tokens";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

/**
 * Internal storage — a rect with two inner rule lines (one vertical near the
 * left edge, one horizontal near the top) forming an inset "L" divider. The
 * rules are plain aria-hidden spans (not an SVG silhouette); CSS alone
 * positions and colors them (`background: currentColor`), borrowing
 * PREDEFINED_PROCESS_GEOMETRY.barWidthPx (halved) for their thickness.
 */
export const internalStorageShapeDef: ShapeDef = {
  type: "internal-storage",
  shape: "internal-storage",
  outline: {
    className: "interactive-canvas-object-internal-storage",
    silhouette: () => (
      <>
        <span
          aria-hidden="true"
          className="interactive-canvas-internal-storage-rule interactive-canvas-internal-storage-rule-vertical"
        />
        <span
          aria-hidden="true"
          className="interactive-canvas-internal-storage-rule interactive-canvas-internal-storage-rule-horizontal"
        />
      </>
    ),
  },
  text: { kind: "label" },
  defaultSize: { width: 150, height: 110 },
  defaultTone: "neutral",
  css: `
        .interactive-canvas-object-internal-storage {
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 18% 12% 12% 22%;
        }
        .interactive-canvas-internal-storage-rule {
          position: absolute;
          background: currentColor;
          opacity: 0.6;
          pointer-events: none;
          z-index: 0;
        }
        .interactive-canvas-internal-storage-rule-vertical {
          top: 0;
          bottom: 0;
          left: 15%;
          width: ${PREDEFINED_PROCESS_GEOMETRY.barWidthPx / 2}px;
        }
        .interactive-canvas-internal-storage-rule-horizontal {
          left: 0;
          right: 0;
          top: 15%;
          height: ${PREDEFINED_PROCESS_GEOMETRY.barWidthPx / 2}px;
        }
`,
  catalog: { label: "Internal Storage", keywords: ["internal-storage", "internal storage"] },
};

export const internalStorageDef = shapeObjectDef(internalStorageShapeDef);
