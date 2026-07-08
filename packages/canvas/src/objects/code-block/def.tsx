"use client";

import { CODE_BLOCK } from "./style";
import { tokenizeCodeBlock } from "../../render/code-tokenizer";
import { BBOX_OUTLINE } from "../geometry";
import { ObjectButtonChrome } from "../object-chrome";
import type { ObjectDef, ObjectRenderProps } from "../object-def";
import { rectTextSlot, type LocalRect, type TextSlot } from "../text-slots";
import { SHAPE_TOOLBAR } from "../shapes/toolbar";
import type { InteractiveCanvasObject } from "../../state/schema";
import { objectTypeDefaults } from "../../state/schema/object-defaults";

/** Mono stack shared by the at-rest tokenized lines and the in-place editor. */
export const CODE_BLOCK_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

/** Object-local x-position where code text starts, sampled from FigJam. */
const CODE_TEXT_START_X_PX = CODE_BLOCK.gutter.codeStartFromLeftPx;
/** Right-aligned line-number column: its right edge lands at the sampled gutter x. */
const CODE_LINE_NUMBER_COLUMN_WIDTH_PX = CODE_BLOCK.gutter.numberColumnFromLeftPx;
const CODE_LINE_NUMBER_TO_TEXT_GAP_PX =
  CODE_BLOCK.gutter.codeStartFromLeftPx - CODE_BLOCK.gutter.numberColumnFromLeftPx;
const CODE_PADDING_RIGHT_PX = 16;
const CODE_PADDING_BOTTOM_PX = 16;

/**
 * Object-local rect of the code TEXT area: right of the line-number gutter,
 * inside the block's padding — so the in-place editor's raw source lines sit
 * exactly where the tokenized lines render at rest.
 */
export function codeBlockTextRect(object: InteractiveCanvasObject): LocalRect {
  return {
    x: CODE_TEXT_START_X_PX,
    y: CODE_BLOCK.paddingTopPx,
    width: Math.max(0, object.geometry.width - CODE_TEXT_START_X_PX - CODE_PADDING_RIGHT_PX),
    height: Math.max(0, object.geometry.height - CODE_BLOCK.paddingTopPx - CODE_PADDING_BOTTOM_PX),
  };
}

/** Code-block text slot: mono, top-left, multiline, Dracula foreground. */
export const CODE_BLOCK_TEXT_SLOT: TextSlot = rectTextSlot(codeBlockTextRect, {
  typography: {
    fontSizePx: 13,
    fontWeight: 400,
    lineHeight: "1.5",
    textAlign: "left",
    color: CODE_BLOCK.syntax.fg,
    fontFamily: CODE_BLOCK_FONT_FAMILY,
  },
  verticalAlign: "top",
});

/**
 * Code block (W2, P2 text unification) — tokenized per-line rendering of
 * `object.text` with a right-aligned line-number gutter, driven by the
 * minimal tokenizer in render/code-tokenizer.ts (`object.language` selects
 * the token rules). While the in-place editor is open (`hideText`) the
 * tokenized body hides and the editor shows the raw source in the same slot
 * rect/typography.
 */
function CodeBlockObjectView(props: ObjectRenderProps) {
  const { object, hideText } = props;
  const codeLines = tokenizeCodeBlock(object.text, object.language);
  return (
    <ObjectButtonChrome
      object={object}
      renderShape="code-block"
      className="interactive-canvas-object interactive-canvas-object-code-block"
      selected={props.selected}
      changed={props.changed}
      dropTarget={props.dropTarget}
      editable={props.editable}
      bounds={props.bounds}
      buttonBorder="suppressed"
      onObjectSelect={props.onObjectSelect}
      onObjectContextMenu={props.onObjectContextMenu}
    >
      {!hideText && (
        <div className="interactive-canvas-code-block-body">
          {codeLines.map((line, lineIndex) => (
            // eslint-disable-next-line react/no-array-index-key -- lines are position-stable within a single render
            <div key={lineIndex} className="interactive-canvas-code-block-line">
              <span className="interactive-canvas-code-block-line-number">{lineIndex + 1}</span>
              <span className="interactive-canvas-code-block-line-code">
                {line.map((token, tokenIndex) => (
                  // eslint-disable-next-line react/no-array-index-key -- tokens are position-stable within a single render
                  <span key={tokenIndex} style={{ color: token.color }}>
                    {token.text}
                  </span>
                ))}
                {line.length === 0 && " "}
              </span>
            </div>
          ))}
        </div>
      )}
    </ObjectButtonChrome>
  );
}

export const codeBlockDef: ObjectDef = {
  kind: "code-block",
  render: CodeBlockObjectView,
  css: `
        /* W2 — code-block: Dracula theme, mono font, right-aligned line-number gutter. */
        .interactive-canvas-object-code-block {
          align-items: stretch;
          justify-content: flex-start;
          background: ${CODE_BLOCK.bg} !important;
          border: none;
          border-radius: ${CODE_BLOCK.cornerRadiusPx}px;
          padding: ${CODE_BLOCK.paddingTopPx}px ${CODE_PADDING_RIGHT_PX}px ${CODE_PADDING_BOTTOM_PX}px 0;
          box-shadow: none;
        }
        .interactive-canvas-code-block-body {
          display: flex;
          flex-direction: column;
          width: 100%;
          overflow: hidden;
          font-family: ${CODE_BLOCK_FONT_FAMILY};
          font-size: 13px;
          line-height: 1.5;
          color: ${CODE_BLOCK.syntax.fg};
        }
        .interactive-canvas-code-block-line {
          display: flex;
          gap: ${CODE_LINE_NUMBER_TO_TEXT_GAP_PX}px;
          white-space: pre;
        }
        .interactive-canvas-code-block-line-number {
          flex: 0 0 auto;
          width: ${CODE_LINE_NUMBER_COLUMN_WIDTH_PX}px;
          text-align: right;
          color: ${CODE_BLOCK.gutter.lineNumberColor};
          user-select: none;
        }
        .interactive-canvas-code-block-line-code {
          flex: 1 1 auto;
          min-width: 0;
        }
`,
  // Stamped from the schema-vocabulary defaults leaf (P4) like every def.
  defaults: objectTypeDefaults("code-block"),
  // The Dracula background CSS wins over the chrome fill (`!important`), but
  // the pick still needs a role table to resolve through like every kind.
  colorRole: "shape",
  buttonBorder: "suppressed",
  handles: "all",
  outline: BBOX_OUTLINE,
  dragCapture: "none",
  // Pre-migration, this type resolved to the "shape" toolbar variant.
  toolbar: SHAPE_TOOLBAR,
  textSlot: CODE_BLOCK_TEXT_SLOT,
  textEditing: { editable: true },
};
