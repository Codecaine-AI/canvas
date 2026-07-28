/**
 * text-fit — "would this text still be readable in this box?", answered by the
 * RENDERER's own wrap/clamp decision rather than a second implementation of
 * it (docs/30-agent-layout/50-tool-surface/10-gestures §Arrange, "Size has
 * rules").
 *
 * `resize` shrinking a box below what its text needs, and `update_text`
 * writing text longer than its box holds, both fire a report-only warning in
 * the tool result (an `OpOutcome.notes` line under the APPLIED headline) —
 * the same philosophy as the unreadable-labels lint: say it, don't block it.
 *
 * Parity, not estimation. The verdict comes from the exact functions the
 * static renderer paints with:
 *   - slot geometry     `resolveTextSlot` + `textSlotForObject` (the slot the
 *                        renderer picks, inscribed rects included)
 *   - body wrap/clamp   `wrapTextLines` / `clampLines` over real Inter
 *                        advances (render/text-metrics.ts)
 *   - sticky bodies     `layoutStickyText` + `STICKY_LINE_PITCH_PX`
 *   - section titles    `estimateTitleChipWidthPx` + `titleChipMaxWidthPx`
 *   - edge labels       `chipWidth` + `CHIP_HEIGHT` (lints/geometry.ts, itself
 *                        pinned to the renderer by lints-chip-parity.test.ts)
 * Those renderer internals are module-private to the read-only canvas package
 * and are NOT on its public `./render` export surface, so they are deep-
 * imported here — the established pattern (board/lints/geometry.ts does the
 * same for `routeConnection`). test/text-fit-parity.test.ts pins the verdict
 * to actual clipped SVG output; drift fails that test.
 *
 * Scope of `fits`: TRUNCATION only — a dropped line or an ellipsis. Intra-word
 * breaking (a single word wider than the slot) is not truncation, so it does
 * not on its own flip `fits`; it does drive `neededSize.width`, since no
 * amount of extra height ever un-breaks a too-long word.
 */

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

import {
  clampLines,
  effectiveRenderShape,
  textSlotForObject,
  wrapTextLines,
} from "../../../canvas/src/render/static-svg.ts";
import { measureInterTextPx } from "../../../canvas/src/render/text-metrics.ts";
import {
  layoutStickyText,
  STICKY_LINE_PITCH_PX,
} from "../../../canvas/src/render/sticky-text.ts";
import {
  estimateTitleChipWidthPx,
  INSET_BODY_TEXT_SLOT,
  resolveTextSlot,
  slotLineHeightPx,
  TITLE_CHIP,
  titleChipMaxWidthPx,
} from "../../../canvas/src/objects/text-slots.ts";

import { CHIP_CLEARANCE, CHIP_HEIGHT, chipWidth } from "./lints/geometry";

/** A box size in world units. */
export interface TextFitSize {
  width: number;
  height: number;
}

/**
 * What `textFitReport` was asked about — an object (shape label, sticky body,
 * section title) or a connection (edge label chip).
 */
export type TextFitTarget = InteractiveCanvasObject | InteractiveCanvasConnection;

/** Which rendering path decided the verdict (useful in tests and prose). */
export type TextFitSlot =
  | "shape-label"
  | "sticky-body"
  | "section-title"
  | "edge-label"
  | "none";

export interface TextFitReport {
  /** True when the render at `size` would show the text whole. */
  fits: boolean;
  /** Smallest box that shows it whole. Present only when `fits` is false. */
  neededSize?: TextFitSize;
  /** One short line, emitted verbatim as an `OpOutcome.notes` entry. */
  detail: string;
  /** The rendering path this verdict came from. */
  slot: TextFitSlot;
}

/** Upper bound for the needed-size search — past this the box is absurd. */
const MAX_SEARCH_PX = 20000;

function isConnection(target: TextFitTarget): target is InteractiveCanvasConnection {
  return (target as InteractiveCanvasConnection).from !== undefined;
}

/** The target object re-measured at a candidate size, carrying the new text. */
function probe(
  object: InteractiveCanvasObject,
  width: number,
  height: number,
  text: string,
): InteractiveCanvasObject {
  return { ...object, text, geometry: { ...object.geometry, width, height } };
}

/**
 * Smallest integer `value >= start` satisfying `fits`, or undefined when even
 * MAX_SEARCH_PX does not. Geometric probe then bisection; `fits` is monotonic
 * in both box dimensions for every slot here (a bigger box never shows less).
 */
function smallestFitting(start: number, fits: (value: number) => boolean): number | undefined {
  const from = Math.max(1, Math.ceil(start));
  if (fits(from)) return from;
  let hi = from;
  while (hi < MAX_SEARCH_PX) {
    hi = Math.min(hi * 2, MAX_SEARCH_PX);
    if (fits(hi)) break;
  }
  if (!fits(hi)) return undefined;
  let lo = from;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Widest single word, in px — the width no wrap can ever reduce. */
function longestWordWidthPx(text: string, fontSizePx: number, fontWeight: number): number {
  let widest = 0;
  for (const hardLine of text.split("\n")) {
    for (const word of hardLine.trim().split(/\s+/)) {
      if (word === "") continue;
      widest = Math.max(widest, measureInterTextPx(word, fontSizePx, fontWeight));
    }
  }
  return widest;
}

function round(size: TextFitSize): TextFitSize {
  return { width: Math.ceil(size.width), height: Math.ceil(size.height) };
}

function fitted(slot: TextFitSlot, detail: string): TextFitReport {
  return { fits: true, detail, slot };
}

// ---------------------------------------------------------------------------
// Shape labels — the center / rect / below slots, wrapped and clamped exactly
// as renderSlotTextBlock does.
// ---------------------------------------------------------------------------

function shapeLabelReport(
  object: InteractiveCanvasObject,
  size: TextFitSize,
  text: string,
): TextFitReport {
  const slot = textSlotForObject(object);
  if (!slot) return fitted("none", "this shape renders no text");

  // The "below" band sizes itself to the text (renderObjectText passes
  // clampToRect: false), so it never truncates.
  const clamps = slot.multiline && slot.placement !== "below";

  const measured = (width: number, height: number) => {
    const resolved = resolveTextSlot(slot, probe(object, width, height, text));
    const { rect, typography } = resolved;
    const lines =
      rect.width > 0
        ? wrapTextLines(text, rect.width, typography.fontSizePx, typography.fontWeight)
        : [];
    const capacity =
      clamps && rect.height > 0
        ? Math.max(1, Math.floor(rect.height / slotLineHeightPx(typography)))
        : Number.POSITIVE_INFINITY;
    return { resolved, rect, typography, lines, capacity };
  };

  const fitsAt = (width: number, height: number): boolean => {
    const { resolved, rect, typography, lines, capacity } = measured(width, height);
    // renderObjectText bails on a hidden slot; renderSlotTextBlock bails on a
    // zero-width rect. Either way the text is simply not painted.
    if (resolved.hidden || rect.width <= 0) return false;
    if (lines.length === 0 || capacity === Number.POSITIVE_INFINITY) return true;
    // Ask clampLines itself: an unchanged line count means nothing was
    // dropped and no ellipsis was appended.
    return (
      clampLines(lines, capacity, rect.width, typography.fontSizePx, typography.fontWeight)
        .length === lines.length
    );
  };

  const at = measured(size.width, size.height);
  if (fitsAt(size.width, size.height)) {
    const held = at.capacity === Number.POSITIVE_INFINITY ? "any" : String(at.capacity);
    return fitted(
      "shape-label",
      `label fits at ${fmtSize(size)}: ${at.lines.length} wrapped line(s), the box holds ${held}`,
    );
  }

  // A word wider than the slot breaks mid-word no matter how tall the box is,
  // so width comes first.
  const widestWord = longestWordWidthPx(
    text,
    at.typography.fontSizePx,
    at.typography.fontWeight,
  );
  const neededWidth =
    at.rect.width > 0 && widestWord <= at.rect.width
      ? Math.ceil(size.width)
      : (smallestFitting(size.width, (width) => {
          const rect = resolveTextSlot(slot, probe(object, width, size.height, text)).rect;
          return rect.width > 0 && rect.width >= widestWord;
        }) ?? Math.ceil(size.width));

  const neededHeight = smallestFitting(size.height, (height) => fitsAt(neededWidth, height));
  if (neededHeight === undefined) {
    return {
      fits: false,
      detail: `label clips at ${fmtSize(size)} and no reasonable box holds it — shorten it`,
      slot: "shape-label",
    };
  }
  const needed = round({ width: neededWidth, height: neededHeight });
  if (!Number.isFinite(at.capacity) || at.rect.width <= 0) {
    // Hidden slot / no width at all: the text is not painted, period.
    return {
      fits: false,
      neededSize: needed,
      detail: `label paints nothing at ${fmtSize(size)} — needs ${fmtSize(needed)}`,
      slot: "shape-label",
    };
  }
  return {
    fits: false,
    neededSize: needed,
    detail:
      `label clips at ${fmtSize(size)}: ${at.lines.length} wrapped line(s), ` +
      `the box holds ${at.capacity} — needs ${fmtSize(needed)}`,
    slot: "shape-label",
  };
}

// ---------------------------------------------------------------------------
// Sticky bodies — markdown line boxes on the 36px pitch.
// ---------------------------------------------------------------------------

function stickyBodyReport(
  object: InteractiveCanvasObject,
  size: TextFitSize,
  text: string,
): TextFitReport {
  const measured = (width: number, height: number) => {
    const resolved = resolveTextSlot(INSET_BODY_TEXT_SLOT, probe(object, width, height, text));
    const { rect, typography } = resolved;
    const rows =
      rect.width > 0 ? layoutStickyText(text, rect.width, typography.fontSizePx) : [];
    const capacity = rect.height > 0 ? Math.max(1, Math.floor(rect.height / STICKY_LINE_PITCH_PX)) : 0;
    return { resolved, rect, rows, capacity };
  };

  const fitsAt = (width: number, height: number): boolean => {
    const { resolved, rect, rows, capacity } = measured(width, height);
    if (resolved.hidden || rect.width <= 0 || rect.height <= 0) return false;
    return rows.length <= capacity;
  };

  const at = measured(size.width, size.height);
  if (fitsAt(size.width, size.height)) {
    return fitted(
      "sticky-body",
      `sticky body fits at ${fmtSize(size)}: ${at.rows.length} row(s), the note holds ${at.capacity}`,
    );
  }

  const neededHeight = smallestFitting(size.height, (height) => fitsAt(size.width, height));
  if (neededHeight === undefined) {
    return {
      fits: false,
      detail: `sticky body clips at ${fmtSize(size)} and no reasonable note holds it — shorten it`,
      slot: "sticky-body",
    };
  }
  const needed = round({ width: size.width, height: neededHeight });
  return {
    fits: false,
    neededSize: needed,
    detail:
      `sticky body clips at ${fmtSize(size)}: ${at.rows.length} row(s), ` +
      `the note holds ${at.capacity} — needs ${fmtSize(needed)}`,
    slot: "sticky-body",
  };
}

// ---------------------------------------------------------------------------
// Section titles — a chip, not a body slot. The chip auto-sizes to its text
// and ellipsizes at the section's inner width (renderSectionTitleChip). Judged
// at natural document scale (scale 1): zoomed-out renders counter-scale the
// chip, which only ever clips it sooner.
// ---------------------------------------------------------------------------

function sectionTitleReport(size: TextFitSize, text: string): TextFitReport {
  const chip = estimateTitleChipWidthPx(text);
  const budget = titleChipMaxWidthPx(size.width, 1);
  if (chip <= budget) {
    return fitted(
      "section-title",
      `section title fits at ${fmtSize(size)}: the chip wants ${Math.ceil(chip)}px of ${Math.floor(budget)}px`,
    );
  }
  const needed = round({
    width: chip + TITLE_CHIP.insetFromSectionCornerPx * 2,
    height: size.height,
  });
  return {
    fits: false,
    neededSize: needed,
    detail:
      `section title ellipsizes at ${fmtSize(size)}: the chip wants ${Math.ceil(chip)}px ` +
      `of ${Math.floor(budget)}px — needs ${needed.width} wide`,
    slot: "section-title",
  };
}

// ---------------------------------------------------------------------------
// Edge labels — the fixed-height chip from lints/geometry.ts. The chip never
// truncates; it grows, and an oversized chip stops fitting where it renders
// (exactly the unreadable-labels finding). `size` is therefore the room
// available to the chip — the corridor between the endpoint boxes.
// ---------------------------------------------------------------------------

function edgeLabelReport(size: TextFitSize, text: string): TextFitReport {
  const needed = round({
    width: chipWidth(text) + CHIP_CLEARANCE * 2,
    height: CHIP_HEIGHT + CHIP_CLEARANCE * 2,
  });
  if (needed.width <= size.width && needed.height <= size.height) {
    return fitted(
      "edge-label",
      `edge label fits: the chip wants ${needed.width}px of the ${Math.floor(size.width)}px corridor`,
    );
  }
  return {
    fits: false,
    neededSize: needed,
    detail:
      `edge label crowds its route: the chip wants ${needed.width}×${needed.height} ` +
      `of ${fmtSize(size)} — shorten it or open the gap`,
    slot: "edge-label",
  };
}

function fmtSize(size: TextFitSize): string {
  return `${Math.round(size.width)}×${Math.round(size.height)}`;
}

/**
 * Would `text` render whole in a `size` box on `object`?
 *
 * `size` is the box under consideration — the post-resize geometry for
 * `resize`, the object's current geometry for `update_text`. For a connection
 * target it is the room available to the label chip (the endpoint corridor);
 * pass the current corridor, or `Infinity` to ask only what the chip wants.
 *
 * `neededSize` is the smallest box that shows the text whole, and is present
 * only when `fits` is false. Aspect handling is deliberately simple: the
 * needed HEIGHT is measured at the given width, and the width grows only when
 * a single word cannot fit it (or, for a section title, when the chip itself
 * overruns the frame).
 */
export function textFitReport(
  object: TextFitTarget,
  size: TextFitSize,
  text: string,
): TextFitReport {
  if (isConnection(object)) {
    if (text.trim() === "") return fitted("none", "no label to fit");
    return edgeLabelReport(size, text);
  }
  if (text === "") return fitted("none", "no text to fit");
  if (size.width <= 0 || size.height <= 0) {
    return { fits: false, detail: "a zero-sized box paints no text", slot: "none" };
  }
  if (object.type === "section") return sectionTitleReport(size, text);
  if (effectiveRenderShape(object) === "note") return stickyBodyReport(object, size, text);
  return shapeLabelReport(object, size, text);
}
