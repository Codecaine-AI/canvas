/**
 * Sticky markdown line-box layout for the static renderer.
 *
 * The live sticky renders its text through StickyMarkdown
 * (objects/sticky/markdown.tsx over the pure D18 grammar in
 * objects/sticky/markdown-editing.ts): headings, bullets with depth
 * indentation, bold and inline code, one 36px-pitch line box per source line,
 * wrapped by the browser inside the inset-body slot. This module reproduces
 * those LINE BOXES — per-line font size/weight, indentation, bullet glyph
 * column and real-Inter-metrics word wrapping — so the static render's line
 * count and vertical fit match the live layout. The grammar itself is not
 * re-parsed here: lines come from the same parseStickyMarkdown the live
 * renderer consumes.
 *
 * Visual constants are mirrored from the live implementation (markdown.tsx
 * HEADING_STYLE, the sticky def's line CSS in objects/sticky/def.tsx — those
 * modules are .tsx/React and cannot be imported here); each carries a pointer
 * to its source of truth.
 *
 * Documented approximations:
 * - Inline-code text measures with a flat monospace advance
 *   (STICKY_CODE_MONO_ADVANCE_EM per char at the 0.85em code size) — the
 *   mono stack (ui-monospace/SF Mono/Menlo) is not in the generated Inter
 *   table. Real SF Mono/Menlo advances are ≈0.60–0.62em.
 * - Bold text measures with the font's true wght-700 instance advances (see
 *   text-metrics.ts) — not an approximation, noted for completeness.
 */

import { parseStickyMarkdown } from "../objects/sticky/markdown-editing";
import { interCharWidthPx } from "./text-metrics";

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
const STRONG_FONT_WEIGHT = 700;

/** Inline-code sizing (markdown.tsx renderInline `<code>` style). */
export const STICKY_CODE_FONT_EM = 0.85;
const STICKY_CODE_PADDING_X_EM = 0.15;
/** Flat monospace advance per code character, in em of the code font size. */
export const STICKY_CODE_MONO_ADVANCE_EM = 0.6;

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
  text: string;
  style: StickySegmentStyle;
  /** Offset from the slot rect's left edge (line indent included), px. */
  xPx: number;
  widthPx: number;
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

/** One measured character during wrapping. */
interface MeasuredChar {
  char: string;
  widthPx: number;
  style: StickySegmentStyle;
  fontSizePx: number;
  fontWeight: number;
  isSpace: boolean;
}

function bulletGlyphForDepth(depth: number): string {
  return BULLET_GLYPHS[Math.min(depth, 2)]!;
}

/** Splits a measured char run into maximal same-style word/space groups. */
function charGroups(chars: readonly MeasuredChar[]): MeasuredChar[][] {
  const groups: MeasuredChar[][] = [];
  let current: MeasuredChar[] = [];
  for (const item of chars) {
    if (current.length > 0 && current[0]!.isSpace !== item.isSpace) {
      groups.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function groupWidth(group: readonly MeasuredChar[]): number {
  let total = 0;
  for (const item of group) total += item.widthPx;
  return total;
}

/**
 * Greedy word wrap over measured characters, mirroring the browser's
 * pre-wrap + overflow-wrap: break-word behavior: lines break at spaces
 * (trailing spaces stay — hang — on the broken line), and a single word
 * wider than the available width breaks intra-word at the overflow point.
 * Always returns at least one (possibly empty) visual row.
 */
function wrapMeasuredChars(
  chars: readonly MeasuredChar[],
  availableWidthPx: number,
): MeasuredChar[][] {
  const available = Math.max(1, availableWidthPx);
  const rows: MeasuredChar[][] = [];
  let current: MeasuredChar[] = [];
  let currentWidth = 0;

  const flush = () => {
    rows.push(current);
    current = [];
    currentWidth = 0;
  };

  for (const group of charGroups(chars)) {
    if (group[0]!.isSpace) {
      // Preserved spaces never force a break themselves (they hang).
      current.push(...group);
      currentWidth += groupWidth(group);
      continue;
    }
    const width = groupWidth(group);
    if (current.length > 0 && currentWidth + width > available) flush();
    if (width > available) {
      // Word wider than the box: break at the overflow point, min 1 char/row.
      for (const item of group) {
        if (current.length > 0 && currentWidth + item.widthPx > available) flush();
        current.push(item);
        currentWidth += item.widthPx;
      }
      continue;
    }
    current.push(...group);
    currentWidth += width;
  }

  if (current.length > 0 || rows.length === 0) rows.push(current);
  return rows;
}

/** Groups a wrapped row's chars into contiguous same-style segments with x offsets. */
function rowSegments(
  chars: readonly MeasuredChar[],
  indentPx: number,
): StickyTextSegment[] {
  const segments: StickyTextSegment[] = [];
  let cursor = indentPx;
  for (const item of chars) {
    const last = segments[segments.length - 1];
    if (
      last &&
      last.style === item.style &&
      last.fontSizePx === item.fontSizePx &&
      last.fontWeight === item.fontWeight
    ) {
      last.text += item.char;
      last.widthPx += item.widthPx;
    } else {
      segments.push({
        text: item.char,
        style: item.style,
        xPx: cursor,
        widthPx: item.widthPx,
        fontSizePx: item.fontSizePx,
        fontWeight: item.fontWeight,
      });
    }
    cursor += item.widthPx;
  }
  // A row of only preserved spaces paints nothing.
  return segments.filter((segment) => segment.text.trim() !== "");
}

function measureRun(
  text: string,
  style: StickySegmentStyle,
  rowFontSizePx: number,
  rowFontWeight: number,
): MeasuredChar[] {
  const chars: MeasuredChar[] = [];
  if (style === "code") {
    const codeFontSize = rowFontSizePx * STICKY_CODE_FONT_EM;
    const advance = codeFontSize * STICKY_CODE_MONO_ADVANCE_EM;
    const padding = codeFontSize * STICKY_CODE_PADDING_X_EM;
    const codePoints = [...text];
    for (let index = 0; index < codePoints.length; index += 1) {
      // The code chip's horizontal padding rides on the run's end characters.
      const edgePadding =
        (index === 0 ? padding : 0) + (index === codePoints.length - 1 ? padding : 0);
      chars.push({
        char: codePoints[index]!,
        widthPx: advance + edgePadding,
        style,
        fontSizePx: codeFontSize,
        fontWeight: rowFontWeight,
        isSpace: false, // code chips wrap intra-chip only at overflow
      });
    }
    return chars;
  }

  const fontWeight = style === "strong" ? STRONG_FONT_WEIGHT : rowFontWeight;
  for (const char of text) {
    chars.push({
      char,
      widthPx: interCharWidthPx(char.codePointAt(0)!, rowFontSizePx, fontWeight),
      style,
      fontSizePx: rowFontSizePx,
      fontWeight,
      isSpace: char === " " || char === "\t",
    });
  }
  return chars;
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

    // Blank line: the placeholder keeps its line box but paints nothing.
    if (line.placeholder) {
      rows.push({ fontSizePx, fontWeight, indentPx, ...(bullet ? { bullet } : null), segments: [] });
      continue;
    }

    const chars: MeasuredChar[] = [];
    for (const token of line.inline) {
      if (token.kind === "text") {
        chars.push(...measureRun(token.leaf.text, "plain", fontSizePx, fontWeight));
      } else if (token.kind === "strong") {
        chars.push(...measureRun(token.content.text, "strong", fontSizePx, fontWeight));
      } else {
        chars.push(...measureRun(token.content.text, "code", fontSizePx, fontWeight));
      }
    }

    const wrapped = wrapMeasuredChars(chars, slotWidthPx - indentPx);
    wrapped.forEach((rowChars, index) => {
      rows.push({
        fontSizePx,
        fontWeight,
        indentPx,
        ...(index === 0 && bullet ? { bullet } : null),
        segments: rowSegments(rowChars, indentPx),
      });
    });
  }

  return rows;
}
