"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  resolveTextSlot,
  textPlacementName,
  type ResolvedTextSlot,
  type TextSlot,
} from "../../../objects/text-slots";
import {
  STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX,
} from "../../../objects/sticky/markdown";
import {
  activeStickyMarkdownLineIndexes,
  applyStickyMarkdownEdit,
  parseStickyMarkdown,
  sourceOffsetToStickyMarkdownDomPosition,
  stickyMarkdownDomPositionToSourceOffset,
  STICKY_MARKDOWN_MONO_FONT,
  type StickyMarkdownDocument,
  type StickyMarkdownEdit,
  type StickyMarkdownInlineToken,
  type StickyMarkdownLeaf,
  type StickyMarkdownLine,
  type StickyMarkdownSelection,
} from "../../../objects/sticky/markdown-editing";
import type { InteractiveCanvasObject } from "../../../state/schema";
import type { TextEditingApi } from "./use-text-editing";

interface MarkdownSlotTextEditorProps {
  target: InteractiveCanvasObject;
  slot: TextSlot;
  value: string;
  setValue: TextEditingApi["setObjectTextEditValue"];
  commit: TextEditingApi["commitObjectText"];
  cancel: TextEditingApi["cancelObjectTextEdit"];
}

const SLOT_JUSTIFY: Record<ResolvedTextSlot["verticalAlign"], CSSProperties["justifyContent"]> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};

const SOURCE_ATTR = "data-sticky-markdown-source";
const LINE_ATTR = "data-sticky-markdown-line";
const LEAF_KEY_ATTR = "data-sticky-markdown-leaf-key";
const LEAF_ROLE_ATTR = "data-sticky-markdown-leaf-role";
const SOURCE_START_ATTR = "data-sticky-markdown-source-start";
const SOURCE_END_ATTR = "data-sticky-markdown-source-end";
const NBSP = "\u00A0";

const HEADING_STYLE: Record<1 | 2 | 3, CSSProperties> = {
  1: {
    fontSize: "1.5em",
    lineHeight: `${STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX[1]}px`,
    fontWeight: 700,
  },
  2: {
    fontSize: "1.25em",
    lineHeight: `${STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX[2]}px`,
    fontWeight: 700,
  },
  3: {
    fontSize: "1.1em",
    lineHeight: `${STICKY_MARKDOWN_HEADING_LINE_HEIGHT_PX[3]}px`,
    fontWeight: 700,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sourceNumber(element: HTMLElement, attribute: string): number {
  return Number.parseInt(element.getAttribute(attribute) ?? "0", 10);
}

function closestLeaf(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  if (current?.nodeType === Node.TEXT_NODE) current = current.parentNode;
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.hasAttribute(LEAF_KEY_ATTR)) return current;
    current = current.parentNode;
  }
  return current instanceof HTMLElement && current.hasAttribute(LEAF_KEY_ATTR) ? current : null;
}

function firstLeaf(node: Node | null): HTMLElement | null {
  if (!node) return null;
  if (node instanceof HTMLElement && node.hasAttribute(LEAF_KEY_ATTR)) return node;
  if (node instanceof Element) return node.querySelector<HTMLElement>(`[${LEAF_KEY_ATTR}]`);
  return firstLeaf(node.parentElement);
}

function lastLeaf(node: Node | null): HTMLElement | null {
  if (!node) return null;
  if (node instanceof HTMLElement && node.hasAttribute(LEAF_KEY_ATTR)) return node;
  if (node instanceof Element) {
    const leaves = node.querySelectorAll<HTMLElement>(`[${LEAF_KEY_ATTR}]`);
    return leaves.item(leaves.length - 1);
  }
  return lastLeaf(node.parentElement);
}

function offsetFromLeaf(leaf: HTMLElement, textOffset: number): number {
  const start = sourceNumber(leaf, SOURCE_START_ATTR);
  const end = sourceNumber(leaf, SOURCE_END_ATTR);
  if (end === start) return start;
  return start + clamp(textOffset, 0, end - start);
}

function domPointToSourceOffset(
  root: HTMLElement,
  node: Node,
  nodeOffset: number,
  fallback: number,
): number {
  const leaf = closestLeaf(node, root);
  if (leaf) return offsetFromLeaf(leaf, nodeOffset);

  if (node instanceof Element) {
    const next = node.childNodes.item(nodeOffset);
    const nextLeaf = firstLeaf(next);
    if (nextLeaf) return sourceNumber(nextLeaf, SOURCE_START_ATTR);

    const previous = node.childNodes.item(nodeOffset - 1);
    const previousLeaf = lastLeaf(previous);
    if (previousLeaf) return sourceNumber(previousLeaf, SOURCE_END_ATTR);
  }

  return fallback;
}

function currentDomSelection(
  root: HTMLElement,
  fallback: StickyMarkdownSelection,
): StickyMarkdownSelection {
  const selection = root.ownerDocument.getSelection?.() ?? window.getSelection?.() ?? null;
  if (!selection || selection.rangeCount === 0) return fallback;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return fallback;

  const start = domPointToSourceOffset(root, range.startContainer, range.startOffset, fallback.start);
  const end = domPointToSourceOffset(root, range.endContainer, range.endOffset, fallback.end);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function leafElementForPosition(
  root: HTMLElement,
  position: ReturnType<typeof sourceOffsetToStickyMarkdownDomPosition>,
): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>(`[${LEAF_KEY_ATTR}]`)) {
    if (element.getAttribute(LEAF_KEY_ATTR) === position.leafKey) return element;
  }
  return null;
}

function textNodeForLeaf(element: HTMLElement): Text | HTMLElement {
  const first = element.firstChild;
  return first?.nodeType === Node.TEXT_NODE ? (first as Text) : element;
}

function domPointForSourceOffset(
  root: HTMLElement,
  document: StickyMarkdownDocument,
  sourceOffset: number,
): { node: Text | HTMLElement; offset: number } {
  const position = sourceOffsetToStickyMarkdownDomPosition(document, sourceOffset);
  const element = leafElementForPosition(root, position);
  if (!element) return { node: root, offset: 0 };
  const node = textNodeForLeaf(element);
  const maxOffset = node instanceof Text ? node.data.length : node.childNodes.length;
  return { node, offset: clamp(position.offset, 0, maxOffset) };
}

function restoreDomSelection(
  root: HTMLElement,
  document: StickyMarkdownDocument,
  selectionRange: StickyMarkdownSelection,
): void {
  const selection = root.ownerDocument.getSelection?.() ?? window.getSelection?.() ?? null;
  if (!selection) return;

  const start = domPointForSourceOffset(root, document, selectionRange.start);
  const end = domPointForSourceOffset(root, document, selectionRange.end);
  const range = root.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function serializeMarkdownSourceFromDom(root: HTMLElement): string {
  const lines = Array.from(root.querySelectorAll<HTMLElement>(`[${LINE_ATTR}]`));
  return lines
    .map((line) =>
      Array.from(line.querySelectorAll<HTMLElement>(`[${LEAF_KEY_ATTR}]`))
        .map((leaf) => {
          const text = leaf.textContent ?? "";
          if (leaf.getAttribute(LEAF_ROLE_ATTR) === "placeholder" && text === NBSP) return "";
          return text;
        })
        .join(""),
    )
    .join("\n");
}

function readPlainTextPaste(event: ClipboardEvent<HTMLDivElement>): string {
  return event.clipboardData.getData("text/plain");
}

function markerStyle(leaf: StickyMarkdownLeaf, markerVisible: boolean): CSSProperties | undefined {
  if (leaf.role !== "marker") return undefined;
  return markerVisible
    ? { opacity: 0.35 }
    : {
        opacity: 0,
        fontSize: 0,
        lineHeight: 0,
        userSelect: "none",
      };
}

function renderLeaf(leaf: StickyMarkdownLeaf, markerVisible: boolean): ReactNode {
  return (
    <span
      key={leaf.key}
      {...{
        [LEAF_KEY_ATTR]: leaf.key,
        [LEAF_ROLE_ATTR]: leaf.role,
        [SOURCE_START_ATTR]: leaf.sourceStart,
        [SOURCE_END_ATTR]: leaf.sourceEnd,
      }}
      data-sticky-markdown-marker={leaf.role === "marker" ? leaf.markerKind : undefined}
      data-sticky-markdown-marker-hidden={
        leaf.role === "marker" && !markerVisible ? "true" : undefined
      }
      style={markerStyle(leaf, markerVisible)}
    >
      {leaf.text}
    </span>
  );
}

function renderInlineToken(
  token: StickyMarkdownInlineToken,
  markerVisible: boolean,
): ReactNode {
  if (token.kind === "text") return renderLeaf(token.leaf, markerVisible);
  if (token.kind === "strong") {
    return (
      <strong key={token.content.key}>
        {renderLeaf(token.openMarker, markerVisible)}
        {renderLeaf(token.content, markerVisible)}
        {renderLeaf(token.closeMarker, markerVisible)}
      </strong>
    );
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
      {renderLeaf(token.openMarker, markerVisible)}
      {renderLeaf(token.content, markerVisible)}
      {renderLeaf(token.closeMarker, markerVisible)}
    </code>
  );
}

function renderLine(line: StickyMarkdownLine, markerVisible: boolean): ReactNode {
  return (
    <span
      // eslint-disable-next-line react/no-array-index-key -- lines are position-stable within a single render
      key={line.index}
      className="interactive-canvas-sticky-line"
      {...{ [LINE_ATTR]: line.index }}
      data-sticky-markdown-line-active={markerVisible ? "true" : undefined}
      data-heading={line.headingLevel}
      data-bullet={line.kind === "bullet" ? "true" : undefined}
      style={line.headingLevel ? HEADING_STYLE[line.headingLevel] : undefined}
    >
      {line.prefix ? renderLeaf(line.prefix, markerVisible) : null}
      {line.placeholder
        ? renderLeaf(line.placeholder, markerVisible)
        : line.inline.map((token) => renderInlineToken(token, markerVisible))}
    </span>
  );
}

/**
 * Live markdown editor for sticky slots (D14 + D18). The component is fully
 * controlled by the raw markdown source: the browser never owns the DOM shape
 * of the contentEditable. `beforeinput` is translated into a source edit,
 * React renders a fresh decorated tree, and selection is restored through the
 * pure source-offset leaf map. That is why hidden markers can be zero-width
 * on inactive lines without losing caret correctness.
 */
export function MarkdownSlotTextEditor({
  target,
  slot,
  value,
  setValue,
  commit,
  cancel,
}: MarkdownSlotTextEditorProps) {
  const resolved = resolveTextSlot(slot, target, 1, { draftText: value });
  const { rect, typography } = resolved;
  const placementName = textPlacementName(slot.placement);
  const editableRef = useRef<HTMLDivElement | null>(null);
  const composingRef = useRef(false);
  const [selection, setSelectionState] = useState<StickyMarkdownSelection>({
    start: 0,
    end: 0,
  });
  const selectionRef = useRef(selection);
  const desiredSelectionRef = useRef<StickyMarkdownSelection | null>(null);
  const beforeInputHandlerRef = useRef<(event: InputEvent) => void>(() => undefined);
  const documentModel = useMemo(() => parseStickyMarkdown(value), [value]);
  const activeLines = useMemo(
    () => activeStickyMarkdownLineIndexes(documentModel, selection),
    [documentModel, selection],
  );

  function setSelection(next: StickyMarkdownSelection): void {
    selectionRef.current = next;
    setSelectionState(next);
  }

  function applyEdit(edit: StickyMarkdownEdit): void {
    const element = editableRef.current;
    const currentSelection = element
      ? currentDomSelection(element, selectionRef.current)
      : selectionRef.current;
    const result = applyStickyMarkdownEdit(value, currentSelection, edit);
    desiredSelectionRef.current = result.selection;
    setSelection(result.selection);
    setValue(result.source);
  }

  function reconcileDomMutation(element: HTMLDivElement): void {
    // IME/composition support is intentionally defensive rather than clever:
    // during composition we let the browser mutate the contentEditable so it
    // can show the platform candidate UI, then serialize the leaf text back to
    // source. If the platform leaves a mappable DOM selection, keep it in raw
    // source coordinates; otherwise fall back to the end of the composed source.
    const nextSource = serializeMarkdownSourceFromDom(element);
    const unmappedSelection = { start: -1, end: -1 };
    const mappedSelection = currentDomSelection(element, unmappedSelection);
    const nextSelection =
      mappedSelection.start < 0 || mappedSelection.end < 0
        ? { start: nextSource.length, end: nextSource.length }
        : {
            start: clamp(mappedSelection.start, 0, nextSource.length),
            end: clamp(mappedSelection.end, 0, nextSource.length),
          };
    desiredSelectionRef.current = nextSelection;
    setSelection(nextSelection);
    setValue(nextSource);
  }

  beforeInputHandlerRef.current = (event: InputEvent): void => {
    if (composingRef.current || event.isComposing) return;

    let edit: StickyMarkdownEdit | null = null;
    if (event.inputType === "insertText") {
      edit = { type: "insertText", text: event.data ?? "" };
    } else if (
      event.inputType === "insertParagraph" ||
      event.inputType === "insertLineBreak"
    ) {
      edit = { type: "insertLineBreak" };
    } else if (event.inputType === "deleteContentBackward") {
      edit = { type: "deleteContentBackward" };
    } else if (event.inputType === "deleteContentForward") {
      edit = { type: "deleteContentForward" };
    } else if (event.inputType === "insertFromPaste") {
      edit = {
        type: "insertText",
        text: event.dataTransfer?.getData("text/plain") ?? event.data ?? "",
      };
    }

    if (!edit) return;
    event.preventDefault();
    applyEdit(edit);
  };

  useEffect(() => {
    const element = editableRef.current;
    if (!element) return;

    // React 19's onBeforeInput is still synthesized from keypress/textInput and
    // does not expose InputEvent.inputType. Register the native event once and
    // route through a ref so the handler always sees the latest draft state.
    const handleBeforeInput = (event: InputEvent) => {
      beforeInputHandlerRef.current(event);
    };
    element.addEventListener("beforeinput", handleBeforeInput);
    return () => {
      element.removeEventListener("beforeinput", handleBeforeInput);
    };
  }, []);

  useLayoutEffect(() => {
    const element = editableRef.current;
    const desired = desiredSelectionRef.current;
    if (!element || !desired) return;
    restoreDomSelection(element, documentModel, desired);
    desiredSelectionRef.current = null;
  }, [documentModel]);

  return (
    <div
      data-canvas-text-editor={target.id}
      data-canvas-text-slot={placementName}
      style={{
        position: "absolute",
        left: `${target.geometry.x + rect.x}px`,
        top: `${target.geometry.y + rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: SLOT_JUSTIFY[resolved.verticalAlign],
        overflow: "hidden",
        // The worldOverlay container is pointer-events: none (inherited), so
        // mouse interaction must be re-enabled on the editor itself.
        pointerEvents: "auto",
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        ref={editableRef}
        autoFocus
        role="textbox"
        aria-label="Object text"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        {...{ [SOURCE_ATTR]: value }}
        onFocus={(event) => {
          const nextSelection = { start: 0, end: value.length };
          desiredSelectionRef.current = nextSelection;
          setSelection(nextSelection);
          restoreDomSelection(event.currentTarget, documentModel, nextSelection);
        }}
        onBlur={commit}
        onInput={(event) => {
          if (!composingRef.current) reconcileDomMutation(event.currentTarget);
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          reconcileDomMutation(event.currentTarget);
        }}
        onPaste={(event) => {
          // Paste fires before beforeinput; preventing it here suppresses the
          // subsequent paste beforeinput in browsers, avoiding double insertion.
          event.preventDefault();
          applyEdit({ type: "insertText", text: readPlainTextPaste(event) });
        }}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            commit();
          } else if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();
            applyEdit({ type: "insertLineBreak" });
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        onKeyUp={(event) => {
          setSelection(currentDomSelection(event.currentTarget, selectionRef.current));
        }}
        onMouseUp={(event) => {
          setSelection(currentDomSelection(event.currentTarget, selectionRef.current));
        }}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          // No border, no background, no padding — the object underneath is
          // the chrome (D14: no dimming, no visual jump).
          background: "transparent",
          border: "none",
          outline: "none",
          padding: 0,
          margin: 0,
          overflow: "hidden",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          fontSize: `${typography.fontSizePx}px`,
          fontWeight: typography.fontWeight,
          lineHeight: typography.lineHeight,
          textAlign: typography.textAlign,
          color: typography.color,
          caretColor: typography.color,
          fontFamily: typography.fontFamily ?? "inherit",
          // The stage root is user-select: none — the active editor is the
          // one place in-text selection must work (contentEditable does NOT
          // exempt itself from an inherited user-select: none).
          userSelect: "text",
          WebkitUserSelect: "text",
        }}
      >
        {documentModel.lines.map((line) => renderLine(line, activeLines.has(line.index)))}
      </div>
    </div>
  );
}
