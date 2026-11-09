/**
 * A card note's one height: the height its text needs.
 *
 * On the schematic themes (stickyStyle "card") a note is a text card, so its
 * stored height is fitted on every write that changes its text, its shape or
 * its size: padding plus its wrapped rows, at least one row, rounded up to
 * the agent grid. Width stays as set. The renderers, hit testing, selection,
 * connector anchors and export framing all read that one stored height.
 *
 * Writers: the agent's auto-size pass (session/tools/operations/auto-size.ts:
 * place_sticky, update_text, change_shape, resize, match_size), Studio's text
 * editor and Inspector text field (noteTextPatch), and Studio's resize
 * gesture (stage/editor/features/selection/resize.ts). A resize keeps a
 * dragged height at or above the needed one; every other write sets it
 * exactly, so a note shrinks as well as grows. fitNotesToText fits a whole
 * board once, for migrating boards written before this rule.
 *
 * A paper sticky (figjam, stickyStyle "paper") keeps its square paper and is
 * never fitted.
 *
 * Pure: no React, no DOM.
 */
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import type { CanvasStyle } from "../../theme/canvas-style";
import { settleSections } from "../../state/section-grow";
import { AGENT_GRID } from "../../state/geometry";
import { layoutStickyText } from "./sticky-text";
import { INSET_BODY_TEXT_SLOT, insetBodyPaddingPx, resolveTextSlot, slotLineHeightPx } from "../text-slots";

type Geometry = InteractiveCanvasObject["geometry"];

/** Whether `object` is a card note under `canvasStyle`: the only kind that fits its text. */
export function isCardNote(object: InteractiveCanvasObject, canvasStyle: CanvasStyle): boolean {
  return object.style?.shape === "note" && canvasStyle.stickyStyle === "card";
}

/**
 * The height a card note's text needs at `width` (default: its own): top
 * padding, its wrapped rows (at least one) on the line pitch, bottom
 * padding, rounded up to the agent grid. Undefined for anything that is not
 * a card note.
 */
export function noteNeededHeight(
  object: InteractiveCanvasObject,
  canvasStyle: CanvasStyle,
  width: number = object.geometry.width,
): number | undefined {
  if (!isCardNote(object, canvasStyle)) return undefined;
  const sized = width === object.geometry.width ? object : { ...object, geometry: { ...object.geometry, width } };
  const { rect, typography } = resolveTextSlot(INSET_BODY_TEXT_SLOT, sized, 1, { canvasStyle });
  const rows = object.text.trim() === "" || rect.width <= 0
    ? 1
    : layoutStickyText(object.text, rect.width, typography.fontSizePx, canvasStyle.stickyHeadingScale).length;
  const padding = insetBodyPaddingPx(canvasStyle);
  const needed = padding.top + Math.max(1, rows) * slotLineHeightPx(typography) + padding.bottom;
  return Math.ceil(needed / AGENT_GRID - 1e-9) * AGENT_GRID;
}

/**
 * `object`'s geometry with its height fitted to its text, top-left held:
 * exactly the needed height, or with `atLeast` the current height when that
 * is taller (a resize). The same geometry object when nothing changes, or
 * when `object` is not a card note.
 */
export function fittedNoteGeometry(
  object: InteractiveCanvasObject,
  canvasStyle: CanvasStyle,
  atLeast = false,
): Geometry {
  const needed = noteNeededHeight(object, canvasStyle);
  if (needed === undefined) return object.geometry;
  const height = atLeast ? Math.max(needed, object.geometry.height) : needed;
  return height === object.geometry.height ? object.geometry : { ...object.geometry, height };
}

/**
 * A Studio text patch for `object`: `{ text }`, plus the fitted geometry
 * when `object` is a card note whose height must change for the new text.
 */
export function noteTextPatch(
  object: InteractiveCanvasObject | undefined,
  text: string,
  canvasStyle: CanvasStyle,
): { text: string; geometry?: Geometry } {
  if (!object) return { text };
  const geometry = fittedNoteGeometry({ ...object, text }, canvasStyle);
  return geometry === object.geometry ? { text } : { text, geometry };
}

/**
 * `document` with every card note fitted to its text (paper stickies and
 * every other object untouched). When a note grew, its sections grow around
 * it by section auto-grow (state/section-grow.ts); when notes only shrank,
 * no section moves. Sections never shrink. The same document when nothing
 * changes.
 * For a one-off migration of boards written before the fit-on-write rule;
 * opening a board never runs it.
 */
export function fitNotesToText(
  document: InteractiveCanvasDocument,
  canvasStyle: CanvasStyle,
): InteractiveCanvasDocument {
  let changed = false;
  let grew = false;
  const objects = document.objects.map((object) => {
    const geometry = fittedNoteGeometry(object, canvasStyle);
    if (geometry === object.geometry) return object;
    changed = true;
    grew ||= geometry.height > object.geometry.height;
    return { ...object, geometry };
  });
  if (!changed) return document;
  return grew ? settleSections({ ...document, objects }) : { ...document, objects };
}
