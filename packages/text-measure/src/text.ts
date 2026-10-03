/** Unicode helpers shared by the backends, coverage and the layout API. */

let segmenter: Intl.Segmenter | null = null;

/** Grapheme clusters (user-perceived characters) of `text`, in order. */
export function graphemes(text: string): string[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const out: string[] = [];
  for (const { segment } of segmenter.segment(text)) out.push(segment);
  return out;
}

/** C0/C1 control characters (tab, newline, ...): never painted as glyphs. */
export function isControl(cp: number): boolean {
  return cp < 0x20 || (cp >= 0x7f && cp < 0xa0);
}

/**
 * Default_Ignorable_Code_Point (DerivedCoreProperties): format characters
 * rendered invisibly with zero advance (ZWSP, ZWJ, soft hyphen, variation
 * selectors, bidi controls, tags...). Fonts may omit them without the browser
 * falling back to another font.
 */
export function isDefaultIgnorable(cp: number): boolean {
  if (cp < 0x00ad) return false;
  return (
    cp === 0x00ad ||
    cp === 0x034f ||
    cp === 0x061c ||
    cp === 0x115f ||
    cp === 0x1160 ||
    cp === 0x17b4 ||
    cp === 0x17b5 ||
    (cp >= 0x180b && cp <= 0x180f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    cp === 0x3164 ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0xfeff ||
    cp === 0xffa0 ||
    (cp >= 0xfff0 && cp <= 0xfff8) ||
    (cp >= 0x1bca0 && cp <= 0x1bca3) ||
    (cp >= 0x1d173 && cp <= 0x1d17a) ||
    (cp >= 0xe0000 && cp <= 0xe0fff)
  );
}

const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u;
const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u;

/**
 * True when the browser paints the grapheme with a color emoji font: default
 * emoji presentation, an explicit VS16 (U+FE0F), a keycap (U+20E3) or a flag.
 * Browsers pick the emoji font for these even when the primary font maps the
 * base character, so they are never measurable from the bundled face.
 */
export function isEmojiGrapheme(grapheme: string): boolean {
  return (
    grapheme.includes("️") ||
    grapheme.includes("⃣") ||
    EMOJI_PRESENTATION.test(grapheme) ||
    REGIONAL_INDICATOR.test(grapheme)
  );
}

/** East Asian Wide/Fullwidth blocks (approximate, ranges of EastAsianWidth.txt W/F). */
function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** Graphemes estimated at 1em when no bundled glyph exists: CJK, Hangul, fullwidth forms, emoji. */
export function isWideGrapheme(grapheme: string): boolean {
  return isWideCodePoint(grapheme.codePointAt(0)!) || isEmojiGrapheme(grapheme);
}

/** True when every UTF-16 unit is printable ASCII (U+0020..U+007E), the common fast path. */
export function isPrintableAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

/**
 * Single-line text the way an unwrapped box (CSS white-space: nowrap) paints
 * it: runs of collapsible whitespace (space, tab, LF, CR, FF) become one
 * space and spaces at either end of the line are dropped. Other spaces
 * (no-break, thin, ...) are kept as they are.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/[ \t\n\r\f]+/g, " ").replace(/^ +| +$/g, "");
}

/**
 * The text a pre-wrap box lays out: Chromium drops carriage returns and form
 * feeds there (no glyph, no break, no line of their own), so CR LF is one
 * line break and a lone CR or FF is nothing. Pretext would turn them into
 * line breaks.
 */
export function stripPreWrapControls(text: string): string {
  return /[\r\f]/.test(text) ? text.replace(/[\r\f]/g, "") : text;
}

/**
 * Text Chromium lays out differently from the measurements here: C0/C1
 * controls other than NUL, tab and LF (Chromium paints them as fallback-font
 * glyphs, about 0.33em, and breaks around them), a form feed, a carriage
 * return in pre-wrap that does not end a CR LF pair (both are invisible
 * there but still split shaping, so "A\rV" loses its kerning), and ZWNJ
 * (U+200C), which adds break opportunities and changes kerning in Chromium.
 * A CR under white-space: normal is collapsible white space, as Pretext
 * treats it.
 */
export function hasControlCharacters(text: string, whiteSpace: "normal" | "pre-wrap"): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x200c) return true;
    if (c >= 0xa0 || (c >= 0x20 && c < 0x7f)) continue;
    if (c === 0x00 || c === 0x09 || c === 0x0a) continue;
    if (c === 0x0d && (whiteSpace === "normal" || text.charCodeAt(i + 1) === 0x0a)) continue;
    return true;
  }
  return false;
}

/** A tab in pre-wrap: tab stops (Chromium skips one closer than half a space) and tabs at a line end are approximate. */
export function hasPreservedTab(text: string, whiteSpace: "normal" | "pre-wrap"): boolean {
  return whiteSpace === "pre-wrap" && text.includes("\t");
}

/**
 * Right-to-left text or explicit bidi formatting: LRM, RLM, ALM, the
 * embedding/override/isolate controls (U+202A-202E, U+2066-2069) and the
 * right-to-left blocks (Hebrew, Arabic, Syriac, Thaana, NKo, ... and their
 * presentation forms). Line breaking here works in logical order and does
 * not reorder bidi runs the way the browser does.
 */
export function hasBidi(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x0590) continue;
    if (c <= 0x08ff) return true;
    if (c === 0x200e || c === 0x200f || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true;
    if (c >= 0xfb1d && c <= 0xfdff) return true;
    if (c >= 0xfe70 && c <= 0xfefe) return true;
    if (c >= 0xd800 && c <= 0xdbff) {
      const cp = text.codePointAt(i)!;
      if ((cp >= 0x10800 && cp <= 0x10fff) || (cp >= 0x1e800 && cp <= 0x1efff)) return true;
      i++;
    }
  }
  return false;
}

/**
 * Graphemes that receive CSS letter-spacing: every grapheme except white-space
 * controls (tab, LF, CR, FF) and invisible format characters (zero-width
 * space, soft hyphen, LRM, WJ, ZWJ, BOM, ...), as Chromium spaces them.
 * Browsers add the spacing after each one, the last included.
 */
export function countSpacingGraphemes(text: string): number {
  if (isPrintableAscii(text)) return text.length;
  let count = 0;
  for (const grapheme of graphemes(text)) {
    let visible = false;
    for (const ch of grapheme) {
      const cp = ch.codePointAt(0)!;
      // Chromium spaces controls it keeps as characters (NUL included), not invisible format characters.
      if ((!isControl(cp) || (cp !== 0x09 && cp !== 0x0a && cp !== 0x0d && cp !== 0x0c)) && !isDefaultIgnorable(cp)) {
        visible = true;
        break;
      }
    }
    if (visible) count++;
  }
  return count;
}
