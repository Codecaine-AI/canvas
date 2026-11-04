/**
 * board-too-large — a board fit to one view must keep its smallest text
 * readable (warning tier, finishing pass).
 *
 * A board is read whole, fit to one square view about FIT_VIEW_PX on a side:
 * a screen, a pinned print, or canvas_check's FIT_VIEW_PX-wide PNG shown on
 * one. The board's longer edge sets the scale, so a board drawn 4500px wide prints
 * its 14px details and wire labels at 5px. This rule takes the smallest
 * painted text size from the canvas style (the detail line and the wire
 * label chip) and fires when, at that scale, it falls below
 * MIN_FIT_TEXT_PX. The cure is layout, not type: rows of sections that grow
 * down instead of one long band, and tighter gaps.
 *
 * A session that opened a board already past the cap is judged only when it
 * makes the board larger, so a person's big board never blocks an edit that
 * did not grow it.
 */
import { boundsForGeometries } from "../../../state/geometry";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../../../theme/canvas-style";
import { pageFrameOf } from "../../helpers";

import type { InteractiveCanvasDocument } from "../../../state/schema";
import type { LayoutRule } from "../types";

/** Side in px of the square whole-board view a board is read at (canvas_check's PNG width). */
export const FIT_VIEW_PX = 1600;
/** Smallest text size, in rendered px at that view, that reads at arm's length. */
export const MIN_FIT_TEXT_PX = 9;

/** The longest board edge, in px, whose smallest text still prints at MIN_FIT_TEXT_PX in the fit view. */
export function boardEdgeCapPx(style: Pick<CanvasStyle, "detailFontSizePx" | "connectorLabelFontSizePx"> = DEFAULT_CANVAS_STYLE): number {
  return Math.floor((FIT_VIEW_PX * smallestTextPx(style)) / MIN_FIT_TEXT_PX);
}

function smallestTextPx(style: Pick<CanvasStyle, "detailFontSizePx" | "connectorLabelFontSizePx">): number {
  return Math.min(style.detailFontSizePx, style.connectorLabelFontSizePx);
}

/** The painted extent's longer edge, or 0 for an empty board. */
function longEdge(document: InteractiveCanvasDocument): { width: number; height: number; edge: number } {
  const bounds = boundsForGeometries(document.objects.map((object) => object.geometry), 0);
  if (!bounds) return { width: 0, height: 0, edge: 0 };
  return { width: bounds.width, height: bounds.height, edge: Math.max(bounds.width, bounds.height) };
}

const GUIDANCE = `A board is read whole, fit to one ${FIT_VIEW_PX}px square view, so its longer edge sets every text size:
- this finishing-pass warning fires when the smallest painted text (the detail line or a wire
  label, from the canvas style) renders under ${MIN_FIT_TEXT_PX}px at that view; with 14px text
  that is a longer edge past about ${Math.floor((FIT_VIEW_PX * 14) / MIN_FIT_TEXT_PX)}px;
- shrink the board, not the type: aim for a near-square board, so stack a long band of sections in
  rows (or set a tall stack side by side), pull neighbors to about one node width apart, shorten notes, then fit_section each section and
  the page frame;
- a board that was already this large when the session opened is judged only when the session
  makes it larger.`;

export const rule: LayoutRule = {
  id: "board-too-large",
  title: "Board too large to read whole",
  tier: "warning",
  guidance: GUIDANCE,
  check(document, context) {
    const style = context?.canvasStyle ?? DEFAULT_CANVAS_STYLE;
    const textPx = smallestTextPx(style);
    const maxEdge = boardEdgeCapPx(style);
    const now = longEdge(document);
    if (now.edge <= maxEdge) return [];
    const before = context?.baseline ? longEdge(context.baseline).edge : 0;
    if (before > maxEdge && now.edge <= before) return [];

    const scale = FIT_VIEW_PX / now.edge;
    const printed = Math.round(textPx * scale * 10) / 10;
    const frame = pageFrameOf(document);
    const bounds = boundsForGeometries(document.objects.map((object) => object.geometry), 0)!;
    const wide = now.width >= now.height;
    return [{
      rule: "board-too-large",
      severity: "warning",
      at: frame ? [frame.id] : [],
      where: bounds,
      message:
        `board is ${Math.round(now.width)}×${Math.round(now.height)}px; fit to a ${FIT_VIEW_PX}px square view it `
        + `renders at ${scale.toFixed(2)}×, so ${textPx}px details and wire labels print at ${printed}px `
        + `— keep the longer edge ≤ ${maxEdge}px`,
      suggestion:
        `cut ${Math.round(now.edge - maxEdge)}px from the ${wide ? "width" : "height"}: `
        + (wide ? "stack sections in rows that grow down" : "set stacked sections side by side")
        + ", move neighbors to about one node width apart with "
        + "move_to or move_by, shorten notes, then fit_section each section and the page frame",
    }];
  },
};
