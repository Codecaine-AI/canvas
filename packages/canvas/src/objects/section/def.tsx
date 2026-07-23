"use client";

import { resolveSectionColors } from "../../theme/palette";
import { FIRST_USE_COLORS, objectTypeDefaults } from "../../state/schema/object-defaults";
import { CONNECTOR_DASH_PATTERN_PX } from "../../connectors/def";
import { BBOX_OUTLINE } from "../geometry";
import { resolveObjectBorderWidth } from "../object-shell";
import type { ObjectDef, ObjectRenderProps } from "../object-def";
import { TITLE_CHIP, TITLE_CHIP_TEXT_SLOT } from "../text-slots";
import { SECTION_TOOLBAR } from "./toolbar";

/**
 * Section frame geometry. The title CHIP's geometry/typography/scale live on
 * the "title-chip" text-slot preset (objects/text-slots.ts TITLE_CHIP) — the
 * single source the at-rest chip, the in-place title editor, and this def's
 * CSS all consume.
 */
export const SECTION_GEOMETRY = {
  cornerRadiusPx: 8.5,
  borderWidthPx: 2,
} as const;

/**
 * FigJam section (W2) — a large tinted backdrop with a floating title chip
 * in the top-left corner, per the title-chip slot preset. Deliberately NOT
 * built on the generic button/label trim the shape family shares: sections
 * have no centered text, no shadow, no edge ports, and their "border" is
 * literally the title chip's fill color (per spec, border = chip fill).
 *
 * CanvasStage owns the floating title chip layer; this renderer is only the
 * section body/backdrop and optional dashed frame.
 */
function SectionObjectView({
  object,
  selected,
  dropTarget,
  bounds,
  editable,
  onObjectSelect,
  onObjectContextMenu,
}: ObjectRenderProps) {
  // P1 — the section's color pick resolves through the palette's section
  // role cells: body fill = tint, frame border = the title chip's FILL color
  // (§3.2: chip fill IS the section border color), chip = fill + border pair.
  const family = resolveSectionColors(object.color ?? FIRST_USE_COLORS.section);
  const borderColor = family.chip.fill;
  const borderStyle = object.style?.strokeStyle ?? "solid";
  const borderWidth = resolveObjectBorderWidth(object, "section", "painted", {
    defaultSectionBorderWidthPx: SECTION_GEOMETRY.borderWidthPx,
  });
  const renderedStrokeWidth = object.style?.strokeWidth ?? SECTION_GEOMETRY.borderWidthPx;
  const title = object.text;
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
      aria-label={title}
      style={{
        left: `${object.geometry.x}px`,
        top: `${object.geometry.y}px`,
        width: `${object.geometry.width}px`,
        height: `${object.geometry.height}px`,
        background: family.tint,
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
    </button>
  );
}

export const sectionDef: ObjectDef = {
  kind: "section",
  render: SectionObjectView,
  css: `
        /* W2 — section: tint fill, subtle border (= chip fill), no shadow, no
           button-style trim; the floating title chip renders in CanvasStage's
           section-header layer. */
        .interactive-canvas-object-section {
          border-style: solid;
          border-width: ${SECTION_GEOMETRY.borderWidthPx}px;
          border-radius: ${SECTION_GEOMETRY.cornerRadiusPx}px;
          padding: 0;
          box-shadow: none;
          align-items: stretch;
          justify-content: flex-start;
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
          left: ${TITLE_CHIP.insetFromSectionCornerPx}px;
          top: ${TITLE_CHIP.insetFromSectionCornerPx}px;
          height: ${TITLE_CHIP.heightPx}px;
          display: flex;
          align-items: center;
          border-style: solid;
          border-width: ${TITLE_CHIP.borderWidthPx}px;
          border-radius: 6px;
          padding: 0 ${TITLE_CHIP.paddingXPx}px;
          font-size: ${TITLE_CHIP.fontSizePx}px;
          font-weight: ${TITLE_CHIP.fontWeight};
          transform-origin: top left;
          color: ${TITLE_CHIP.textColor};
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
  // Stamped from the schema-vocabulary defaults leaf (P4); sections default
  // large there (a container-like footprint reads better than a shape-sized
  // default).
  defaults: objectTypeDefaults("section"),
  colorRole: "section",
  buttonBorder: "painted",
  // Sections get corner-only handles; locked sections refuse resize/drag.
  handles: "corners",
  outline: BBOX_OUTLINE,
  // Section membership is a persisted, auto-managed parentId (assigned on
  // drop into a section, cleared on drop onto open canvas); dragging a
  // section carries its transitive parentId descendants along.
  dragCapture: "descendants",
  toolbar: SECTION_TOOLBAR,
  textSlot: TITLE_CHIP_TEXT_SLOT,
  textEditing: { editable: true },
};
