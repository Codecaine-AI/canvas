"use client";

import { resolveSectionColors } from "../../theme/resolve";
import { CONNECTOR_DASH_PATTERN_PX, SECTION_GEOMETRY } from "../../theme/tokens";
import type { ObjectDef, ObjectRenderProps } from "../object-def";
import { SECTION_TOOLBAR } from "./toolbar";

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
          }}
        >
          {title}
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
          color: ${SECTION_GEOMETRY.titleChip.textColor};
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
