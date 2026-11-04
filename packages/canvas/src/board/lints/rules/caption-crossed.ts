/**
 * caption-crossed — a wire runs through an icon's caption (warning tier).
 *
 * An icon paints its name and detail in a caption band under its tile, and
 * wires meet the tile: the side ports sit level with the tile and the bottom
 * port under the caption. A wire that reaches a side port from below, or
 * whose port was slid into the band with `position`, draws its line through
 * the caption's text. Judges named it on 3 of the 6 high-effort round 0
 * boards ("cuts through the 'stores no credentials' sublabel", "runs up
 * through the 'Scenario worker' label", "lands on Tier router's sublabel"),
 * and no rule caught it: broken-edges exempts a wire's own endpoints, and the
 * router avoids only other icons' tiles.
 *
 * Measured on the renderer's true polyline against the caption band in world
 * space (the below-extended bounds minus the glyph box). A run of CAPTION_RUN
 * px or more inside the band is a finding, whether the band belongs to the
 * wire's own endpoint or to another object. The fix is the port or the
 * placement, never a waypoint: meet the tile on the side away from the
 * caption, or move a box so the wire meets the tile level with it.
 */
import { belowExtendedBoundsPx, iconGlyphBoxPx } from "../../../objects/text-slots";
import { DEFAULT_CANVAS_STYLE } from "../../../theme/canvas-style";
import { kindOf } from "../../helpers";
import { polylineLengthInRect, routedPolyline, type Rect } from "../geometry";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../../state/schema";
import type { LayoutRule, LintContext } from "../types";

/** Shortest run inside a caption band that reads as a line through its text. */
const CAPTION_RUN = 8;

const GUIDANCE = `A wire never runs through an icon's caption, the name and detail painted under its tile:
- this warning fires when the drawn route runs ${CAPTION_RUN}px or more inside a caption band,
  its own endpoint's or another object's; the bottom port sits under the caption, so a wire
  that leaves or arrives there straight down is clear;
- the usual cause is a side port reached from below, or a port slid into the band with position;
- fix the port or the placement: change_connection the wire to meet the tile on the side away
  from the caption (anchor top, or left or right when the other end is level with the tile), or
  move_to a box so the wire meets the tile level with it; a waypoint cannot clear it.`;

/** The world rect of `object`'s caption band, or null when nothing paints under its glyph. */
function captionBand(object: InteractiveCanvasObject, context?: LintContext): Rect | null {
  if (kindOf(object) !== "node") return null;
  const style = context?.canvasStyle ?? DEFAULT_CANVAS_STYLE;
  const glyph = iconGlyphBoxPx(object, style);
  const extended = belowExtendedBoundsPx(object, style);
  const top = glyph.y + glyph.height;
  const height = extended.y + extended.height - top;
  if (height <= 0) return null;
  return {
    x: object.geometry.x + extended.x,
    y: object.geometry.y + top,
    width: extended.width,
    height,
  };
}

export const rule: LayoutRule = {
  id: "caption-crossed",
  title: "Wire through a caption",
  tier: "warning",
  guidance: GUIDANCE,
  check(document: InteractiveCanvasDocument, context) {
    const bands = document.objects
      .map((object) => ({ object, band: captionBand(object, context) }))
      .filter((entry): entry is { object: InteractiveCanvasObject; band: Rect } => entry.band !== null);
    if (bands.length === 0) return [];
    const findings: ReturnType<LayoutRule["check"]> = [];
    for (const edge of document.connections) {
      const points = routedPolyline(edge, document, context?.canvasStyle);
      if (points.length < 2) continue;
      for (const { object, band } of bands) {
        const run = polylineLengthInRect(points, band);
        if (run < CAPTION_RUN) continue;
        const own = object.id === edge.from.objectId || object.id === edge.to.objectId;
        const other = object.id === edge.from.objectId ? edge.to.objectId : edge.from.objectId;
        findings.push({
          rule: "caption-crossed",
          severity: "warning",
          at: [edge.id, object.id],
          where: band,
          message: `${edge.id} runs ${Math.round(run)}px through ${object.id}'s caption`
            + (own ? " on its way to the tile's port" : ""),
          suggestion: own
            ? `change_connection ${edge.id} to meet ${object.id} on the side away from the caption `
              + `(anchor top, or left or right when ${other} is level with the tile), `
              + `or move_to ${other} level with ${object.id}'s tile`
            : `move_to ${object.id} clear of ${edge.id}, or move_to one of its ends so the wire runs clear of the caption`,
        });
      }
    }
    return findings;
  },
};
