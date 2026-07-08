/**
 * Sticky markdown's closed D18 grammar, expressed as a pure source model.
 *
 * This file deliberately knows nothing about React or the DOM. The at-rest
 * renderer and the in-place live editor both consume this model so the grammar
 * cannot fork: every line has optional two-space structural indentation,
 * headings are only `# `/`## `/`### ` prefixes, bullets are only `- `
 * prefixes, and inline marks are only complete `**bold**` or `` `code` ``
 * pairs. Incomplete markers remain ordinary text, matching the original
 * StickyMarkdown split pass.
 *
 * The editor uses the leaf offsets as its D14 bridge. The rendered DOM may
 * hide prefix marker glyphs at every caret position and hide inline markers
 * off the active line, but every marker still has a leaf with source offsets.
 * Selection restore can therefore happen in SOURCE coordinates, independent
 * of whether the corresponding glyph currently occupies pixels.
 */

export type StickyMarkdownLineKind = "text" | "heading" | "bullet";
export type StickyMarkdownInlineKind = "text" | "strong" | "code";
export type StickyMarkdownLeafRole = "text" | "marker" | "placeholder";
export type StickyMarkdownLeafStyle = "plain" | "strong" | "code";
export type StickyMarkdownMarkerKind =
  | "indent-prefix"
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
  depth: number;
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
const BULLET_PATTERN = /^- (.*)$/;
const INDENT_UNIT = "  ";
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
  const leadingSpaces = raw.match(/^ */)?.[0].length ?? 0;
  const indentLength = leadingSpaces - (leadingSpaces % INDENT_UNIT.length);
  const depth = indentLength / INDENT_UNIT.length;
  const indent = raw.slice(0, indentLength);
  const remainder = raw.slice(indentLength);
  let contentStart = sourceStart + indentLength;
  let content = remainder;

  const heading = HEADING_PATTERN.exec(remainder);
  if (heading) {
    kind = "heading";
    headingLevel = heading[1].length as 1 | 2 | 3;
    const prefixText = `${indent}${heading[1]} `;
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
  } else {
    const bullet = BULLET_PATTERN.exec(remainder);
    if (bullet) {
      const prefixText = `${indent}- `;
      kind = "bullet";
      prefix = leaf(index, "block", {
        role: "marker",
        style: "plain",
        markerKind: "bullet-prefix",
        text: prefixText,
        sourceStart,
        sourceEnd: sourceStart + prefixText.length,
      });
      contentStart = prefix.sourceEnd;
      content = bullet[1];
    } else if (depth >= 1) {
      prefix = leaf(index, "block", {
        role: "marker",
        style: "plain",
        markerKind: "indent-prefix",
        text: indent,
        sourceStart,
        sourceEnd: sourceStart + indent.length,
      });
    }
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
    depth,
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

  const placeholder = document.leaves.find(
    (item) => item.sourceStart === offset && item.sourceEnd === offset,
  );
  if (placeholder) return { leafKey: placeholder.key, offset: 0 };

  const ending = [...realLeaves]
    .reverse()
    .find((item) => item.sourceEnd === offset);
  if (ending) return { leafKey: ending.key, offset: sourceLength(ending) };

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
 * Prefix marker leaves are zero-width in the DOM, so a collapsed caret inside
 * `[line.sourceStart, line.contentStart)` renders as a degenerate zero-height
 * caret. Normalize that impossible visual position back to a stable source
 * edge: rightward/programmatic travel lands at visible content, while leftward
 * travel lands at the previous line end (or the first line's content start).
 */
export function normalizeStickyMarkdownCaret(
  document: StickyMarkdownDocument,
  offset: number,
  direction: -1 | 0 | 1,
): number {
  const normalized = clamp(offset, 0, document.source.length);
  for (const line of document.lines) {
    if (!line.prefix) continue;
    if (normalized < line.sourceStart || normalized >= line.contentStart) continue;
    if (direction >= 0) return line.contentStart;
    return document.lines[line.index - 1]?.sourceEnd ?? line.contentStart;
  }
  return normalized;
}

/**
 * Inline marker visibility is line-scoped. A collapsed caret activates one
 * line; a non-collapsed selection activates every source line with selected
 * text. Line prefix markers stay hidden regardless of this set.
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

function sourceLineAtOffset(
  document: StickyMarkdownDocument,
  sourceOffset: number,
): StickyMarkdownLine {
  return (
    document.lines[stickyMarkdownLineIndexAtOffset(document, sourceOffset)] ?? document.lines[0]!
  );
}

function unchangedResult(
  source: string,
  selection: StickyMarkdownSelection,
): StickyMarkdownEditResult {
  return { source, selection };
}

interface SourceChange {
  position: number;
  deleteCount: number;
  insertText: string;
  lineStart: number;
}

function applySourceChanges(source: string, changes: readonly SourceChange[]): string {
  let nextSource = source;
  for (const change of [...changes].reverse()) {
    nextSource =
      nextSource.slice(0, change.position) +
      change.insertText +
      nextSource.slice(change.position + change.deleteCount);
  }
  return nextSource;
}

function shiftEndpointForSourceChanges(
  offset: number,
  changes: readonly SourceChange[],
  nextSourceLength: number,
): number {
  let shifted = offset;
  let priorDelta = 0;
  for (const change of changes) {
    if (change.position > offset) break;

    const delta = change.insertText.length - change.deleteCount;
    const shiftedLineStart = change.lineStart + priorDelta;
    shifted += delta;
    if (delta < 0 && shifted < shiftedLineStart) shifted = shiftedLineStart;
    priorDelta += delta;
  }
  return clamp(shifted, 0, nextSourceLength);
}

function touchedLineRange(
  document: StickyMarkdownDocument,
  selection: StickyMarkdownSelection,
): { start: number; end: number } {
  const start = stickyMarkdownLineIndexAtOffset(document, selection.start);
  const selectionEnd = selection.end > selection.start ? selection.end - 1 : selection.end;
  const end = stickyMarkdownLineIndexAtOffset(document, selectionEnd);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function lineIndent(depth: number): string {
  return INDENT_UNIT.repeat(depth);
}

/**
 * Applies the sticky editor's Tab contract in source coordinates. Tab and
 * Shift+Tab structurally indent or outdent every touched line kind.
 */
export function applyStickyMarkdownIndent(
  source: string,
  selection: StickyMarkdownSelection,
  delta: 1 | -1,
): StickyMarkdownEditResult {
  const normalized = normalizeSelection(source, selection);
  const document = parseStickyMarkdown(source);

  if (normalized.start === normalized.end) {
    const line = sourceLineAtOffset(document, normalized.start);

    if (delta === 1) {
      const nextSource =
        source.slice(0, line.sourceStart) + INDENT_UNIT + source.slice(line.sourceStart);
      const caret = normalized.start + INDENT_UNIT.length;
      return { source: nextSource, selection: { start: caret, end: caret } };
    }
    if (line.depth === 0) return unchangedResult(source, normalized);
    const nextSource =
      source.slice(0, line.sourceStart) +
      source.slice(line.sourceStart + INDENT_UNIT.length);
    const caret = Math.max(line.sourceStart, normalized.start - INDENT_UNIT.length);
    return { source: nextSource, selection: { start: caret, end: caret } };
  }

  const range = touchedLineRange(document, normalized);
  const changes: SourceChange[] = [];
  for (let index = range.start; index <= range.end; index += 1) {
    const line = document.lines[index];
    if (!line) continue;
    if (delta === 1) {
      changes.push({
        position: line.sourceStart,
        deleteCount: 0,
        insertText: INDENT_UNIT,
        lineStart: line.sourceStart,
      });
    } else if (line.depth >= 1) {
      changes.push({
        position: line.sourceStart,
        deleteCount: INDENT_UNIT.length,
        insertText: "",
        lineStart: line.sourceStart,
      });
    }
  }

  if (changes.length === 0) return unchangedResult(source, normalized);

  const nextSource = applySourceChanges(source, changes);
  return {
    source: nextSource,
    selection: {
      start: shiftEndpointForSourceChanges(normalized.start, changes, nextSource.length),
      end: shiftEndpointForSourceChanges(normalized.end, changes, nextSource.length),
    },
  };
}

function insertLineBreak(
  source: string,
  selection: StickyMarkdownSelection,
): StickyMarkdownEditResult {
  const normalized = normalizeSelection(source, selection);
  const base = source.slice(0, normalized.start) + source.slice(normalized.end);
  const caret = normalized.start;
  const document = parseStickyMarkdown(base);
  const line = sourceLineAtOffset(document, caret);

  if (line.prefix && line.raw === line.prefix.text) {
    if (line.depth >= 1) {
      const nextSource =
        base.slice(0, line.sourceStart) +
        base.slice(line.sourceStart + INDENT_UNIT.length);
      const nextOffset = Math.max(line.sourceStart, caret - INDENT_UNIT.length);
      return { source: nextSource, selection: { start: nextOffset, end: nextOffset } };
    }
    if (line.kind === "bullet" || line.kind === "heading") {
      const nextSource = base.slice(0, line.sourceStart) + base.slice(line.sourceEnd);
      return { source: nextSource, selection: { start: line.sourceStart, end: line.sourceStart } };
    }
  }

  const continuationPrefix =
    line.kind === "bullet" ? `${lineIndent(line.depth)}- ` : lineIndent(line.depth);
  return replaceRange(base, { start: caret, end: caret }, `\n${continuationPrefix}`);
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

    const document = parseStickyMarkdown(source);
    const line = sourceLineAtOffset(document, normalized.start);
    if (line.prefix && normalized.start === line.contentStart) {
      if (line.depth >= 1) {
        const nextSource =
          source.slice(0, line.sourceStart) +
          source.slice(line.sourceStart + INDENT_UNIT.length);
        const caret = normalized.start - INDENT_UNIT.length;
        return { source: nextSource, selection: { start: caret, end: caret } };
      }
      const nextSource = source.slice(0, line.sourceStart) + source.slice(line.contentStart);
      return {
        source: nextSource,
        selection: { start: line.sourceStart, end: line.sourceStart },
      };
    }

    return replaceRange(source, { start: normalized.start - 1, end: normalized.start }, "");
  }

  if (normalized.start !== normalized.end) return replaceRange(source, normalized, "");
  if (normalized.start === source.length) return { source, selection: normalized };
  return replaceRange(source, { start: normalized.start, end: normalized.start + 1 }, "");
}
