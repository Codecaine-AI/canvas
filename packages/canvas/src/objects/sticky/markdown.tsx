"use client";

import type { ReactNode } from "react";
import {
  parseStickyMarkdown,
  STICKY_MARKDOWN_MONO_FONT,
  type StickyMarkdownInlineToken,
  type StickyMarkdownLine,
} from "./markdown-editing";

/**
 * Minimal sticky markdown (D18) — just enough to style sticky text without a
 * style bar, shared by the at-rest renderer (sticky def) and the in-place
 * live preview editor. The draft string remains raw markdown while editing;
 * only this closed token model decides how that source is visually decorated.
 *
 * Scope, deliberately closed: H1–H3 (`#`/`##`/`###` line prefixes),
 * structural two-space indentation, `- ` bullets, `**bold**`, and inline
 * `` `code` ``. Nothing else — no links, no images, no tables (a heading line
 * is a heading, a bullet line is a bullet; inline marks apply within either).
 */

export const STICKY_MARKDOWN_LINE_HEIGHT_PX = 36;

/**
 * Headings keep their em-relative font-size hierarchy, but every markdown row
 * uses the sticky body's 36px line pitch so raw-source editing and at-rest
 * markdown share the same deterministic vertical budget.
 */
export const STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX: Record<1 | 2 | 3, number> = {
  1: STICKY_MARKDOWN_LINE_HEIGHT_PX,
  2: STICKY_MARKDOWN_LINE_HEIGHT_PX,
  3: STICKY_MARKDOWN_LINE_HEIGHT_PX,
};

/** em-relative heading sizes so headings scale with the slot's body typography. */
const HEADING_STYLE: Record<1 | 2 | 3, { fontSize: string; lineHeight: string }> = {
  1: { fontSize: "1.5em", lineHeight: `${STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX[1]}px` },
  2: { fontSize: "1.25em", lineHeight: `${STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX[2]}px` },
  3: { fontSize: "1.1em", lineHeight: `${STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX[3]}px` },
};

type StickyMarkdownLineAttrs = {
  "data-line-depth": string;
  "data-bullet"?: "true";
  "data-bullet-glyph"?: "1" | "2" | "3";
};

/**
 * Shared D14 line attributes for at-rest and live-editor line rendering.
 * Visual indentation clamps at depth 5, while bullet glyph buckets keep depth
 * 2+ visually stable.
 */
export function stickyMarkdownLineAttrs(line: StickyMarkdownLine): StickyMarkdownLineAttrs {
  const depth = line.depth;
  const attrs: StickyMarkdownLineAttrs = {
    "data-line-depth": String(Math.min(depth, 5)),
  };
  if (line.kind === "bullet") {
    attrs["data-bullet"] = "true";
    attrs["data-bullet-glyph"] = depth === 0 ? "1" : depth === 1 ? "2" : "3";
  }
  return attrs;
}

/** Inline pass: `**bold**` and `` `code` `` (no nesting), from the shared D18 tokens. */
function renderInline(tokens: readonly StickyMarkdownInlineToken[]): ReactNode[] {
  return tokens.map((token) => {
    if (token.kind === "text") return token.leaf.text;
    if (token.kind === "strong") {
      return <strong key={token.content.key}>{token.content.text}</strong>;
    }
    return (
      <code
        key={token.content.key}
        style={{
          fontFamily: STICKY_MARKDOWN_MONO_FONT,
          fontSize: "0.85em",
          background: "rgba(0, 0, 0, 0.08)",
          borderRadius: "3px",
          padding: "0 0.15em",
        }}
      >
        {token.content.text}
      </code>
    );
  });
}

function renderLine(line: StickyMarkdownLine): ReactNode {
  if (line.kind === "heading") {
    const level = line.headingLevel!;
    return (
      <span
        // eslint-disable-next-line react/no-array-index-key -- lines are position-stable within a single render
        key={line.index}
        className="interactive-canvas-sticky-line"
        data-heading={level}
        {...stickyMarkdownLineAttrs(line)}
        style={{ ...HEADING_STYLE[level], fontWeight: 700 }}
      >
        {renderInline(line.inline)}
      </span>
    );
  }
  return (
    <span
      // eslint-disable-next-line react/no-array-index-key -- lines are position-stable within a single render
      key={line.index}
      className="interactive-canvas-sticky-line"
      {...stickyMarkdownLineAttrs(line)}
    >
      {/* A blank line keeps its line box (nbsp) so at-rest paragraph spacing
          matches the raw-source line count the editor shows (D14). */}
      {line.placeholder ? line.placeholder.text : renderInline(line.inline)}
    </span>
  );
}

/** Renders sticky `text` as the D18 markdown line stack. */
export function StickyMarkdown({ text }: { text: string }) {
  return <>{parseStickyMarkdown(text).lines.map((line) => renderLine(line))}</>;
}
