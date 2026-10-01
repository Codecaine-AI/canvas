"use client";

import { resolveTextSlot, TITLE_CHIP_TEXT_SLOT } from "../text-slots";
import type { CanvasBounds } from "../../state/geometry";
import type { InteractiveCanvasObject } from "../../state/schema";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../../theme/canvas-style";

export function resolveSectionTitleChipSlot(
  section: InteractiveCanvasObject,
  zoom = 1,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
) {
  return resolveTextSlot(TITLE_CHIP_TEXT_SLOT, section, zoom, { canvasStyle });
}

/**
 * The old nested chip used `left/top = inset - sectionBorderWidth` inside the
 * section button. Absolute children are positioned from the button padding
 * edge, so the visual world position was always section origin + inset.
 */
export function sectionTitleChipWorldRect(
  section: InteractiveCanvasObject,
  zoom = 1,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): CanvasBounds {
  const resolved = resolveSectionTitleChipSlot(section, zoom, canvasStyle);
  return {
    x: section.geometry.x + resolved.rect.x,
    y: section.geometry.y + resolved.rect.y,
    width: resolved.rect.width * resolved.scale,
    height: resolved.rect.height * resolved.scale,
  };
}
