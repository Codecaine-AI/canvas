"use client";

import { resolveTextSlot, TITLE_CHIP_TEXT_SLOT } from "../text-slots";
import type { CanvasBounds } from "../../state/geometry";
import type { InteractiveCanvasObject } from "../../state/schema";

export function resolveSectionTitleChipSlot(section: InteractiveCanvasObject, zoom = 1) {
  return resolveTextSlot(TITLE_CHIP_TEXT_SLOT, section, zoom);
}

/**
 * The old nested chip used `left/top = inset - sectionBorderWidth` inside the
 * section button. Absolute children are positioned from the button padding
 * edge, so the visual world position was always section origin + inset.
 */
export function sectionTitleChipWorldRect(section: InteractiveCanvasObject, zoom = 1): CanvasBounds {
  const resolved = resolveSectionTitleChipSlot(section, zoom);
  return {
    x: section.geometry.x + resolved.rect.x,
    y: section.geometry.y + resolved.rect.y,
    width: resolved.rect.width * resolved.scale,
    height: resolved.rect.height * resolved.scale,
  };
}
