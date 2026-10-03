/**
 * The canvas's one text-measuring module: every width, wrap, and fit the
 * canvas computes (caption bands, title and label chips, the static
 * renderer's lines and ellipses, the agent's fit checks) goes through
 * @codecaine-ai/text-measure — Pretext line breaking over the active
 * measuring backend — so a label that measures as fitting is a label that
 * fits where the browser and resvg paint it.
 *
 * Hosts pick the backend before they lay anything out: Bun/Node hosts
 * `await useHarfBuzz()` (exact shaping of the bundled TTFs), browser hosts
 * load the bundled faces with `useBrowserFonts()` (exact native canvas
 * measurement). Until then the approximate table backend measures, and the
 * live stage re-renders when the backend switches (canvas-style-context.tsx).
 *
 * A FontSpec names the CSS family stack the painter uses — the stage's
 * "Inter, …" or "IBM Plex Mono, …" stacks from ./fonts.ts — and the package
 * measures the first family. Pure and Node-safe; imports nothing first-party.
 */

import { fitText, measureWidth, wrapText, type FontSpec } from "@codecaine-ai/text-measure";

export type {
  FitResult,
  FitVerdict,
  FontSpec,
  RunFragment,
  RunsLine,
  RunsWrapResult,
  TextLine,
  TextRun,
  WrapResult,
} from "@codecaine-ai/text-measure";
export {
  activeBackend,
  fitText,
  measureWidth,
  onBackendChange,
  uncoveredChars,
  wrapRuns,
  wrapText,
} from "@codecaine-ai/text-measure";

/** The ellipsis CSS `text-overflow: ellipsis` and -webkit-line-clamp paint. */
export const ELLIPSIS = "…";

/**
 * A box width in Chromium layout units (1/64 px, rounded down): the room a
 * box `widthPx` wide really offers. measureWidth() rounds text up to the
 * same units, so `measureWidth(text) <= layoutBoxWidth(box)` is the
 * browser's own "fits on one line" test.
 */
export function layoutBoxWidth(widthPx: number): number {
  return Number.isFinite(widthPx) ? Math.floor(widthPx * 64 + 1e-6) / 64 : widthPx;
}

/** Whether `text` paints on one line inside a box `widthPx` wide (CSS white-space: nowrap). */
export function fitsOnOneLine(text: string, font: FontSpec, widthPx: number): boolean {
  return measureWidth(text, font) <= layoutBoxWidth(widthPx);
}

let graphemeSegmenter: Intl.Segmenter | null = null;

/** Grapheme clusters (user-perceived characters) of `text`, in order. */
export function graphemeClusters(text: string): string[] {
  graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const out: string[] = [];
  for (const { segment } of graphemeSegmenter.segment(text)) out.push(segment);
  return out;
}

/**
 * Painted width of one line of `text` under `whiteSpace`: "normal" collapses
 * whitespace runs and trims the ends (measureWidth, a nowrap box); "pre-wrap"
 * keeps every space as laid out, leading and repeated ones included, and
 * lets trailing ones hang (they add no width).
 */
export function measureLineWidth(text: string, font: FontSpec, whiteSpace: "normal" | "pre-wrap" = "normal"): number {
  if (whiteSpace === "normal") return measureWidth(text, font);
  if (text === "") return 0;
  return wrapText(text, font, { maxWidth: Number.POSITIVE_INFINITY, lineHeight: 1, whiteSpace }).maxLineWidth;
}

/**
 * `text` cut the way CSS `text-overflow: ellipsis` cuts one overflowing line
 * (and -webkit-line-clamp its last line): the longest grapheme prefix,
 * trailing whitespace dropped, that still fits `widthPx` with the ellipsis
 * after it. The bare ellipsis when no grapheme fits but the ellipsis does,
 * "" when not even that fits. `ellipsisFont` is the font the ellipsis paints
 * in (CSS paints it in the line's block font); default `font`. `whiteSpace`
 * is the line's: "pre-wrap" lines keep their repeated spaces, so the kept
 * prefix is measured with them.
 *
 * Callers decide first whether the text overflows at all — this always cuts.
 */
export function ellipsizeToWidth(
  text: string,
  font: FontSpec,
  widthPx: number,
  ellipsisFont: FontSpec = font,
  whiteSpace: "normal" | "pre-wrap" = "normal",
): string {
  const room = layoutBoxWidth(widthPx);
  const ellipsisWidth = measureWidth(ELLIPSIS, ellipsisFont);
  if (ellipsisWidth > room) return "";
  const parts = graphemeClusters(text);
  // Only collapsible whitespace is dropped before the ellipsis; a no-break space is text.
  const prefix = (count: number) => parts.slice(0, count).join("").replace(/[ \t\n\r\f]+$/, "");
  const fits = (count: number) => {
    const kept = prefix(count);
    if (kept === "") return true;
    return ellipsisFont === font
      ? measureLineWidth(`${kept}${ELLIPSIS}`, font, whiteSpace) <= room
      : measureLineWidth(kept, font, whiteSpace) + ellipsisWidth <= room;
  };
  // Widths grow with the prefix (kerning aside): binary search the longest fit.
  let low = 0;
  let high = parts.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  const kept = prefix(low);
  return kept === "" ? ELLIPSIS : `${kept}${ELLIPSIS}`;
}

/**
 * Whether `font` measures exactly: an exact backend is active and the font
 * is a bundled family at a bundled weight (fitText's `reliable`, minus the
 * text's own uncovered characters).
 */
export function measuresExactly(font: FontSpec): boolean {
  return fitText("", font, { width: 0, lineHeight: 0 }).reliable;
}
