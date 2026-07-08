import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { InteractiveCanvasObject } from "../../../../state/schema";
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
    cleanup();

    const codeBlock = makeObject({
      id: "code",
      type: "code-block",
      text: "const x = 1;",
      style: { shape: "code-block" },
      language: "typescript",
    });
    const codeView = render(
      <TextEditingOverlay textEditing={apiFor(codeBlock, codeBlock.text, () => undefined)} zoom={1} />,
    );
    expect(codeView.container.querySelector("textarea")).not.toBeNull();
  });

  it("renders sticky markdown structure with inactive-line markers hidden but still present", () => {
    const sticky = makeObject({
      id: "sticky-structure",
      type: "sticky",
      text: "# Heading\n- **bold** and `code`",
      style: { shape: "note" },
    });
    const { container } = render(
      <TextEditingOverlay textEditing={apiFor(sticky, sticky.text, () => undefined)} zoom={1} />,
    );

    const editor = screen.getByRole("textbox", { name: "Object text" });
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe(
      "# Heading\n- **bold** and `code`",
    );
    const lines = container.querySelectorAll<HTMLElement>("[data-sticky-markdown-line]");
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute("data-heading")).toBe("1");
    expect(lines[0].style.fontSize).toBe("1.5em");

    const headingMarker = lines[0].querySelector<HTMLElement>(
      '[data-sticky-markdown-marker="heading-prefix"]',
    );
    const bulletMarker = lines[1].querySelector<HTMLElement>(
      '[data-sticky-markdown-marker="bullet-prefix"]',
    );
    const boldMarkers = lines[1].querySelectorAll<HTMLElement>(
      '[data-sticky-markdown-marker="bold-marker"]',
    );
    const code = lines[1].querySelector("code");

    expect(headingMarker).not.toBeNull();
    expect(headingMarker!.getAttribute("data-sticky-markdown-marker-hidden")).toBeNull();
    expect(bulletMarker).not.toBeNull();
    expect(bulletMarker!.getAttribute("data-sticky-markdown-marker-hidden")).toBe("true");
    expect(boldMarkers).toHaveLength(2);
    expect(code?.textContent).toContain("`code`");
  });

  it("commits, cancels, and blurs with the raw markdown source", () => {
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
    pastePlainText(editor, "# New");
    expect(editor.getAttribute("data-sticky-markdown-source")).toBe("# New");

    fireEvent.keyDown(editor, { key: "Enter" });
    expect(commits).toEqual(["# New"]);
    expect(cancels).toEqual([]);
  });

  it("Escape cancels and Shift+Enter keeps the sticky editor open", () => {
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
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
    expect(commits).toEqual([]);
    expect(screen.getByRole("textbox", { name: "Object text" })).toBeTruthy();

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(cancels).toEqual([1]);
    expect(commits).toEqual([]);
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
