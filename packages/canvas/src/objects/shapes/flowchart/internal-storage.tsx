"use client";

// Shared with the predefined-process def (see the note on its export): the
// corner radius and rule inset deliberately reuse the same figures.
import { PREDEFINED_PROCESS_GEOMETRY } from "./predefined-process";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Internal storage — a rect with two inner rule lines (one vertical near the
 * left edge, one horizontal near the top) forming an inset "L" divider. The
 * rules are plain aria-hidden spans (not an SVG silhouette); CSS positions
 * them, and each span is painted inline with the resolved border color,
 * borrowing
 * PREDEFINED_PROCESS_GEOMETRY.barWidthPx (halved) for their thickness.
 */
export const internalStorageShapeDef: ShapeDef = {
  type: "internal-storage",
  shape: "internal-storage",
  silhouette: {
    className: "interactive-canvas-object-internal-storage",
    silhouette: ({ colors }) => (
      <>
        <span
          aria-hidden="true"
          className="interactive-canvas-internal-storage-rule interactive-canvas-internal-storage-rule-vertical"
          style={{ background: colors.border }}
        />
        <span
          aria-hidden="true"
          className="interactive-canvas-internal-storage-rule interactive-canvas-internal-storage-rule-horizontal"
          style={{ background: colors.border }}
        />
      </>
    ),
  },
  css: `
        .interactive-canvas-object-internal-storage {
        }
        .interactive-canvas-internal-storage-rule {
          position: absolute;
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
  catalog: { label: "Internal storage", keywords: ["internal-storage", "internal storage"] },
};

export const internalStorageDef = shapeObjectDef(internalStorageShapeDef);
