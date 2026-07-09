import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { stickyDef } from "../../../../../objects/sticky/def";
import type { InteractiveCanvasObject } from "../../../../../state/schema";
import { TextEditingOverlay } from "../TextEditingOverlay";
import type { TextEditingApi } from "../use-text-editing";

function makeObject(
  partial: Partial<InteractiveCanvasObject> & Pick<InteractiveCanvasObject, "id" | "type">,
): InteractiveCanvasObject {
  return {
    text: "Hello text",
    parentId: null,
    geometry: { x: 100, y: 200, width: 240, height: 220 },
    ...partial,
  } as InteractiveCanvasObject;
}

function apiFor(
  target: InteractiveCanvasObject,
  value: string,
  setValue: TextEditingApi["setObjectTextEditValue"],
  commit: TextEditingApi["commitObjectText"] = () => undefined,
  cancel: TextEditingApi["cancelObjectTextEdit"] = () => undefined,
): TextEditingApi {
  const noop = () => {};
  return {
    labelEditConnectionId: null,
    labelEditValue: "",
    setLabelEditValue: noop,
    labelEditPoint: null,
    openConnectionLabelEditor: noop,
    commitConnectionLabel: noop,
    cancelConnectionLabelEdit: noop,
    objectTextEditId: target.id,
    setObjectTextEditId: noop,
    objectTextEditValue: value,
    setObjectTextEditValue: setValue,
    objectTextEditTarget: target,
    openObjectTextEditor: noop,
    commitObjectText: commit,
    cancelObjectTextEdit: cancel,
  };
}

function MarkdownHarness({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const object = makeObject({
    id: "sticky-editor",
    type: "sticky",
    text: initialValue,
    style: { shape: "note" },
  });
  return (
    <TextEditingOverlay
      zoom={1}
      textEditing={apiFor(
        object,
        value,
        setValue,
        () => onCommit(value),
        () => onCancel?.(),
      )}
    />
  );
}

function pastePlainText(element: HTMLElement, text: string): void {
  fireEvent.paste(element, {
    clipboardData: {
      getData: (type: string) => (type === "text/plain" ? text : ""),
    },
  });
}

function dispatchNativeBeforeInput(
  element: HTMLElement,
  init: Pick<InputEventInit, "inputType" | "data">,
): { defaultAllowed: boolean; event: InputEvent } {
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  let defaultAllowed = true;
  act(() => {
    defaultAllowed = element.dispatchEvent(event);
  });
  return { defaultAllowed, event };
}

function dispatchKeyDown(
  element: HTMLElement,
  init: KeyboardEventInit & { key: string },
): { defaultAllowed: boolean; event: KeyboardEvent } {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  let defaultAllowed = true;
  act(() => {
    defaultAllowed = element.dispatchEvent(event);
  });
  return { defaultAllowed, event };
}

function sourceNumber(element: HTMLElement, attribute: string): number {
  return Number.parseInt(element.getAttribute(attribute) ?? "0", 10);
}

function leafForSourceOffset(editor: HTMLElement, sourceOffset: number): HTMLElement {
  const leaves = Array.from(
    editor.querySelectorAll<HTMLElement>("[data-sticky-markdown-leaf-key]"),
  );
  const leaf = leaves.find((candidate) => {
    const start = sourceNumber(candidate, "data-sticky-markdown-source-start");
    const end = sourceNumber(candidate, "data-sticky-markdown-source-end");
    return start <= sourceOffset && sourceOffset <= end && end > start;
  });
  if (!leaf) throw new Error(`No markdown leaf found for source offset ${sourceOffset}`);
  return leaf;
}

function setCollapsedDomSelection(editor: HTMLElement, node: Node, offset: number): void {
  const selection = editor.ownerDocument.getSelection?.() ?? window.getSelection?.();
  if (!selection) throw new Error("DOM selection is not available");
  const range = editor.ownerDocument.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setSourceCaret(editor: HTMLElement, sourceOffset: number): void {
  const leaf = leafForSourceOffset(editor, sourceOffset);
  const text = leaf.firstChild;
  if (!text || text.nodeType !== Node.TEXT_NODE) {
    throw new Error(`Markdown leaf for source offset ${sourceOffset} has no text node`);
  }
  const sourceStart = sourceNumber(leaf, "data-sticky-markdown-source-start");
  setCollapsedDomSelection(editor, text, sourceOffset - sourceStart);
  fireEvent.keyUp(editor);
}

afterEach(() => {
  cleanup();
});

describe("MarkdownSlotTextEditor", () => {
  it("uses a contentEditable textbox for sticky notes and keeps textarea for non-markdown objects", () => {
    const sticky = makeObject({
      id: "sticky",
      type: "sticky",
      text: "# Heading",
      style: { shape: "note" },
    });
    const stickyView = render(
      <TextEditingOverlay textEditing={apiFor(sticky, sticky.text, () => undefined)} zoom={1} />,
    );
    const markdownEditor = screen.getByRole("textbox", { name: "Object text" });
    expect(markdownEditor.tagName).toBe("DIV");
    expect(markdownEditor.getAttribute("contenteditable")).toBe("true");
    expect(markdownEditor.getAttribute("aria-multiline")).toBe("true");
    expect(stickyView.container.querySelector("textarea")).toBeNull();
    cleanup();

    const process = makeObject({
      id: "process",
      type: "process",
      style: { shape: "rounded-rect" },
    });
    const processView = render(
      <TextEditingOverlay textEditing={apiFor(process, process.text, () => undefined)} zoom={1} />,
    );
    expect(processView.container.querySelector("textarea")).not.toBeNull();
  });

  it("renders sticky markdown structure with prefix markers always hidden", () => {
    const sticky = makeObject({
      id: "sticky-structure",
      type: "sticky",
      text: "# **Heading**\n  plain\n- **bold** and `code`",
      style: { shape: "note" },
    });
    const { container } = render(
      <TextEditingOverlay textEditing={apiFor(sticky, sticky.text, () => undefined)} zoom={1} />,
    );

    const editor = screen.getByRole("textbox", { name: "Object text" });
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe(
      "# **Heading**\n  plain\n- **bold** and `code`",
    );
    const lines = container.querySelectorAll<HTMLElement>("[data-sticky-markdown-line]");
    expect(lines).toHaveLength(3);
    expect(lines[0].getAttribute("data-heading")).toBe("1");
    expect(lines[0].style.fontSize).toBe("1.5em");

    const headingMarker = lines[0].querySelector<HTMLElement>(
      '[data-sticky-markdown-marker="heading-prefix"]',
    );
    const indentMarker = lines[1].querySelector<HTMLElement>(
      '[data-sticky-markdown-marker="indent-prefix"]',
    );
    const bulletMarker = lines[2].querySelector<HTMLElement>(
      '[data-sticky-markdown-marker="bullet-prefix"]',
    );
    const boldMarkers = lines[2].querySelectorAll<HTMLElement>(
      '[data-sticky-markdown-marker="bold-marker"]',
    );
    const activeBoldMarkers = lines[0].querySelectorAll<HTMLElement>(
      '[data-sticky-markdown-marker="bold-marker"]',
    );
    const inactiveCodeMarkers = lines[2].querySelectorAll<HTMLElement>(
      '[data-sticky-markdown-marker="code-marker"]',
    );
    const code = lines[2].querySelector("code");

    expect(headingMarker).not.toBeNull();
    expect(headingMarker!.getAttribute("data-sticky-markdown-marker-hidden")).toBe("true");
    expect(indentMarker).not.toBeNull();
    expect(indentMarker!.getAttribute("data-sticky-markdown-marker-hidden")).toBe("true");
    expect(bulletMarker).not.toBeNull();
    expect(bulletMarker!.getAttribute("data-sticky-markdown-marker-hidden")).toBe("true");
    expect(activeBoldMarkers).toHaveLength(2);
    expect(
      Array.from(activeBoldMarkers).map((marker) =>
        marker.getAttribute("data-sticky-markdown-marker-hidden"),
      ),
    ).toEqual([null, null]);
    expect(boldMarkers).toHaveLength(2);
    expect(
      Array.from(boldMarkers).map((marker) =>
        marker.getAttribute("data-sticky-markdown-marker-hidden"),
      ),
    ).toEqual(["true", "true"]);
    expect(
      Array.from(inactiveCodeMarkers).map((marker) =>
        marker.getAttribute("data-sticky-markdown-marker-hidden"),
      ),
    ).toEqual(["true", "true"]);
    expect(code?.textContent).toContain("`code`");
  });

  it("replaces the selected source through the native beforeinput insertText path", () => {
    render(<MarkdownHarness initialValue="Hello" onCommit={() => undefined} />);

    const editor = screen.getByRole("textbox", { name: "Object text" });
    fireEvent.focus(editor);
    const result = dispatchNativeBeforeInput(editor, { inputType: "insertText", data: "x" });

    expect(result.defaultAllowed).toBe(false);
    expect(result.event.defaultPrevented).toBe(true);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("x");
  });

  it("handles native beforeinput deleteContentBackward at a mid-text caret", () => {
    render(<MarkdownHarness initialValue="abc" onCommit={() => undefined} />);

    const editor = screen.getByRole("textbox", { name: "Object text" });
    fireEvent.focus(editor);
    setSourceCaret(editor, 2);
    const result = dispatchNativeBeforeInput(editor, { inputType: "deleteContentBackward" });

    expect(result.defaultAllowed).toBe(false);
    expect(result.event.defaultPrevented).toBe(true);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("ac");
  });

  it("handles native beforeinput insertParagraph through markdown source edits", () => {
    render(<MarkdownHarness initialValue="- item" onCommit={() => undefined} />);

    const editor = screen.getByRole("textbox", { name: "Object text" });
    fireEvent.focus(editor);
    setSourceCaret(editor, "- item".length);
    const result = dispatchNativeBeforeInput(editor, { inputType: "insertParagraph" });

    expect(result.defaultAllowed).toBe(false);
    expect(result.event.defaultPrevented).toBe(true);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("- item\n- ");
  });

  it("leaves unhandled native beforeinput types for the DOM reconcile fallback", () => {
    render(<MarkdownHarness initialValue="hello" onCommit={() => undefined} />);

    const editor = screen.getByRole("textbox", { name: "Object text" });
    const result = dispatchNativeBeforeInput(editor, {
      inputType: "insertReplacementText",
      data: "hey",
    });

    expect(result.defaultAllowed).toBe(true);
    expect(result.event.defaultPrevented).toBe(false);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("hello");
  });

  it("preserves a mappable DOM selection while reconciling browser mutations", () => {
    render(<MarkdownHarness initialValue="abc **def**" onCommit={() => undefined} />);

    const editor = screen.getByRole("textbox", { name: "Object text" });
    fireEvent.focus(editor);
    setSourceCaret(editor, 4);

    const leaf = leafForSourceOffset(editor, 4);
    const text = leaf.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) {
      throw new Error("Markdown leaf has no text node");
    }
    (text as Text).data = "abc x";
    setCollapsedDomSelection(editor, text, 5);
    fireEvent.input(editor);

    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("abc x**def**");
    dispatchNativeBeforeInput(editor, { inputType: "insertText", data: "y" });
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("abc xy**def**");
  });

  it("keeps active bullet lines on the decorative bullet attribute contract", () => {
    const { container } = render(
      <MarkdownHarness initialValue="- item" onCommit={() => undefined} />,
    );

    const editor = screen.getByRole("textbox", { name: "Object text" });
    fireEvent.focus(editor);
    const bulletLine = container.querySelector<HTMLElement>(".interactive-canvas-sticky-line");

    expect(
      bulletLine?.matches('[data-bullet="true"][data-line-depth="0"][data-bullet-glyph="1"]'),
    ).toBe(true);
    expect(bulletLine?.hasAttribute("data-sticky-markdown-line-active")).toBe(false);
  });

  it("defines static depth and glyph CSS without active-line bullet suppression", () => {
    expect(stickyDef.css).not.toContain(
      '.interactive-canvas-sticky-line[data-bullet="true"][data-sticky-markdown-line-active="true"]',
    );
    expect(stickyDef.css).not.toContain("data-bullet-depth");
    for (const depth of [0, 1, 2, 3, 4, 5]) {
      expect(stickyDef.css).toContain(
        `.interactive-canvas-sticky-line[data-line-depth="${depth}"]`,
      );
      expect(stickyDef.css).toContain(
        `.interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="${depth}"]`,
      );
    }
    expect(stickyDef.css).toContain(
      `.interactive-canvas-sticky-line[data-line-depth="5"] {
          padding-left: 5em;
        }`,
    );
    expect(stickyDef.css).toContain(
      `.interactive-canvas-sticky-line[data-bullet="true"][data-line-depth="5"]::before {
          left: 4em;
        }`,
    );
    expect(stickyDef.css).toContain('[data-bullet-glyph="1"]::before');
    expect(stickyDef.css).toContain('[data-bullet-glyph="2"]::before');
    expect(stickyDef.css).toContain('[data-bullet-glyph="3"]::before');
    expect(stickyDef.css).toContain('content: "•"');
    expect(stickyDef.css).toContain('content: "◦"');
    expect(stickyDef.css).toContain('content: "▪"');
    expect(stickyDef.css).toContain(
      `.interactive-canvas-sticky-line[data-bullet="true"]::before {
          position: absolute;
          width: 0.75em;
          text-align: left;
        }`,
    );
  });

  it("keeps Enter as a line break and Escape as the raw markdown commit", () => {
    const commits: string[] = [];
    const cancels: number[] = [];
    render(
      <MarkdownHarness
        initialValue="# Old"
        onCommit={(value) => commits.push(value)}
        onCancel={() => cancels.push(1)}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "Object text" });
    fireEvent.focus(editor);
    pastePlainText(editor, "- item");
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("- item");
    setSourceCaret(editor, "- item".length);

    const enter = dispatchKeyDown(editor, { key: "Enter" });
    expect(enter.defaultAllowed).toBe(false);
    expect(enter.event.defaultPrevented).toBe(true);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("- item\n- ");
    expect(commits).toEqual([]);
    expect(cancels).toEqual([]);

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(commits).toEqual(["- item\n- "]);
    expect(cancels).toEqual([]);
  });

  it("Shift+Enter continues bullets and Escape never cancels", () => {
    const commits: string[] = [];
    const cancels: number[] = [];
    render(
      <MarkdownHarness
        initialValue="- item"
        onCommit={(value) => commits.push(value)}
        onCancel={() => cancels.push(1)}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "Object text" });
    setSourceCaret(editor, "- item".length);
    const shiftEnter = dispatchKeyDown(editor, { key: "Enter", shiftKey: true });
    expect(shiftEnter.defaultAllowed).toBe(false);
    expect(shiftEnter.event.defaultPrevented).toBe(true);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("- item\n- ");
    expect(commits).toEqual([]);
    expect(cancels).toEqual([]);
    expect(screen.getByRole("textbox", { name: "Object text" })).toBeTruthy();

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(cancels).toEqual([]);
    expect(commits).toEqual(["- item\n- "]);
  });

  it("handles Tab and Shift+Tab without blurring the markdown editor", () => {
    render(<MarkdownHarness initialValue="- item" onCommit={() => undefined} />);

    let editor = screen.getByRole("textbox", { name: "Object text" });
    setSourceCaret(editor, 2);
    const indent = dispatchKeyDown(editor, { key: "Tab" });
    expect(indent.defaultAllowed).toBe(false);
    expect(indent.event.defaultPrevented).toBe(true);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("  - item");

    setSourceCaret(editor, 4);
    const outdent = dispatchKeyDown(editor, { key: "Tab", shiftKey: true });
    expect(outdent.defaultAllowed).toBe(false);
    expect(outdent.event.defaultPrevented).toBe(true);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("- item");

    cleanup();
    render(<MarkdownHarness initialValue="plain" onCommit={() => undefined} />);
    editor = screen.getByRole("textbox", { name: "Object text" });
    setSourceCaret(editor, 2);
    const plainIndent = dispatchKeyDown(editor, { key: "Tab" });
    expect(plainIndent.defaultAllowed).toBe(false);
    expect(plainIndent.event.defaultPrevented).toBe(true);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("  plain");

    cleanup();
    render(<MarkdownHarness initialValue="plain" onCommit={() => undefined} />);
    editor = screen.getByRole("textbox", { name: "Object text" });
    setSourceCaret(editor, 2);
    const noopOutdent = dispatchKeyDown(editor, { key: "Tab", shiftKey: true });
    expect(noopOutdent.defaultAllowed).toBe(false);
    expect(noopOutdent.event.defaultPrevented).toBe(true);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("plain");
  });

  it("converts typed bullet prefixes and restores the caret to visible content", () => {
    render(<MarkdownHarness initialValue="" onCommit={() => undefined} />);

    const editor = screen.getByRole("textbox", { name: "Object text" });
    const result = dispatchNativeBeforeInput(editor, { inputType: "insertText", data: "- " });
    const line = editor.querySelector<HTMLElement>("[data-sticky-markdown-line]");
    const placeholder = line?.querySelector<HTMLElement>(
      '[data-sticky-markdown-leaf-role="placeholder"]',
    );
    const selection = editor.ownerDocument.getSelection?.() ?? window.getSelection?.();

    expect(result.defaultAllowed).toBe(false);
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("- ");
    expect(line?.matches('[data-bullet="true"]')).toBe(true);
    expect(placeholder).not.toBeNull();
    expect(sourceNumber(placeholder!, "data-sticky-markdown-source-start")).toBe(2);
    expect(selection?.anchorNode).toBe(placeholder!.firstChild);
    expect(selection?.anchorOffset).toBe(0);
  });

  it("renders editor line depth and bullet glyph attributes through the shared contract", () => {
    const { container } = render(
      <MarkdownHarness
        initialValue={"- a\n  - b\n    - c\n          - deep\n            - deeper"}
        onCommit={() => undefined}
      />,
    );

    const bullets = Array.from(
      container.querySelectorAll<HTMLElement>('[data-sticky-markdown-line][data-bullet="true"]'),
    );

    expect(bullets.map((line) => line.getAttribute("data-line-depth"))).toEqual([
      "0",
      "1",
      "2",
      "5",
      "5",
    ]);
    expect(bullets.map((line) => line.getAttribute("data-bullet-glyph"))).toEqual([
      "1",
      "2",
      "3",
      "3",
      "3",
    ]);
  });

  it("renders an indented heading as a heading with a hidden prefix", () => {
    const { container } = render(
      <MarkdownHarness initialValue="  # Title" onCommit={() => undefined} />,
    );

    const line = container.querySelector<HTMLElement>("[data-sticky-markdown-line]");
    const prefix = line?.querySelector<HTMLElement>(
      '[data-sticky-markdown-marker="heading-prefix"]',
    );

    expect(line?.getAttribute("data-heading")).toBe("1");
    expect(line?.getAttribute("data-line-depth")).toBe("1");
    expect(line?.style.fontSize).toBe("1.5em");
    expect(prefix).not.toBeNull();
    expect(prefix!.getAttribute("data-sticky-markdown-marker-hidden")).toBe("true");
  });

  it("blur commits the current sticky markdown source", () => {
    const commits: string[] = [];
    render(<MarkdownHarness initialValue="Old" onCommit={(value) => commits.push(value)} />);

    const editor = screen.getByRole("textbox", { name: "Object text" });
    fireEvent.focus(editor);
    pastePlainText(editor, "Blurred **rename**");
    fireEvent.blur(editor);

    expect(commits).toEqual(["Blurred **rename**"]);
  });
});
