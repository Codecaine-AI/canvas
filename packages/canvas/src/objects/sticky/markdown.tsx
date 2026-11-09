"use client";

import type { CSSProperties, ReactNode } from "react";
import { FIGJAM_CANVAS_STYLE } from "../../theme/canvas-style";
import { withAlpha } from "../../theme/color-math";
import {
  parseStickyMarkdown,
  STICKY_MARKDOWN_MONO_FONT,
  STICKY_MARKDOWN_MONO_FONT_WEIGHT,
  stickyHeadingEm,
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

/**
 * A heading row's style: its em size under the style's `stickyHeadingScale`
 * (markdown-editing.ts stickyHeadingEm), bold. No line height of its own:
 * every row inherits the slot's px line box (CanvasStyle.stickyLineHeightPx),
 * so raw-source editing and at-rest markdown share one vertical budget.
 * Shared by the at-rest renderer and the live editor.
 */
export function stickyHeadingStyle(level: 1 | 2 | 3, headingScale: number): CSSProperties {
  return { fontSize: `${stickyHeadingEm(level, headingScale)}em`, fontWeight: 700 };
}

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

/**
 * Bold runs keep the sticky's own family: a host stylesheet (the docs
 * reader's `.docs-markdown strong` rule) must not repaint them in another
 * font than the one they were measured in.
 */
export const STICKY_STRONG_STYLE = { fontFamily: "inherit" } as const;

/**
 * Inline `code` chip tint: the sticky's text color at this alpha. Card
 * stickies tint with their own text color (def.tsx CARD_STICKY_GEOMETRY.
 * codeChipAlpha reads it here: def.tsx imports this module, not the reverse).
 */
export const STICKY_CODE_CHIP_ALPHA = 0.08;

/** Inline `code` chip tint on a paper sticky: the figjam text color at STICKY_CODE_CHIP_ALPHA (`rgba(0, 0, 0, 0.08)`). */
export const STICKY_CODE_CHIP_BACKGROUND = withAlpha(FIGJAM_CANVAS_STYLE.textColor, STICKY_CODE_CHIP_ALPHA);

/**
 * Inline `code` chip corner radius: FigJam board art, shared by the at-rest
 * chip here and the live editor's chip (MarkdownSlotTextEditor) so both
 * draw the same box.
 */
export const STICKY_CODE_CHIP_RADIUS = "3px";

/** Inline pass: `**bold**` and `` `code` `` (no nesting), from the shared D18 tokens. */
function renderInline(
  tokens: readonly StickyMarkdownInlineToken[],
  codeBackground: string,
): ReactNode[] {
  return tokens.map((token) => {
    if (token.kind === "text") return token.leaf.text;
    if (token.kind === "strong") {
      return (
        <strong key={token.content.key} style={STICKY_STRONG_STYLE}>
          {token.content.text}
        </strong>
      );
    }
    return (
      <code
        key={token.content.key}
        style={{
          fontFamily: STICKY_MARKDOWN_MONO_FONT,
          fontWeight: STICKY_MARKDOWN_MONO_FONT_WEIGHT,
          fontSize: "0.85em",
          background: codeBackground,
          borderRadius: STICKY_CODE_CHIP_RADIUS,
          padding: "0 0.15em",
        }}
      >
        {token.content.text}
      </code>
    );
  });
}

function renderLine(line: StickyMarkdownLine, codeBackground: string, headingScale: number): ReactNode {
  if (line.kind === "heading") {
    const level = line.headingLevel!;
    return (
      <span
        // eslint-disable-next-line react/no-array-index-key -- lines are position-stable within a single render
        key={line.index}
        className="interactive-canvas-sticky-line"
        data-heading={level}
        {...stickyMarkdownLineAttrs(line)}
        style={stickyHeadingStyle(level, headingScale)}
      >
        {renderInline(line.inline, codeBackground)}
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
      {line.placeholder ? line.placeholder.text : renderInline(line.inline, codeBackground)}
    </span>
  );
}

/**
 * Renders sticky `text` as the D18 markdown line stack. `codeBackground`
 * tints inline `code` chips (a card sticky passes its text color at low
 * alpha so chips read on a dark card too).
 */
export function StickyMarkdown({
  text,
  codeBackground = STICKY_CODE_CHIP_BACKGROUND,
  headingScale = 1,
}: {
  text: string;
  codeBackground?: string;
  /** CanvasStyle.stickyHeadingScale (1 = the full heading scale). */
  headingScale?: number;
}) {
  return <>{parseStickyMarkdown(text).lines.map((line) => renderLine(line, codeBackground, headingScale))}</>;
}
