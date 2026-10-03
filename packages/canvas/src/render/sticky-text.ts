/**
 * Sticky markdown line-box layout for the static renderer and the agent's
 * text fit.
 *
 * The live sticky renders its text through StickyMarkdown
 * (objects/sticky/markdown.tsx over the pure D18 grammar in
 * objects/sticky/markdown-editing.ts): headings, bullets with depth
 * indentation, bold and inline code, one 36px-pitch line box per source line,
 * wrapped by the browser inside the inset-body slot (`white-space: pre-wrap;
 * overflow-wrap: break-word`, inherited from the slot text). This module
 * reproduces those LINE BOXES — per-line font size/weight, indentation,
 * bullet glyph column — and wraps each source line as the browser wraps an
 * HTML block of mixed inline runs: text-measure's `wrapRuns` (break
 * opportunities over the whole line's text, each run shaped in its own font,
 * inline-code padding on its first and last fragment). The grammar itself is
 * not re-parsed here: lines come from the same parseStickyMarkdown the live
 * renderer consumes.
 *
 * Fonts (all bundled, so all measurable exactly): body Inter 400, `**bold**`
 * Inter 700 (CSS `bolder` — a bold run inside a 700 heading asks for 900 and
 * paints Inter Bold, the heaviest face), headings Inter 700 at 1.5 / 1.25 /
 * 1.1em, inline code IBM Plex Mono 400 at 0.85em with 0.15em padding a side.
 *
 * Visual constants are mirrored from the live implementation (markdown.tsx
 * HEADING_STYLE, the sticky def's line CSS in objects/sticky/def.tsx — those
 * modules are .tsx/React and cannot be imported here); each carries a pointer
 * to its source of truth.
 */

import {
  parseStickyMarkdown,
  STICKY_MARKDOWN_MONO_FONT_WEIGHT,
  type StickyMarkdownInlineToken,
} from "../objects/sticky/markdown-editing";
import { CANVAS_MONO_FONT_STACK, CANVAS_SANS_FONT_STACK } from "../theme/fonts";
import {
  graphemeClusters,
  measureLineWidth,
  measureWidth,
  uncoveredChars,
  wrapRuns,
  type FontSpec,
  type TextRun,
} from "../theme/text-measure";

/**
 * Line pitch: every markdown row — headings included — uses the sticky
 * body's 36px line box (mirrors STICKY_MARKDOWN_LINE_HEIGHT_PX and
 * STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX in objects/sticky/markdown.tsx).
 */
export const STICKY_LINE_PITCH_PX = 36;

/** Heading font sizes in em of the body size (markdown.tsx HEADING_STYLE). */
const HEADING_FONT_EM: Record<1 | 2 | 3, number> = { 1: 1.5, 2: 1.25, 3: 1.1 };

/** Heading rows render bold (markdown.tsx renderLine: fontWeight 700). */
const HEADING_FONT_WEIGHT = 700;
const BODY_FONT_WEIGHT = 400;
/** `<strong>` is `font-weight: bolder`: 700 on a 400 row, 900 (painted by the 700 face) on a heading. */
const STRONG_FONT_WEIGHT = 700;

/** Inline-code sizing (markdown.tsx renderInline `<code>` style). */
export const STICKY_CODE_FONT_EM = 0.85;
/** Inline-code horizontal padding a side, em of the code font size (`padding: 0 0.15em`). */
export const STICKY_CODE_PADDING_X_EM = 0.15;

/**
 * Indentation grid (the sticky def's line CSS in objects/sticky/def.tsx).
 * All values are em of the LINE's font size; visual depth clamps at 5.
 */
const MAX_VISUAL_DEPTH = 5;
const PLAIN_TEXT_NEST_EM = 0.125;
const BULLET_BLOCK_INSET_EM = 0.25;
const BULLET_GUTTER_EM = 0.75;

/** Bullet glyphs bucket raw depth 0 / 1 / 2+ (markdown.tsx stickyMarkdownLineAttrs). */
const BULLET_GLYPHS = ["•", "◦", "▪"] as const;

export type StickySegmentStyle = "plain" | "strong" | "code";

export interface StickyTextSegment {
  /** The run's text on this row as laid out (hanging trailing spaces included). */
  text: string;
  style: StickySegmentStyle;
  /** Offset from the slot rect's left edge (line indent included), px — where the segment's box starts. */
  xPx: number;
  /** Px the segment advances, its padding included (a code chip's box width). */
  widthPx: number;
  /** Padding before the text inside the segment's box (a code chip's leading 0.15em), px. */
  textOffsetPx: number;
  /** Effective font size (code runs at STICKY_CODE_FONT_EM of the row size). */
  fontSizePx: number;
  fontWeight: number;
}

export interface StickyTextRow {
  /** The line box's base font size (headings scale up from the body size). */
  fontSizePx: number;
  fontWeight: number;
  indentPx: number;
  /** Bullet glyph in its gutter column — first visual row of a bullet line only. */
  bullet?: { glyph: string; xPx: number };
  /** Empty for a blank source line (which still occupies its 36px line box). */
  segments: StickyTextSegment[];
}

function bulletGlyphForDepth(depth: number): string {
  return BULLET_GLYPHS[Math.min(depth, 2)]!;
}

/** The font a segment of `style` paints in on a row of this size and weight. */
export function stickySegmentFont(style: StickySegmentStyle, fontSizePx: number, fontWeight: number): FontSpec {
  return style === "code"
    ? { family: CANVAS_MONO_FONT_STACK, size: fontSizePx, weight: STICKY_MARKDOWN_MONO_FONT_WEIGHT }
    : { family: CANVAS_SANS_FONT_STACK, size: fontSizePx, weight: fontWeight };
}

/** One source line's inline tokens as text-measure runs, with their styles. */
function lineRuns(
  tokens: readonly StickyMarkdownInlineToken[],
  rowFontSizePx: number,
  rowFontWeight: number,
): { runs: TextRun[]; styles: StickySegmentStyle[] } {
  const runs: TextRun[] = [];
  const styles: StickySegmentStyle[] = [];
  for (const token of tokens) {
    if (token.kind === "text") {
      runs.push({ text: token.leaf.text, font: stickySegmentFont("plain", rowFontSizePx, rowFontWeight) });
      styles.push("plain");
    } else if (token.kind === "strong") {
      runs.push({ text: token.content.text, font: stickySegmentFont("strong", rowFontSizePx, STRONG_FONT_WEIGHT) });
      styles.push("strong");
    } else {
      const codeFontSizePx = rowFontSizePx * STICKY_CODE_FONT_EM;
      const padding = codeFontSizePx * STICKY_CODE_PADDING_X_EM;
      runs.push({
        text: token.content.text,
        font: stickySegmentFont("code", codeFontSizePx, rowFontWeight),
        padStart: padding,
        padEnd: padding,
      });
      styles.push("code");
    }
  }
  return { runs, styles };
}

/**
 * Lays sticky markdown source out into visual rows for a slot of the given
 * width. `bodyFontSizePx` is the inset-body slot's font size (the em basis
 * for headings, indentation and code sizing). Every returned row occupies one
 * STICKY_LINE_PITCH_PX line box; the caller owns vertical clamping.
 */
export function layoutStickyText(
  source: string,
  slotWidthPx: number,
  bodyFontSizePx: number,
): StickyTextRow[] {
  const rows: StickyTextRow[] = [];

  for (const line of parseStickyMarkdown(source).lines) {
    const heading = line.kind === "heading";
    const fontSizePx = heading
      ? bodyFontSizePx * HEADING_FONT_EM[line.headingLevel!]
      : bodyFontSizePx;
    const fontWeight = heading ? HEADING_FONT_WEIGHT : BODY_FONT_WEIGHT;
    const visualDepth = Math.min(line.depth, MAX_VISUAL_DEPTH);

    let indentPx: number;
    let bullet: StickyTextRow["bullet"];
    if (line.kind === "bullet") {
      indentPx = (BULLET_BLOCK_INSET_EM + (visualDepth + 1) * BULLET_GUTTER_EM) * fontSizePx;
      bullet = {
        glyph: bulletGlyphForDepth(line.depth),
        xPx: (BULLET_BLOCK_INSET_EM + visualDepth * BULLET_GUTTER_EM) * fontSizePx,
      };
    } else if (heading) {
      indentPx = visualDepth * fontSizePx;
    } else {
      indentPx = (visualDepth + PLAIN_TEXT_NEST_EM) * fontSizePx;
    }

    const { runs, styles } = lineRuns(line.inline, fontSizePx, fontWeight);
    // Blank line: the placeholder keeps its line box but paints nothing.
    if (line.placeholder || runs.length === 0) {
      rows.push({ fontSizePx, fontWeight, indentPx, ...(bullet ? { bullet } : null), segments: [] });
      continue;
    }

    const wrapped = wrapRuns(runs, {
      maxWidth: Math.max(0, slotWidthPx - indentPx),
      lineHeight: STICKY_LINE_PITCH_PX,
      whiteSpace: "pre-wrap",
    });
    const visualRows = wrapped.lines.length > 0 ? wrapped.lines : [{ fragments: [] }];
    visualRows.forEach((visual, index) => {
      const segments: StickyTextSegment[] = [];
      for (const fragment of visual.fragments) {
        const run = runs[fragment.run]!;
        const segment: StickyTextSegment = {
          text: fragment.text,
          style: styles[fragment.run]!,
          xPx: indentPx + fragment.x,
          widthPx: fragment.width,
          // Padding is a CSS length: Chromium keeps it in layout units, rounded down (as wrapRuns does).
          textOffsetPx: fragment.start === 0 ? Math.floor((run.padStart ?? 0) * 64 + 1e-6) / 64 : 0,
          fontSizePx: run.font.size,
          fontWeight: run.font.weight ?? BODY_FONT_WEIGHT,
        };
        // Adjacent runs in one font are one shaped run in the browser (a bold
        // ">" after a heading's "=" still forms Inter's arrow): paint them as
        // one segment so the SVG shapes them together too.
        const last = segments[segments.length - 1];
        if (last && sameFace(last, segment)) {
          last.text += segment.text;
          last.widthPx = segment.xPx + segment.widthPx - last.xPx;
        } else {
          segments.push(segment);
        }
      }
      rows.push({
        fontSizePx,
        fontWeight,
        indentPx,
        ...(index === 0 && bullet ? { bullet } : null),
        // A segment of only preserved spaces paints nothing.
        segments: segments.filter((segment) => segment.text.trim() !== ""),
      });
    });
  }

  return rows;
}

/** Two text (not code) segments painted in one face, the second right after the first. */
function sameFace(a: StickyTextSegment, b: StickyTextSegment): boolean {
  return (
    a.style !== "code" &&
    b.style !== "code" &&
    a.fontSizePx === b.fontSizePx &&
    a.fontWeight === b.fontWeight &&
    Math.abs(a.xPx + a.widthPx - b.xPx) < 1e-6
  );
}

/**
 * Cuts a clamped row the way -webkit-line-clamp cuts its last visible line:
 * graphemes drop from the end until the row plus an ellipsis — painted in
 * the line's own font, as CSS paints it — fits the slot width, then the
 * ellipsis follows as its own plain segment. Mutates `row`.
 */
export function ellipsizeStickyRow(row: StickyTextRow, slotWidthPx: number): void {
  const ellipsisFont = stickySegmentFont("plain", row.fontSizePx, row.fontWeight);
  const ellipsisWidth = measureWidth("…", ellipsisFont);
  const rowEnd = () => {
    const last = row.segments[row.segments.length - 1];
    return last ? last.xPx + last.widthPx : row.indentPx;
  };
  while (row.segments.length > 0 && rowEnd() + ellipsisWidth > slotWidthPx) {
    const last = row.segments[row.segments.length - 1]!;
    const parts = graphemeClusters(last.text);
    parts.pop();
    // Only collapsible spaces go; a no-break space is text.
    const text = parts.join("").replace(/[ \t\n\r\f]+$/, "");
    if (text === "") {
      row.segments.pop();
      continue;
    }
    // The cut box keeps its leading padding (a code chip) and loses its end;
    // its text keeps the line's preserved spaces (pre-wrap).
    last.text = text;
    last.widthPx =
      last.textOffsetPx +
      measureLineWidth(text, stickySegmentFont(last.style, last.fontSizePx, last.fontWeight), "pre-wrap");
  }
  row.segments.push({
    text: "…",
    style: "plain",
    xPx: rowEnd(),
    widthPx: ellipsisWidth,
    textOffsetPx: 0,
    fontSizePx: row.fontSizePx,
    fontWeight: row.fontWeight,
  });
}

/**
 * Characters (grapheme clusters) of a sticky's markdown the bundled faces
 * cannot paint — body and bold runs in Inter, inline code in IBM Plex Mono —
 * in first-seen order. Their widths are estimates, so a fit over them is too.
 */
export function stickyTextUncovered(source: string): string[] {
  const seen = new Set<string>();
  for (const line of parseStickyMarkdown(source).lines) {
    for (const token of line.inline) {
      const [text, family] =
        token.kind === "text"
          ? [token.leaf.text, CANVAS_SANS_FONT_STACK]
          : [token.content.text, token.kind === "code" ? CANVAS_MONO_FONT_STACK : CANVAS_SANS_FONT_STACK];
      for (const grapheme of uncoveredChars(text, family)) seen.add(grapheme);
    }
  }
  return [...seen];
}
