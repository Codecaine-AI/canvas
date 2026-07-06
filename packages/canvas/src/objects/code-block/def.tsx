"use client";

import { CODE_BLOCK } from "../../render/figjam-tokens";
import { tokenizeCodeBlock } from "../../render/code-tokenizer";
import { EdgePorts, ObjectButtonChrome } from "../object-chrome";
import type { ObjectDef, ObjectRenderProps } from "../object-def";

/**
 * Code block (W2) — tokenized per-line rendering with a right-aligned
 * line-number gutter, driven by the minimal tokenizer in
 * render/code-tokenizer.ts (`object.language` selects the token rules).
 * W4 — code-blocks render body-only: FigJam code blocks carry no label
 * chrome, so there is no label span (label editing still targets `label`
 * for a11y/docs naming).
 */
function CodeBlockObjectView(props: ObjectRenderProps) {
  const { object, showPorts, zoom = 1 } = props;
  const codeLines = tokenizeCodeBlock(object.body ?? "", object.language);
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
      onObjectSelect={props.onObjectSelect}
      onObjectContextMenu={props.onObjectContextMenu}
    >
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
      {showPorts && <EdgePorts object={object} zoom={zoom} />}
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
          padding: ${CODE_BLOCK.paddingTopPx}px 16px 16px 0;
          box-shadow: none;
        }
        .interactive-canvas-code-block-body {
          display: flex;
          flex-direction: column;
          width: 100%;
          overflow: hidden;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 13px;
          line-height: 1.5;
          color: ${CODE_BLOCK.syntax.fg};
        }
        .interactive-canvas-code-block-line {
          display: flex;
          gap: 12px;
          white-space: pre;
        }
        .interactive-canvas-code-block-line-number {
          flex: 0 0 auto;
          width: 24px;
          text-align: right;
          color: ${CODE_BLOCK.gutter.lineNumberColor};
          user-select: none;
        }
        .interactive-canvas-code-block-line-code {
          flex: 1 1 auto;
          min-width: 0;
        }
`,
  defaults: {
    geometry: { x: 160, y: 160, width: 320, height: 200 },
    tone: "neutral",
    shape: "code-block",
    label: "Code Block",
  },
  handles: "all",
  hitTest: "solid",
  dragCapture: "none",
  labelEditing: { target: "label" },
};
