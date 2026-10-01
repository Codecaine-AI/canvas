"use client";

import { resolveTextSlot, TITLE_CHIP_TEXT_SLOT } from "../text-slots";
import type { CanvasBounds } from "../../state/geometry";
import type { InteractiveCanvasObject } from "../../state/schema";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../../theme/canvas-style";
import { titleChipLayout } from "./title-chip-layout";

export function resolveSectionTitleChipSlot(
  section: InteractiveCanvasObject,
  zoom = 1,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
) {
  return resolveTextSlot(TITLE_CHIP_TEXT_SLOT, section, zoom, { canvasStyle });
}

/**
 * The title chip's world rect at `zoom` — hit-testing, hover, painted extents,
 * and view framing read it.
 *
 * Floating: the chip box at section origin + inset, scaled about its anchor.
 * (The old nested chip used `left/top = inset - sectionBorderWidth` inside the
 * section button; absolute children are positioned from the button padding
 * edge, so the visual world position was always section origin + inset.)
 *
 * Pinned: the chip box sits right inside the section frame and scales about
 * the frame's inner corner; the frame strip above and left of it is the
 * chip's own top/left edge, so the rect starts at the section origin.
 */
export function sectionTitleChipWorldRect(
  section: InteractiveCanvasObject,
  zoom = 1,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): CanvasBounds {
  const { box, scale, placement } = titleChipLayout(section, canvasStyle, zoom);
  if (placement === "pinned") {
    return {
      x: section.geometry.x,
      y: section.geometry.y,
      width: box.x + box.width * scale,
      height: box.y + box.height * scale,
    };
  }
  return {
    x: section.geometry.x + box.x,
    y: section.geometry.y + box.y,
    width: box.width * scale,
    height: box.height * scale,
  };
}
