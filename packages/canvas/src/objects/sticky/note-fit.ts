/**
 * A card note drawn at the height its text needs.
 *
 * A note's text height depends on the theme (its sticky font, line pitch and
 * padding tokens), and the theme is a view setting, not part of the file. A
 * stored height can only be right for the theme it was written under: notes
 * written for the 24px paper sticky keep that height when the schematic card
 * draws them at 16px, and show a band of empty card under the text.
 *
 * So the renderers (the live sticky view, the static SVG) and the note's hit
 * and selection bounds take the note's height from here: the height its text
 * needs under the current style, padding included, rounded up to the agent
 * grid, never above the stored height. The stored height stays the source of
 * truth for everything else, and it caps the note: text longer than it still
 * clips with the ellipsis. Only card notes fit; a paper sticky (figjam) keeps
 * its square paper.
 *
 * Pure: no React, no DOM.
 */
import type { CanvasGeometry, InteractiveCanvasObject } from "../../state/schema";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../../theme/canvas-style";
import { layoutStickyText } from "./sticky-text";
import { AGENT_GRID } from "../../state/geometry";
import { INSET_BODY_TEXT_SLOT, insetBodyPaddingPx, resolveTextSlot, slotLineHeightPx } from "../text-slots";

/**
 * The geometry `object` draws at under `canvasStyle`: a card note with text
 * shrinks to the height its text needs (at least one line, padding included,
 * on the agent grid); every other object, and a note whose text needs its
 * full height, draws at its stored geometry.
 */
export function noteDrawnGeometry(
  object: InteractiveCanvasObject,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): CanvasGeometry {
  const { geometry } = object;
  if (object.style?.shape !== "note" || canvasStyle.stickyStyle !== "card" || object.text.trim() === "") {
    return geometry;
  }
  const { rect, typography } = resolveTextSlot(INSET_BODY_TEXT_SLOT, object, 1, { canvasStyle });
  if (rect.width <= 0) return geometry;
  const rows = layoutStickyText(object.text, rect.width, typography.fontSizePx, canvasStyle.stickyHeadingScale).length;
  const padding = insetBodyPaddingPx(canvasStyle);
  const needed = padding.top + Math.max(1, rows) * slotLineHeightPx(typography) + padding.bottom;
  const height = Math.min(geometry.height, Math.ceil(needed / AGENT_GRID) * AGENT_GRID);
  return height === geometry.height ? geometry : { ...geometry, height };
}

/** `object` at its drawn geometry (noteDrawnGeometry): the same object when nothing changes. */
export function asDrawn(object: InteractiveCanvasObject, canvasStyle: CanvasStyle): InteractiveCanvasObject {
  const geometry = noteDrawnGeometry(object, canvasStyle);
  return geometry === object.geometry ? object : { ...object, geometry };
}
