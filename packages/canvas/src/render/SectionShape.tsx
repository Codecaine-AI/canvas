"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import type { CanvasBounds } from "../model/geometry";
import { resolveSectionColors } from "./theme";
import { CONNECTOR_DASH_PATTERN_PX, SECTION_GEOMETRY } from "./figjam-tokens";
import type { InteractiveCanvasObject } from "../model/schema";

/**
 * FigJam section render (W2) — a large tinted backdrop with a floating
 * title chip in the top-left corner, per SECTION_GEOMETRY. Deliberately NOT
 * built on the generic button/label/body layout the other shapes share:
 * sections have no centered label, no shadow, and their "border" is
 * literally the title chip's fill color (per spec, border = chip fill).
 */
export function SectionShape({
  object,
  selected,
  dropTarget,
  bounds,
  editable,
  hideTitle,
  onObjectSelect,
  onObjectContextMenu,
}: {
  object: InteractiveCanvasObject;
  selected: boolean;
  dropTarget?: boolean;
  bounds: CanvasBounds;
  editable?: boolean;
  hideTitle?: boolean;
  onObjectSelect?: (objectId: string) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
}) {
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
      {!hideTitle && (
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
