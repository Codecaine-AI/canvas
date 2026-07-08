"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { resolveSectionColors } from "../../palette";
import { FIRST_USE_COLORS } from "../../state/schema/object-defaults";
import type { CanvasBounds } from "../../state/geometry";
import type { InteractiveCanvasObject } from "../../state/schema";
import { titleChipMaxWidthPx } from "../text-slots";
import { resolveSectionTitleChipSlot } from "./title-chip-geometry";

export interface SectionTitleChipProps {
  section: InteractiveCanvasObject;
  zoom: number;
  bounds?: CanvasBounds;
  onObjectSelect?: (objectId: string) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    object: InteractiveCanvasObject,
    bounds: CanvasBounds,
  ) => void;
}

export function SectionTitleChip({
  section,
  zoom,
  bounds,
  onObjectSelect,
  onObjectContextMenu,
}: SectionTitleChipProps) {
  const family = resolveSectionColors(section.color ?? FIRST_USE_COLORS.section);
  const resolved = resolveSectionTitleChipSlot(section, zoom);
  const titleScale = resolved.scale;

  return (
    <span
      className="interactive-canvas-section-title-chip"
      data-canvas-object-id={section.id}
      data-canvas-section-title-chip={section.id}
      style={{
        left: `${section.geometry.x + resolved.rect.x}px`,
        top: `${section.geometry.y + resolved.rect.y}px`,
        background: family.chip.fill,
        borderColor: family.chip.border,
        maxWidth: `${titleChipMaxWidthPx(section.geometry.width, titleScale)}px`,
        pointerEvents: "auto",
        ...(titleScale !== 1
          ? {
              transform: `scale(${titleScale})`,
            }
          : {}),
      }}
      onClick={(event) => {
        event.stopPropagation();
        onObjectSelect?.(section.id);
      }}
      onContextMenu={(event) => {
        if (!onObjectContextMenu || !bounds) return;
        event.preventDefault();
        event.stopPropagation();
        onObjectContextMenu(event, section, bounds);
      }}
    >
      <span>{section.text}</span>
    </span>
  );
}
