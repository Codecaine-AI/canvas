"use client";

import { resolveSectionColors } from "../../theme";
import { CONNECTOR_DASH_PATTERN_PX } from "../connector/def";
import type { ObjectDef, ObjectRenderProps } from "../object-def";
import { SECTION_TOOLBAR } from "./toolbar";

/** Section geometry (moved from theme/tokens.ts in the theme dispersal — per-kind constants co-locate with their def; also consumed by the editor's label-editing overlay). */
export const SECTION_GEOMETRY = {
  cornerRadiusPx: 8.5,
  borderWidthPx: 2,
  titleChip: {
    heightPx: 27,
    borderWidthPx: 2,
    textColor: "#000000",
    fontSizePx: 16,
    fontWeight: 700,
    paddingXPx: 10,
    insetFromSectionCornerPx: 3,
    maxZoomOutScale: 6,
    // Sub-linear zoom-out growth: 1 = constant screen size (full 1/zoom
    // compensation, reads oversized next to the shrunken content), 0 = no
    // growth. 0.6 keeps titles readable from afar without dwarfing the board.
    zoomOutGrowth: 0.6,
  },
} as const;

/** Heuristic screen width of the title chip at zoom 1 — mirrors the label editor's input sizing. */
export function estimateSectionTitleChipWidthPx(title: string): number {
  const { fontSizePx, paddingXPx, borderWidthPx } = SECTION_GEOMETRY.titleChip;
  return Math.max(72, title.length * fontSizePx * 0.62 + paddingXPx * 2 + borderWidthPx * 2);
}

/**
 * FigJam-style counter-scale for the section title chip: when zoomed out the
 * chip grows by (1/zoom)^zoomOutGrowth — sub-linear, so titles read from afar
 * yet still shrink somewhat with the board instead of staying full-size on
 * screen. Uniform across all sections regardless of their width (a long
 * title truncates to its section via `sectionTitleMaxWidthPx` rather than
 * shrinking, so labels never come out in mismatched sizes). At zoom >= 1 the
 * scale is 1 (the chip renders at its natural document size).
 */
export function sectionTitleScale(zoom: number): number {
  const { maxZoomOutScale, zoomOutGrowth } = SECTION_GEOMETRY.titleChip;
  return Math.min(Math.max((1 / zoom) ** zoomOutGrowth, 1), maxZoomOutScale);
}

/**
 * Pre-transform width budget for a scaled chip: the scaled chip may span up
 * to its section's inner width but never spill past it — overflow renders as
 * an ellipsis instead of a mid-letter clip at the section's overflow:hidden
 * edge.
 */
export function sectionTitleMaxWidthPx(sectionWidthPx: number, scale: number): number {
  const inner = sectionWidthPx - SECTION_GEOMETRY.titleChip.insetFromSectionCornerPx * 2;
  return Math.max(0, inner / scale);
}

/**
 * FigJam section (W2) — a large tinted backdrop with a floating title chip
 * in the top-left corner, per SECTION_GEOMETRY. Deliberately NOT built on
 * the generic button/label/body chrome the shape family shares: sections
 * have no centered label, no shadow, no edge ports, and their "border" is
 * literally the title chip's fill color (per spec, border = chip fill).
 *
 * `hideLabel` maps to hiding the title CHIP — the chip IS the section's
 * visible text, edited in place via the title-chip label editor.
 */
function SectionObjectView({
  object,
  selected,
  dropTarget,
  bounds,
  editable,
  hideLabel,
  zoom = 1,
  onObjectSelect,
  onObjectContextMenu,
}: ObjectRenderProps) {
  const family = resolveSectionColors(object.tint);
  const borderColor = object.style?.stroke ?? family.chipBorder ?? "transparent";
  const borderStyle = object.style?.strokeStyle ?? "solid";
  const borderWidth =
    borderStyle === "none" || borderStyle === "dashed"
      ? 0
      : (object.style?.strokeWidth ?? SECTION_GEOMETRY.borderWidthPx);
  const renderedStrokeWidth = object.style?.strokeWidth ?? SECTION_GEOMETRY.borderWidthPx;
  const title = object.title ?? object.label;
  const titleScale = sectionTitleScale(zoom);
  return (
    <button
      type="button"
      className="interactive-canvas-object interactive-canvas-object-section"
      data-docs-target="true"
      data-docs-target-type="canvas-section"
      data-source-id={object.id}
      data-docs-target-label={`canvas: ${title}`}
      data-canvas-object-id={object.id}
      data-canvas-object-type={object.type}
      data-canvas-object-shape="section"
      data-selected={selected ? "true" : undefined}
      data-drop-target={dropTarget ? "true" : undefined}
      data-editable={(editable ?? Boolean(onObjectSelect)) ? "true" : undefined}
      style={{
        left: `${object.geometry.x}px`,
        top: `${object.geometry.y}px`,
        width: `${object.geometry.width}px`,
        height: `${object.geometry.height}px`,
        background: object.style?.fill ?? family.tint,
        borderColor,
        borderStyle,
        borderWidth,
        borderRadius: SECTION_GEOMETRY.cornerRadiusPx,
        // W4 z-layering: section backdrops stay below the connector layer (z 1).
        zIndex: 0,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onObjectSelect?.(object.id);
      }}
      onContextMenu={(event) => {
        if (!onObjectContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onObjectContextMenu(event, object, bounds);
      }}
    >
      {borderStyle === "dashed" ? (
        <svg
          aria-hidden="true"
          data-section-border-dash=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <rect
            x={renderedStrokeWidth / 2}
            y={renderedStrokeWidth / 2}
            width={`calc(100% - ${renderedStrokeWidth}px)`}
            height={`calc(100% - ${renderedStrokeWidth}px)`}
            rx={SECTION_GEOMETRY.cornerRadiusPx}
            ry={SECTION_GEOMETRY.cornerRadiusPx}
            fill="none"
            stroke={borderColor}
            strokeWidth={renderedStrokeWidth}
            strokeDasharray={CONNECTOR_DASH_PATTERN_PX.join(" ")}
          />
        </svg>
      ) : null}
      {!hideLabel && (
        <span
          className="interactive-canvas-section-title-chip"
          data-canvas-section-title-chip={object.id}
          style={{
            background: family.chipFill ?? "transparent",
            borderColor: family.chipBorder ?? "transparent",
            ...(titleScale !== 1
              ? {
                  transform: `scale(${titleScale})`,
                  maxWidth: `${sectionTitleMaxWidthPx(object.geometry.width, titleScale)}px`,
                }
              : {}),
          }}
        >
          <span>{title}</span>
        </span>
      )}
    </button>
  );
}

export const sectionDef: ObjectDef = {
  kind: "section",
  render: SectionObjectView,
  css: `
        /* W2 — section: tint fill, subtle border (= chip fill), no shadow, no
           button-style chrome; the floating title chip is a separate
           absolutely-positioned child. */
        .interactive-canvas-object-section {
          border-style: solid;
          border-width: ${SECTION_GEOMETRY.borderWidthPx}px;
          border-radius: ${SECTION_GEOMETRY.cornerRadiusPx}px;
          padding: 0;
          box-shadow: none;
          align-items: stretch;
          justify-content: flex-start;
        }
        .interactive-canvas-object-section:hover,
        .interactive-canvas-object-section[data-selected="true"] {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        /* Drop-target state while a drag hovers this section: keep the section's
           2px outline weight (softer than the generic shape drop glow) with a
           faint primary wash so the capture area reads without shouting. */
        .interactive-canvas-object-section[data-drop-target="true"] {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--primary) 16%, transparent);
        }
        .interactive-canvas-section-title-chip {
          position: absolute;
          left: ${SECTION_GEOMETRY.titleChip.insetFromSectionCornerPx}px;
          top: ${SECTION_GEOMETRY.titleChip.insetFromSectionCornerPx}px;
          height: ${SECTION_GEOMETRY.titleChip.heightPx}px;
          display: flex;
          align-items: center;
          border-style: solid;
          border-width: ${SECTION_GEOMETRY.titleChip.borderWidthPx}px;
          border-radius: 6px;
          padding: 0 ${SECTION_GEOMETRY.titleChip.paddingXPx}px;
          font-size: ${SECTION_GEOMETRY.titleChip.fontSizePx}px;
          font-weight: ${SECTION_GEOMETRY.titleChip.fontWeight};
          transform-origin: top left;
          color: ${SECTION_GEOMETRY.titleChip.textColor};
          white-space: nowrap;
          overflow: hidden;
        }
        /* Zoomed-out truncation: the chip's max-width caps the scaled chip to
           its section's inner width; the flex-item inner span turns the
           overflow into an ellipsis instead of a mid-letter clip. */
        .interactive-canvas-section-title-chip > span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
`,
  defaults: {
    // W2 — sections default large (they're meant to wrap other objects, so a
    // backdrop-sized footprint reads better than a shape-sized default).
    geometry: { x: 80, y: 80, width: 480, height: 360 },
    tone: "neutral",
    shape: "section",
    label: "Section",
  },
  // Sections get corner-only handles; locked sections refuse resize/drag.
  handles: "corners",
  hitTest: "solid",
  // Section membership is a persisted, auto-managed parentId (assigned on
  // drop into a section, cleared on drop onto open canvas); dragging a
  // section carries its transitive parentId descendants along.
  dragCapture: "descendants",
  toolbar: SECTION_TOOLBAR,
  labelEditing: { target: "section-title" },
};
