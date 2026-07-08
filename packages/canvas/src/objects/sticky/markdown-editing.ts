/**
 * Sticky markdown's closed D18 grammar, expressed as a pure source model.
 *
 * This file deliberately knows nothing about React or the DOM. The at-rest
 * renderer and the in-place live editor both consume this model so the grammar
 * cannot fork: headings are only `# `/`## `/`### ` line prefixes, bullets are
 * only `- ` line prefixes, and inline marks are only complete `**bold**` or
 * `` `code` `` pairs. Incomplete markers remain ordinary text, matching the
 * original StickyMarkdown split pass.
 *
 * The editor uses the leaf offsets as its D14 bridge. The rendered DOM may
 * hide marker glyphs on non-active lines, but every marker still has a leaf
 * with source offsets. Selection restore can therefore happen in SOURCE
 * coordinates, independent of whether the corresponding glyph currently
 * occupies pixels.
 */

export type StickyMarkdownLineKind = "text" | "heading" | "bullet";
export type StickyMarkdownInlineKind = "text" | "strong" | "code";
export type StickyMarkdownLeafRole = "text" | "marker" | "placeholder";
export type StickyMarkdownLeafStyle = "plain" | "strong" | "code";
export type StickyMarkdownMarkerKind =
  | "heading-prefix"
  | "bullet-prefix"
  | "bold-marker"
  | "code-marker";

export interface StickyMarkdownLeaf {
  key: string;
  lineIndex: number;
  role: StickyMarkdownLeafRole;
  style: StickyMarkdownLeafStyle;
  text: string;
  sourceStart: number;
  sourceEnd: number;
  markerKind?: StickyMarkdownMarkerKind;
}

export interface StickyMarkdownTextToken {
  kind: "text";
  leaf: StickyMarkdownLeaf;
}

export interface StickyMarkdownMarkedToken {
  kind: "strong" | "code";
  sourceStart: number;
  sourceEnd: number;
  openMarker: StickyMarkdownLeaf;
  content: StickyMarkdownLeaf;
  closeMarker: StickyMarkdownLeaf;
}

export type StickyMarkdownInlineToken =
  | StickyMarkdownTextToken
  | StickyMarkdownMarkedToken;

export interface StickyMarkdownLine {
  index: number;
  kind: StickyMarkdownLineKind;
  headingLevel?: 1 | 2 | 3;
  raw: string;
  sourceStart: number;
  sourceEnd: number;
  contentStart: number;
  prefix?: StickyMarkdownLeaf;
  inline: StickyMarkdownInlineToken[];
  placeholder?: StickyMarkdownLeaf;
  leaves: StickyMarkdownLeaf[];
}

export interface StickyMarkdownDocument {
  source: string;
  lines: StickyMarkdownLine[];
  leaves: StickyMarkdownLeaf[];
}

export interface StickyMarkdownDomPosition {
  /**
   * Stable key for the source leaf a rendered DOM text node represents. The
   * browser adapter stores this key on `data-sticky-markdown-leaf-key`.
   */
  leafKey: string;
  /** UTF-16 offset inside the leaf text. This mirrors textarea/source offsets. */
  offset: number;
}

export interface StickyMarkdownSelection {
  start: number;
  end: number;
}

export type StickyMarkdownEdit =
  | { type: "insertText"; text: string }
  | { type: "insertLineBreak" }
  | { type: "deleteContentBackward" }
  | { type: "deleteContentForward" };

export interface StickyMarkdownEditResult {
  source: string;
  selection: StickyMarkdownSelection;
}

const INLINE_MARK_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`)/g;
const HEADING_PATTERN = /^(#{1,3}) (.*)$/;
const NBSP = "\u00A0";

export const STICKY_MARKDOWN_MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeSelection(
  source: string,
  selection: StickyMarkdownSelection,
): StickyMarkdownSelection {
  const start = clamp(Math.min(selection.start, selection.end), 0, source.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, source.length);
  return { start, end };
}

function normalizeInsertedText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function leaf(
  lineIndex: number,
  keyPart: string,
  options: Omit<StickyMarkdownLeaf, "key" | "lineIndex">,
): StickyMarkdownLeaf {
  return {
    key: `${lineIndex}:${keyPart}`,
    lineIndex,
    ...options,
  };
}

function tokenizeInline(
  text: string,
  sourceStart: number,
  lineIndex: number,
): StickyMarkdownInlineToken[] {
  const tokens: StickyMarkdownInlineToken[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(INLINE_MARK_PATTERN)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > cursor) {
      const literal = text.slice(cursor, matchIndex);
      tokens.push({
        kind: "text",
        leaf: leaf(lineIndex, `t${tokenIndex}`, {
          role: "text",
          style: "plain",
          text: literal,
          sourceStart: sourceStart + cursor,
          sourceEnd: sourceStart + matchIndex,
        }),
      });
      tokenIndex += 1;
    }

    const marked = match[0];
    const tokenStart = sourceStart + matchIndex;
    const tokenEnd = tokenStart + marked.length;
    if (marked.startsWith("**") && marked.endsWith("**")) {
      tokens.push({
        kind: "strong",
        sourceStart: tokenStart,
        sourceEnd: tokenEnd,
        openMarker: leaf(lineIndex, `s${tokenIndex}-open`, {
          role: "marker",
          style: "strong",
          markerKind: "bold-marker",
          text: "**",
          sourceStart: tokenStart,
          sourceEnd: tokenStart + 2,
        }),
        content: leaf(lineIndex, `s${tokenIndex}-content`, {
          role: "text",
          style: "strong",
          text: marked.slice(2, -2),
          sourceStart: tokenStart + 2,
          sourceEnd: tokenEnd - 2,
        }),
        closeMarker: leaf(lineIndex, `s${tokenIndex}-close`, {
          role: "marker",
          style: "strong",
          markerKind: "bold-marker",
          text: "**",
          sourceStart: tokenEnd - 2,
          sourceEnd: tokenEnd,
        }),
      });
    } else {
      tokens.push({
        kind: "code",
        sourceStart: tokenStart,
        sourceEnd: tokenEnd,
        openMarker: leaf(lineIndex, `c${tokenIndex}-open`, {
          role: "marker",
          style: "code",
          markerKind: "code-marker",
          text: "`",
          sourceStart: tokenStart,
          sourceEnd: tokenStart + 1,
        }),
        content: leaf(lineIndex, `c${tokenIndex}-content`, {
          role: "text",
          style: "code",
          text: marked.slice(1, -1),
          sourceStart: tokenStart + 1,
          sourceEnd: tokenEnd - 1,
        }),
        closeMarker: leaf(lineIndex, `c${tokenIndex}-close`, {
          role: "marker",
          style: "code",
          markerKind: "code-marker",
          text: "`",
          sourceStart: tokenEnd - 1,
          sourceEnd: tokenEnd,
        }),
      });
    }

    cursor = matchIndex + marked.length;
    tokenIndex += 1;
  }

  if (cursor < text.length) {
    tokens.push({
      kind: "text",
      leaf: leaf(lineIndex, `t${tokenIndex}`, {
        role: "text",
        style: "plain",
        text: text.slice(cursor),
        sourceStart: sourceStart + cursor,
        sourceEnd: sourceStart + text.length,
      }),
    });
  }

  return tokens;
}

function inlineLeaves(tokens: readonly StickyMarkdownInlineToken[]): StickyMarkdownLeaf[] {
  const leaves: StickyMarkdownLeaf[] = [];
  for (const token of tokens) {
    if (token.kind === "text") {
      leaves.push(token.leaf);
    } else {
      leaves.push(token.openMarker, token.content, token.closeMarker);
    }
  }
  return leaves;
}

function parseLine(raw: string, index: number, sourceStart: number): StickyMarkdownLine {
  const sourceEnd = sourceStart + raw.length;
  let kind: StickyMarkdownLineKind = "text";
  let headingLevel: 1 | 2 | 3 | undefined;
  let prefix: StickyMarkdownLeaf | undefined;
  let contentStart = sourceStart;
  let content = raw;

  const heading = HEADING_PATTERN.exec(raw);
  if (heading) {
    kind = "heading";
    headingLevel = heading[1].length as 1 | 2 | 3;
    const prefixText = `${heading[1]} `;
    prefix = leaf(index, "block", {
      role: "marker",
      style: "plain",
      markerKind: "heading-prefix",
      text: prefixText,
      sourceStart,
      sourceEnd: sourceStart + prefixText.length,
    });
    contentStart = prefix.sourceEnd;
    content = heading[2];
  } else if (raw.startsWith("- ")) {
    kind = "bullet";
    prefix = leaf(index, "block", {
      role: "marker",
      style: "plain",
      markerKind: "bullet-prefix",
      text: "- ",
      sourceStart,
      sourceEnd: sourceStart + 2,
    });
    contentStart = prefix.sourceEnd;
    content = raw.slice(2);
  }

  const inline = tokenizeInline(content, contentStart, index);
  const leaves = [...(prefix ? [prefix] : []), ...inlineLeaves(inline)];
  const placeholder =
    content === "" && kind !== "heading"
      ? leaf(index, "placeholder", {
          role: "placeholder",
          style: "plain",
          text: NBSP,
          sourceStart: contentStart,
          sourceEnd: contentStart,
        })
      : undefined;
  if (placeholder) leaves.push(placeholder);

  return {
    index,
    kind,
    headingLevel,
    raw,
    sourceStart,
    sourceEnd,
    contentStart,
    prefix,
    inline,
    placeholder,
    leaves,
  };
}

/** Tokenizes a sticky markdown source string into D18 line and inline leaves. */
export function parseStickyMarkdown(source: string): StickyMarkdownDocument {
  const lines: StickyMarkdownLine[] = [];
  let lineStart = 0;
  let lineIndex = 0;

  while (lineStart <= source.length) {
    const newlineIndex = source.indexOf("\n", lineStart);
    if (newlineIndex === -1) {
      lines.push(parseLine(source.slice(lineStart), lineIndex, lineStart));
      break;
    }

    lines.push(parseLine(source.slice(lineStart, newlineIndex), lineIndex, lineStart));
    lineStart = newlineIndex + 1;
    lineIndex += 1;
  }

  const leaves = lines.flatMap((line) => line.leaves);
  return { source, lines, leaves };
}

function sourceLength(leafItem: StickyMarkdownLeaf): number {
  return leafItem.sourceEnd - leafItem.sourceStart;
}

/**
 * Maps a raw source offset to the rendered leaf/offset that should receive the
 * caret. Boundaries prefer the leaf that starts at that source offset, which
 * puts a caret at `**|bold**` before "bold" rather than at the end of the
 * opening marker. That is the editable position users expect when markers
 * are visible on the active line.
 */
export function sourceOffsetToStickyMarkdownDomPosition(
  document: StickyMarkdownDocument,
  sourceOffset: number,
): StickyMarkdownDomPosition {
  const offset = clamp(sourceOffset, 0, document.source.length);
  const realLeaves = document.leaves.filter((item) => sourceLength(item) > 0);

  const containing = realLeaves.find(
    (item) => item.sourceStart <= offset && offset < item.sourceEnd,
  );
  if (containing) {
    return { leafKey: containing.key, offset: offset - containing.sourceStart };
  }

  const starting = realLeaves.find((item) => item.sourceStart === offset);
  if (starting) return { leafKey: starting.key, offset: 0 };

  const ending = [...realLeaves]
    .reverse()
    .find((item) => item.sourceEnd === offset);
  if (ending) return { leafKey: ending.key, offset: sourceLength(ending) };

  const placeholder = document.leaves.find(
    (item) => item.sourceStart === offset && item.sourceEnd === offset,
  );
  if (placeholder) return { leafKey: placeholder.key, offset: 0 };

  const previous = [...realLeaves]
    .reverse()
    .find((item) => item.sourceEnd < offset);
  if (previous) return { leafKey: previous.key, offset: sourceLength(previous) };

  const next = realLeaves.find((item) => item.sourceStart > offset);
  if (next) return { leafKey: next.key, offset: 0 };

  const fallback = document.leaves[0];
  return fallback ? { leafKey: fallback.key, offset: 0 } : { leafKey: "0:placeholder", offset: 0 };
}

/** Inverse of sourceOffsetToStickyMarkdownDomPosition for leaf-based DOM tests/adapters. */
export function stickyMarkdownDomPositionToSourceOffset(
  document: StickyMarkdownDocument,
  position: StickyMarkdownDomPosition,
): number {
  const leafItem = document.leaves.find((item) => item.key === position.leafKey);
  if (!leafItem) return clamp(position.offset, 0, document.source.length);
  if (sourceLength(leafItem) === 0) return leafItem.sourceStart;
  return leafItem.sourceStart + clamp(position.offset, 0, sourceLength(leafItem));
}

/** Returns the source line that owns a textarea-style offset. */
export function stickyMarkdownLineIndexAtOffset(
  document: StickyMarkdownDocument,
  sourceOffset: number,
): number {
  const offset = clamp(sourceOffset, 0, document.source.length);
  for (const line of document.lines) {
    if (offset >= line.sourceStart && offset <= line.sourceEnd) return line.index;
  }
  return document.lines.at(-1)?.index ?? 0;
}

/**
 * Marker visibility is line-scoped. A collapsed caret activates one line; a
 * non-collapsed selection activates every source line with selected text.
 */
export function activeStickyMarkdownLineIndexes(
  document: StickyMarkdownDocument,
  selection: StickyMarkdownSelection,
): Set<number> {
  const normalized = normalizeSelection(document.source, selection);
  const startLine = stickyMarkdownLineIndexAtOffset(document, normalized.start);
  const selectionEnd =
    normalized.end > normalized.start ? normalized.end - 1 : normalized.end;
  const endLine = stickyMarkdownLineIndexAtOffset(document, selectionEnd);
  const active = new Set<number>();
  for (let index = Math.min(startLine, endLine); index <= Math.max(startLine, endLine); index += 1) {
    active.add(index);
  }
  return active;
}

function replaceRange(
  source: string,
  selection: StickyMarkdownSelection,
  text: string,
): StickyMarkdownEditResult {
  const normalized = normalizeSelection(source, selection);
  const inserted = normalizeInsertedText(text);
  const nextSource =
    source.slice(0, normalized.start) + inserted + source.slice(normalized.end);
  const nextOffset = normalized.start + inserted.length;
  return { source: nextSource, selection: { start: nextOffset, end: nextOffset } };
}

function lineBoundsAtSourceOffset(source: string, sourceOffset: number): {
  start: number;
  end: number;
  text: string;
} {
  const offset = clamp(sourceOffset, 0, source.length);
  const start = source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const newline = source.indexOf("\n", offset);
  const end = newline === -1 ? source.length : newline;
  return { start, end, text: source.slice(start, end) };
}

function insertLineBreak(
  source: string,
  selection: StickyMarkdownSelection,
): StickyMarkdownEditResult {
  const normalized = normalizeSelection(source, selection);
  const base = source.slice(0, normalized.start) + source.slice(normalized.end);
  const caret = normalized.start;
  const line = lineBoundsAtSourceOffset(base, caret);

  if (line.text === "- ") {
    const nextSource = base.slice(0, line.start) + base.slice(line.end);
    return { source: nextSource, selection: { start: line.start, end: line.start } };
  }

  return replaceRange(base, { start: caret, end: caret }, line.text.startsWith("- ") ? "\n- " : "\n");
}

/**
 * Applies the same edit the live contentEditable intercepted, but against the
 * raw markdown source. The returned selection is also in source coordinates,
 * which is the only stable coordinate space while React replaces the decorated
 * DOM after every keystroke.
 */
export function applyStickyMarkdownEdit(
  source: string,
  selection: StickyMarkdownSelection,
  edit: StickyMarkdownEdit,
): StickyMarkdownEditResult {
  const normalized = normalizeSelection(source, selection);

  if (edit.type === "insertText") {
    return replaceRange(source, normalized, edit.text);
  }
  if (edit.type === "insertLineBreak") {
    return insertLineBreak(source, normalized);
  }
  if (edit.type === "deleteContentBackward") {
    if (normalized.start !== normalized.end) return replaceRange(source, normalized, "");
    if (normalized.start === 0) return { source, selection: normalized };
    return replaceRange(source, { start: normalized.start - 1, end: normalized.start }, "");
  }

  if (normalized.start !== normalized.end) return replaceRange(source, normalized, "");
  if (normalized.start === source.length) return { source, selection: normalized };
  return replaceRange(source, { start: normalized.start, end: normalized.start + 1 }, "");
}
