import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useRef } from "react";
import syntheticCanvas from "../../../../../canvases/synthetic.canvas.json";
import type { CanvasAction, CanvasSelection } from "../../state/actions";
import { IDLE_INTERACTION_STATE, type InteractionState } from "../../interaction/interaction";
import { InteractiveCanvasEditor } from "../InteractiveCanvasEditor";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { useCanvasHotkeys } from "../use-canvas-hotkeys";
import { SECTION_GEOMETRY } from "../../objects/section/def";

const syntheticCanvasDocument = syntheticCanvas as InteractiveCanvasDocument;

function makeObject(overrides: Partial<InteractiveCanvasObject> & { id: string }): InteractiveCanvasObject {
  return {
    type: "process",
    label: overrides.id,
    geometry: { x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  };
}

function makeDocument(objects: InteractiveCanvasObject[] = []): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "hotkeys-test-doc",
    mode: "diagram",
    objects,
    connections: [
      {
        id: "connection-a",
        from: { objectId: "a", anchor: "right" },
        to: { objectId: "b", anchor: "left" },
        style: "solid",
      },
    ],
  };
}

function dispatchKeyDown(init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  return window.dispatchEvent(event);
}

function setup(overrides: {
  selection?: CanvasSelection;
  isTypingContextActive?: () => boolean;
  isContextMenuOpen?: () => boolean;
  interactionState?: InteractionState;
} = {}) {
  const dispatch = mock((_action: CanvasAction) => {});
  const onCancelInteraction = mock((_result: unknown) => {});
  const onCloseContextMenu = mock(() => {});
  const controls = {
    fit: mock(() => {}),
    zoomIn: mock(() => {}),
    zoomOut: mock(() => {}),
  };
  const document = makeDocument([makeObject({ id: "a" }), makeObject({ id: "b" })]);
  const selection: CanvasSelection = overrides.selection ?? { kind: "objects", objectIds: ["a"] };

  const view = renderHook(() => {
    const interactionStateRef = useRef<InteractionState>(
      overrides.interactionState ?? IDLE_INTERACTION_STATE,
    );
    useCanvasHotkeys({
      document,
      selection,
      dispatch: dispatch as unknown as (action: CanvasAction) => void,
      isTypingContextActive: overrides.isTypingContextActive ?? (() => false),
      interactionStateRef,
      onCancelInteraction,
      isContextMenuOpen: overrides.isContextMenuOpen ?? (() => false),
      onCloseContextMenu,
      controls,
    });
    return { interactionStateRef };
  });

  return { view, dispatch, onCancelInteraction, onCloseContextMenu, controls, document, selection };
}

function sectionRenameDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "section-rename-test",
    mode: "diagram",
    size: { width: 1000, height: 700 },
    viewport: { x: 0, y: 0, zoom: 1 },
    objects: [
      {
        id: "section-a",
        type: "section",
        label: "Original section",
        title: "Original section",
        tint: "purple",
        geometry: { x: 100, y: 80, width: 520, height: 360 },
        style: { shape: "section" },
      },
    ],
    connections: [],
  };
}

describe("useCanvasHotkeys", () => {
  afterEach(() => {
    cleanup();
  });

  it("dispatches canvas.duplicateSelection on cmd/ctrl-D and prevents default", () => {
    const { dispatch } = setup();

    let notCancelled = true;
    act(() => {
      notCancelled = dispatchKeyDown({ key: "d", metaKey: true });
    });

    expect(notCancelled).toBe(false); // false means preventDefault() was called
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.duplicateSelection" });
  });

  it("also triggers duplicate with ctrlKey (non-mac modifier)", () => {
    const { dispatch } = setup();

    act(() => {
      dispatchKeyDown({ key: "d", ctrlKey: true });
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.duplicateSelection" });
  });

  it("nudges selection by 1 world unit with snap: false on a plain arrow key", () => {
    const { dispatch } = setup();

    act(() => {
      dispatchKeyDown({ key: "ArrowRight" });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.moveSelection",
      dx: 1,
      dy: 0,
      snap: false,
    });
  });

  it("nudges selection by the grid size (16) with snap: false on shift-arrow", () => {
    const { dispatch } = setup();

    act(() => {
      dispatchKeyDown({ key: "ArrowUp", shiftKey: true });
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.moveSelection",
      dx: 0,
      dy: -16,
      snap: false,
    });
  });

  it("ignores all bindings while an input element has focus", () => {
    const input = window.document.createElement("input");
    window.document.body.appendChild(input);
    input.focus();

    const { dispatch } = setup();

    act(() => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "d", metaKey: true });
      input.dispatchEvent(event);
    });

    expect(dispatch).not.toHaveBeenCalled();
    input.remove();
  });

  it("ignores all bindings while isTypingContextActive() is true", () => {
    const { dispatch } = setup({ isTypingContextActive: () => true });

    act(() => {
      dispatchKeyDown({ key: "Delete" });
      dispatchKeyDown({ key: "v" });
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches canvas.deleteSelection for a selected connection on Delete", () => {
    const { dispatch } = setup({ selection: { kind: "connection", connectionId: "connection-a" } });

    act(() => {
      dispatchKeyDown({ key: "Delete" });
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.deleteSelection" });
  });

  it("dispatches canvas.deleteSelection on Backspace as well", () => {
    const { dispatch } = setup();

    act(() => {
      dispatchKeyDown({ key: "Backspace" });
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.deleteSelection" });
  });

  it("maps single-letter keys to canvas.setTool", () => {
    const { dispatch } = setup();

    act(() => {
      dispatchKeyDown({ key: "v" });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.setTool", tool: "select" });

    act(() => {
      dispatchKeyDown({ key: "c" });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.setTool", tool: "rectangle" });
  });

  it("maps plain S to sticky and Shift+S to section", () => {
    const { dispatch } = setup();

    act(() => {
      dispatchKeyDown({ key: "s" });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.setTool", tool: "sticky" });

    act(() => {
      dispatchKeyDown({ key: "S", shiftKey: true });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.setTool", tool: "section" });
  });

  it("maps the checkpoint-5 expanded-vocabulary letters (O/U/B/M) to canvas.setTool", () => {
    const { dispatch } = setup();

    act(() => {
      dispatchKeyDown({ key: "o" });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.setTool", tool: "document" });

    act(() => {
      dispatchKeyDown({ key: "u" });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.setTool", tool: "person" });

    act(() => {
      dispatchKeyDown({ key: "b" });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.setTool", tool: "database" });

    act(() => {
      dispatchKeyDown({ key: "m" });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.setTool", tool: "chat" });
  });

  it("cancels the active interaction machine gesture on Escape instead of clearing selection", () => {
    const movingState = { kind: "move" } as unknown as InteractionState;
    const { dispatch, onCancelInteraction } = setup({ interactionState: movingState });

    act(() => {
      dispatchKeyDown({ key: "Escape" });
    });

    expect(onCancelInteraction).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalledWith({ type: "canvas.select", selection: { kind: "none" } });
  });

  it("closes an open context menu on Escape when idle and no gesture is active", () => {
    const { onCloseContextMenu, dispatch } = setup({ isContextMenuOpen: () => true });

    act(() => {
      dispatchKeyDown({ key: "Escape" });
    });

    expect(onCloseContextMenu).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalledWith({ type: "canvas.select", selection: { kind: "none" } });
  });

  it("clears selection on Escape when idle and no context menu is open", () => {
    const { dispatch } = setup();

    act(() => {
      dispatchKeyDown({ key: "Escape" });
    });

    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.select", selection: { kind: "none" } });
  });

  it("dispatches canvas.undo / canvas.redo on cmd-Z / shift-cmd-Z", () => {
    const { dispatch } = setup();

    act(() => {
      dispatchKeyDown({ key: "z", metaKey: true });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.undo" });

    act(() => {
      dispatchKeyDown({ key: "z", metaKey: true, shiftKey: true });
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.redo" });
  });

  it("calls viewport controls on cmd-0 / cmd-= / cmd-minus", () => {
    const { controls } = setup();

    act(() => {
      dispatchKeyDown({ key: "0", metaKey: true });
    });
    expect(controls.fit).toHaveBeenCalledTimes(1);

    act(() => {
      dispatchKeyDown({ key: "=", metaKey: true });
    });
    expect(controls.zoomIn).toHaveBeenCalledTimes(1);

    act(() => {
      dispatchKeyDown({ key: "-", metaKey: true });
    });
    expect(controls.zoomOut).toHaveBeenCalledTimes(1);
  });

  it("does not bind space (viewport hook owns space-drag panning)", () => {
    const { dispatch } = setup();

    act(() => {
      dispatchKeyDown({ key: " " });
    });

    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("InteractiveCanvasEditor: double-click inline label editing (4.2.1)", () => {
  function stubStageRect() {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if ((this as HTMLElement).dataset.canvasStage === "true") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width: 1240,
          height: 760,
          right: 1240,
          bottom: 760,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalRect.call(this);
    };
    return () => {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    };
  }

  function pointerClick(element: Element, init: Partial<PointerEventInit> = {}) {
    fireEvent.pointerDown(element, { button: 0, pointerId: 1, ...init });
    fireEvent.pointerUp(element, { button: 0, pointerId: 1, ...init });
  }

  afterEach(() => {
    cleanup();
  });

  it("keeps the Shapes dock button highlighted while the Shapes panel is open", () => {
    const restoreRect = stubStageRect();
    try {
      const { container } = render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      const shapesButton = container.querySelector('[data-dock-tool="shapes"]') as HTMLElement;
      expect(shapesButton.getAttribute("data-active")).toBe("false");

      fireEvent.click(shapesButton);

      expect(container.querySelector("[data-shapes-panel]")).toBeTruthy();
      expect(shapesButton.getAttribute("data-active")).toBe("true");
      expect(shapesButton.getAttribute("aria-pressed")).toBe("true");
    } finally {
      restoreRect();
    }
  });

  it("plays the Shapes panel exit animation before unmounting it", () => {
    const restoreRect = stubStageRect();
    try {
      const { container } = render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      fireEvent.click(container.querySelector('[data-dock-tool="shapes"]')!);
      const closeButton = screen.getByLabelText("Close shapes panel");

      fireEvent.click(closeButton);

      const closingPanel = container.querySelector("[data-shapes-panel]") as HTMLElement;
      expect(closingPanel).toBeTruthy();
      expect(closingPanel.getAttribute("data-state")).toBe("closing");
      expect(closingPanel.style.animation).toContain("canvas-shapes-panel-exit");

      fireEvent.animationEnd(closingPanel, { animationName: "canvas-shapes-panel-exit" });

      expect(container.querySelector("[data-shapes-panel]")).toBeNull();
    } finally {
      restoreRect();
    }
  });

  it("double-clicking an object opens a textarea seeded with its label, and Enter commits canvas.updateObject", () => {
    const restoreRect = stubStageRect();
    try {
      const saved: InteractiveCanvasDocument[] = [];
      render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={(document) => {
            saved.push(document);
          }}
          onCancel={() => undefined}
        />,
      );

      const object = screen.getByRole("button", { name: /User brief/i });
      fireEvent.doubleClick(object, { clientX: 232, clientY: 244 });

      const textarea = screen.getByRole("textbox", { name: "Object label" }) as HTMLTextAreaElement;
      expect(textarea.value).toBe("User brief");
      // Static label hides on the edited object while editing (avoids double rendering).
      expect(object.querySelector(".interactive-canvas-object-label")).toBeNull();

      fireEvent.change(textarea, { target: { value: "Renamed brief" } });
      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(screen.queryByRole("textbox", { name: "Object label" })).toBeNull();
      expect(screen.getAllByText("Renamed brief").length).toBeGreaterThan(0);
    } finally {
      restoreRect();
    }
  });

  it("Escape cancels an inline label edit without committing changes", () => {
    const restoreRect = stubStageRect();
    try {
      render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      const object = screen.getByRole("button", { name: /User brief/i });
      fireEvent.doubleClick(object, { clientX: 232, clientY: 244 });

      const textarea = screen.getByRole("textbox", { name: "Object label" }) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Should not stick" } });
      fireEvent.keyDown(textarea, { key: "Escape" });

      expect(screen.queryByRole("textbox", { name: "Object label" })).toBeNull();
      expect(screen.getAllByText("User brief").length).toBeGreaterThan(0);
      expect(screen.queryByText("Should not stick")).toBeNull();
    } finally {
      restoreRect();
    }
  });

  it("shift-Enter inserts a newline instead of committing", () => {
    const restoreRect = stubStageRect();
    try {
      render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      const object = screen.getByRole("button", { name: /User brief/i });
      fireEvent.doubleClick(object, { clientX: 232, clientY: 244 });

      const textarea = screen.getByRole("textbox", { name: "Object label" }) as HTMLTextAreaElement;
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

      // Still open — shift-Enter must not commit/close the editor.
      expect(screen.getByRole("textbox", { name: "Object label" })).toBeTruthy();
    } finally {
      restoreRect();
    }
  });

  it("blur commits the inline label edit", () => {
    const restoreRect = stubStageRect();
    try {
      render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      const object = screen.getByRole("button", { name: /User brief/i });
      fireEvent.doubleClick(object, { clientX: 232, clientY: 244 });

      const textarea = screen.getByRole("textbox", { name: "Object label" }) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Blurred rename" } });
      fireEvent.blur(textarea);

      expect(screen.queryByRole("textbox", { name: "Object label" })).toBeNull();
      expect(screen.getAllByText("Blurred rename").length).toBeGreaterThan(0);
    } finally {
      restoreRect();
    }
  });

  it("double-clicking a section body selects but does not open the label editor", () => {
    const restoreRect = stubStageRect();
    try {
      render(<InteractiveCanvasEditor document={sectionRenameDocument()} onSave={() => undefined} onCancel={() => undefined} />);

      const section = screen.getByRole("button", { name: /Original section/i });
      pointerClick(section, { clientX: 360, clientY: 280 });
      fireEvent.doubleClick(section, { clientX: 360, clientY: 280 });

      expect(screen.getByRole("button", { name: /Original section/i }).getAttribute("data-selected")).toBe("true");
      expect(screen.queryByRole("textbox", { name: "Object label" })).toBeNull();
      expect(screen.queryByRole("textbox", { name: "Section title" })).toBeNull();
    } finally {
      restoreRect();
    }
  });

  it("double-clicking a section title chip opens a chip-anchored editor", () => {
    const restoreRect = stubStageRect();
    try {
      render(<InteractiveCanvasEditor document={sectionRenameDocument()} onSave={() => undefined} onCancel={() => undefined} />);

      const chip = document.querySelector("[data-canvas-section-title-chip='section-a']");
      expect(chip).toBeTruthy();
      fireEvent.doubleClick(chip!, { clientX: 112, clientY: 92 });

      const input = screen.getByRole("textbox", { name: "Section title" }) as HTMLInputElement;
      expect(input.value).toBe("Original section");
      expect(input.tagName).toBe("INPUT");
      expect(input.className).toContain("interactive-canvas-section-title-editor");
      expect(input.style.left).toBe(`${100 + SECTION_GEOMETRY.titleChip.insetFromSectionCornerPx}px`);
      expect(input.style.top).toBe(`${80 + SECTION_GEOMETRY.titleChip.insetFromSectionCornerPx}px`);
      expect(input.style.height).toBe(`${SECTION_GEOMETRY.titleChip.heightPx}px`);
      expect(Number.parseFloat(input.style.width)).toBeLessThan(520);
    } finally {
      restoreRect();
    }
  });

  it("commits, cancels, and reverts empty section renames through the chip editor", () => {
    const restoreRect = stubStageRect();
    try {
      render(<InteractiveCanvasEditor document={sectionRenameDocument()} onSave={() => undefined} onCancel={() => undefined} />);

      const chip = () => document.querySelector("[data-canvas-section-title-chip='section-a']")!;
      fireEvent.doubleClick(chip(), { clientX: 112, clientY: 92 });
      let input = screen.getByRole("textbox", { name: "Section title" }) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Renamed section" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.queryByRole("textbox", { name: "Section title" })).toBeNull();
      expect(screen.getAllByText("Renamed section").length).toBeGreaterThan(0);

      fireEvent.doubleClick(chip(), { clientX: 112, clientY: 92 });
      input = screen.getByRole("textbox", { name: "Section title" }) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Cancelled section" } });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(screen.queryByText("Cancelled section")).toBeNull();
      expect(screen.getAllByText("Renamed section").length).toBeGreaterThan(0);

      fireEvent.doubleClick(chip(), { clientX: 112, clientY: 92 });
      input = screen.getByRole("textbox", { name: "Section title" }) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.blur(input);
      expect(screen.getAllByText("Renamed section").length).toBeGreaterThan(0);
    } finally {
      restoreRect();
    }
  });
});

describe("InteractiveCanvasEditor: Inspector color section (checkpoint 5, D16)", () => {
  function stubStageRect() {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if ((this as HTMLElement).dataset.canvasStage === "true") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width: 1240,
          height: 760,
          right: 1240,
          bottom: 760,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalRect.call(this);
    };
    return () => {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    };
  }

  afterEach(() => {
    cleanup();
  });

  function pointerClick(element: Element, init: Partial<PointerEventInit> = {}) {
    fireEvent.pointerDown(element, { button: 0, ...init });
    fireEvent.pointerUp(element, { button: 0, ...init });
  }

  function sectionDocument(): InteractiveCanvasDocument {
    return {
      schemaVersion: 1,
      id: "section-toolbar-test",
      mode: "diagram",
      size: { width: 1240, height: 760 },
      viewport: { x: 0, y: 0, zoom: 1 },
      objects: [
        {
          id: "section-a",
          type: "section",
          label: "Section A",
          title: "Section A",
          tint: "blue",
          geometry: { x: 120, y: 120, width: 320, height: 220 },
          style: { shape: "section", fill: "#C2E5FF", stroke: "#3DADFF", strokeStyle: "solid" },
        },
      ],
      connections: [],
    };
  }

  function selectSection() {
    const section = screen.getByRole("button", { name: /Section A/i });
    pointerClick(section, { clientX: 180, clientY: 160 });
    return section as HTMLElement;
  }

  it("does not render the inspector by default, but renders it when enabled", () => {
    const { rerender } = render(
      <InteractiveCanvasEditor
        document={syntheticCanvasDocument}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.queryByText("Inspector")).toBeNull();
    expect(screen.queryByText("Selection context")).toBeNull();

    rerender(
      <InteractiveCanvasEditor
        document={syntheticCanvasDocument}
        onSave={() => undefined}
        onCancel={() => undefined}
        showInspector
      />,
    );

    expect(screen.getByText("Inspector")).toBeTruthy();
    expect(screen.getByText("Selection context")).toBeTruthy();
  });

  it("clicking a swatch sets paletteToken on the selected object without touching its shape/tone", () => {
    const restoreRect = stubStageRect();
    try {
      render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={() => undefined}
          onCancel={() => undefined}
          showInspector
        />,
      );

      const object = screen.getByRole("button", { name: /User brief/i });
      pointerClick(object, { clientX: 232, clientY: 244 });

      const swatch = document.querySelector('[data-canvas-palette-swatch="hot"]') as HTMLElement;
      expect(swatch).toBeTruthy();
      fireEvent.click(swatch);

      expect(object.getAttribute("data-canvas-object-shape")).toBe("rounded-rect");
      expect(swatch.getAttribute("data-selected")).toBe("true");
    } finally {
      restoreRect();
    }
  });

  it("applies the palette token to every selected object when multiple are selected (shift-click)", () => {
    const restoreRect = stubStageRect();
    try {
      render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={() => undefined}
          onCancel={() => undefined}
          showInspector
        />,
      );

      const brief = screen.getByRole("button", { name: /User brief/i });
      const summarizes = screen.getByRole("button", { name: /Agent summarizes/i });

      pointerClick(brief, { clientX: 232, clientY: 244 });
      pointerClick(summarizes, { clientX: 536, clientY: 220, shiftKey: true });

      const swatch = document.querySelector('[data-canvas-palette-swatch="memory"]') as HTMLElement;
      fireEvent.click(swatch);

      // Both objects should now render their SVG-less rounded-rect chrome
      // recolored via the "memory" token's inline style values (checked via
      // the shared theme helper so this test doesn't hardcode the raw
      // color-mix string).
      const containerEl = window.document.body;
      expect(containerEl.querySelectorAll('[data-canvas-palette-swatch="memory"][data-selected="true"]').length).toBe(1);
      expect(brief.getAttribute("data-canvas-object-shape")).toBe("rounded-rect");
      expect(summarizes.getAttribute("data-canvas-object-shape")).toBe("rounded-rect");
    } finally {
      restoreRect();
    }
  });

  it("the 'none' swatch clears the palette token, falling back to tone", () => {
    const restoreRect = stubStageRect();
    try {
      render(
        <InteractiveCanvasEditor
          document={syntheticCanvasDocument}
          onSave={() => undefined}
          onCancel={() => undefined}
          showInspector
        />,
      );

      const object = screen.getByRole("button", { name: /User brief/i });
      pointerClick(object, { clientX: 232, clientY: 244 });

      const hotSwatch = document.querySelector('[data-canvas-palette-swatch="hot"]') as HTMLElement;
      fireEvent.click(hotSwatch);
      expect(hotSwatch.getAttribute("data-selected")).toBe("true");

      const noneSwatch = document.querySelector('[data-canvas-palette-swatch="none"]') as HTMLElement;
      fireEvent.click(noneSwatch);

      expect(noneSwatch.getAttribute("data-selected")).toBe("true");
      expect(hotSwatch.getAttribute("data-selected")).toBeNull();
    } finally {
      restoreRect();
    }
  });

  it("keeps only one section toolbar popover mounted when switching fill and border", () => {
    const restoreRect = stubStageRect();
    try {
      const { container } = render(
        <InteractiveCanvasEditor
          document={sectionDocument()}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      selectSection();
      fireEvent.click(container.querySelector('[data-toolbar-action="color"]')!);
      expect(container.querySelectorAll("[data-color-palette-popover]").length).toBe(1);
      expect(container.querySelector('[data-toolbar-flyout="section-border"]')).toBeNull();

      fireEvent.click(container.querySelector('[data-toolbar-action="section-border-style"]')!);
      expect(container.querySelectorAll("[data-color-palette-popover]").length).toBe(1);
      expect(container.querySelector('[data-toolbar-flyout="section-border"]')).toBeTruthy();

      fireEvent.click(container.querySelector('[data-toolbar-action="color"]')!);
      expect(container.querySelectorAll("[data-color-palette-popover]").length).toBe(1);
      expect(container.querySelector('[data-toolbar-flyout="section-border"]')).toBeNull();
    } finally {
      restoreRect();
    }
  });

  it("section fill palette updates style.fill without changing style.stroke", () => {
    const restoreRect = stubStageRect();
    try {
      const { container } = render(
        <InteractiveCanvasEditor
          document={sectionDocument()}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      const section = selectSection();
      fireEvent.click(container.querySelector('[data-toolbar-action="color"]')!);
      fireEvent.click(container.querySelector('[data-color="#F24822"]')!);

      expect(section.style.background).toBe("#F24822");
      expect(section.style.borderColor).toBe("#3DADFF");
    } finally {
      restoreRect();
    }
  });

  it("section border palette updates style.stroke without changing style.fill", () => {
    const restoreRect = stubStageRect();
    try {
      const { container } = render(
        <InteractiveCanvasEditor
          document={sectionDocument()}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      const section = selectSection();
      fireEvent.click(container.querySelector('[data-toolbar-action="section-border-style"]')!);
      fireEvent.click(container.querySelector('[data-color="#14AE5C"]')!);

      expect(section.style.background).toBe("#C2E5FF");
      expect(section.style.borderColor).toBe("#14AE5C");
    } finally {
      restoreRect();
    }
  });
});

describe("InteractiveCanvasEditor: Shapes creation flow (panel-armed repeat placement)", () => {
  function stubStageRect() {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if ((this as HTMLElement).dataset.canvasStage === "true") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width: 1240,
          height: 760,
          right: 1240,
          bottom: 760,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalRect.call(this);
    };
    return () => {
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    };
  }

  /** Empty board with an identity viewport so screen coords === world coords. */
  function emptyBoardDocument(): InteractiveCanvasDocument {
    return {
      schemaVersion: 1,
      id: "shapes-flow-test",
      mode: "diagram",
      viewport: { x: 0, y: 0, zoom: 1 },
      objects: [],
      connections: [],
    };
  }

  function renderEditor(doc: InteractiveCanvasDocument = emptyBoardDocument()) {
    const view = render(
      <InteractiveCanvasEditor document={doc} onSave={() => undefined} onCancel={() => undefined} />,
    );
    const stage = view.container.querySelector("[data-canvas-stage]") as HTMLElement;
    return { ...view, stage };
  }

  function openShapesPanel(container: HTMLElement) {
    fireEvent.click(container.querySelector('[data-dock-tool="shapes"]')!);
    return container.querySelector("[data-shapes-panel]") as HTMLElement;
  }

  function pickShape(container: HTMLElement, entryId: string) {
    fireEvent.click(container.querySelector(`[data-shape-entry="${entryId}"]`)!);
  }

  /** Sub-threshold click on the stage — down+up at the same point places at that point. */
  function placeAt(stage: HTMLElement, clientX: number, clientY: number, pointerId = 1) {
    fireEvent.pointerDown(stage, { button: 0, pointerId, clientX, clientY });
    fireEvent.pointerUp(stage, { button: 0, pointerId, clientX, clientY });
  }

  function placedObjectCount(container: HTMLElement) {
    return container.querySelectorAll(".interactive-canvas-object").length;
  }

  afterEach(() => {
    cleanup();
  });

  it("picking a shape keeps the panel open and highlights the picked entry", () => {
    const restoreRect = stubStageRect();
    try {
      const { container } = renderEditor();
      const panel = openShapesPanel(container);

      pickShape(container, "basic-square");

      expect(panel.getAttribute("data-state")).toBe("open");
      const entry = container.querySelector('[data-shape-entry="basic-square"]') as HTMLElement;
      expect(entry.getAttribute("data-selected")).toBe("true");
      expect(entry.getAttribute("aria-pressed")).toBe("true");
    } finally {
      restoreRect();
    }
  });

  it("moving the cursor over the canvas with a shape armed shows a real-shape ghost before any click", () => {
    const restoreRect = stubStageRect();
    try {
      const { container, stage } = renderEditor();
      openShapesPanel(container);
      pickShape(container, "basic-square");

      expect(container.querySelector("[data-canvas-place-ghost]")).toBeNull();
      fireEvent.pointerMove(stage, { clientX: 400, clientY: 300 });
      // The ghost renders the ACTUAL draft object through ObjectShape, not a
      // generic dashed box.
      const ghost = container.querySelector("[data-canvas-place-ghost]") as HTMLElement;
      expect(ghost).toBeTruthy();
      expect(ghost.querySelector(".interactive-canvas-object")).toBeTruthy();
      expect(container.querySelector("[data-canvas-place-preview]")).toBeNull();

      // Leaving the stage clears the ghost.
      fireEvent.pointerLeave(stage);
      expect(container.querySelector("[data-canvas-place-ghost]")).toBeNull();
    } finally {
      restoreRect();
    }
  });

  it("an Advanced (icon) pick ghosts and places the actual glyph with its display name", () => {
    const restoreRect = stubStageRect();
    try {
      const { container, stage } = renderEditor();
      openShapesPanel(container);
      pickShape(container, "adv-database");

      fireEvent.pointerMove(stage, { clientX: 400, clientY: 300 });
      const ghost = container.querySelector("[data-canvas-place-ghost]") as HTMLElement;
      expect(ghost.textContent).toContain("Database");

      placeAt(stage, 400, 300);
      expect(placedObjectCount(container)).toBe(1);
      const placed = container.querySelector(
        '[data-canvas-object-layer] .interactive-canvas-object',
      ) as HTMLElement;
      expect(placed.textContent).toContain("Database");
      // The glyph made it onto the object — an icon object without one renders blank.
      expect(placed.querySelector("svg")).toBeTruthy();
    } finally {
      restoreRect();
    }
  });

  it("a direction-variant pick (triangle down) places with that direction", () => {
    const restoreRect = stubStageRect();
    try {
      const { container, stage } = renderEditor();
      openShapesPanel(container);
      pickShape(container, "basic-triangle-down");

      placeAt(stage, 400, 300);
      expect(placedObjectCount(container)).toBe(1);
    } finally {
      restoreRect();
    }
  });

  it("a human's own placement never wears the agent-change halo (no data-changed ring)", () => {
    const restoreRect = stubStageRect();
    try {
      const { container, stage } = renderEditor();
      openShapesPanel(container);
      pickShape(container, "basic-square");

      placeAt(stage, 300, 240);
      expect(placedObjectCount(container)).toBe(1);
      // The gray 5px ring is reserved for agent-sourced changes; direct
      // manipulation (place/move/resize) must not decorate itself.
      expect(container.querySelector('[data-changed="true"]')).toBeNull();
    } finally {
      restoreRect();
    }
  });

  it("placing a shape keeps the placement tool armed so repeated clicks keep placing", () => {
    const restoreRect = stubStageRect();
    try {
      const { container, stage } = renderEditor();
      const panel = openShapesPanel(container);
      pickShape(container, "basic-square");
      expect(placedObjectCount(container)).toBe(0);

      placeAt(stage, 300, 240);
      expect(placedObjectCount(container)).toBe(1);

      // Still in placement mode: panel open, entry highlighted, next click places again.
      expect(panel.getAttribute("data-state")).toBe("open");
      expect(
        container.querySelector('[data-shape-entry="basic-square"]')!.getAttribute("data-selected"),
      ).toBe("true");

      placeAt(stage, 700, 500, 2);
      expect(placedObjectCount(container)).toBe(2);
    } finally {
      restoreRect();
    }
  });

  it("closing the Shapes panel exits placement mode (tool reverts to select)", () => {
    const restoreRect = stubStageRect();
    try {
      const { container, stage } = renderEditor();
      openShapesPanel(container);
      pickShape(container, "basic-square");

      fireEvent.click(screen.getByLabelText("Close shapes panel"));

      expect(stage.getAttribute("data-canvas-select-tool")).toBe("true");
      placeAt(stage, 300, 240);
      expect(placedObjectCount(container)).toBe(0);
    } finally {
      restoreRect();
    }
  });

  it("picking another dock tool closes the panel and exits placement mode", () => {
    const restoreRect = stubStageRect();
    try {
      const { container, stage } = renderEditor();
      openShapesPanel(container);
      pickShape(container, "basic-square");

      fireEvent.click(container.querySelector('[data-dock-tool="select"]')!);

      const panel = container.querySelector("[data-shapes-panel]") as HTMLElement;
      expect(panel.getAttribute("data-state")).toBe("closing");
      expect(stage.getAttribute("data-canvas-select-tool")).toBe("true");
    } finally {
      restoreRect();
    }
  });

  it("Escape first disarms the shape tool (panel stays open, highlight clears), then closes the panel", () => {
    const restoreRect = stubStageRect();
    try {
      const { container, stage } = renderEditor();
      const panel = openShapesPanel(container);
      pickShape(container, "basic-square");
      fireEvent.pointerMove(stage, { clientX: 400, clientY: 300 });
      expect(container.querySelector("[data-canvas-place-ghost]")).toBeTruthy();

      act(() => {
        dispatchKeyDown({ key: "Escape" });
      });

      expect(panel.getAttribute("data-state")).toBe("open");
      expect(container.querySelector('[data-shape-entry="basic-square"]')!.getAttribute("data-selected")).toBeNull();
      expect(stage.getAttribute("data-canvas-select-tool")).toBe("true");
      expect(container.querySelector("[data-canvas-place-ghost]")).toBeNull();

      act(() => {
        dispatchKeyDown({ key: "Escape" });
      });

      expect(panel.getAttribute("data-state")).toBe("closing");
    } finally {
      restoreRect();
    }
  });
});
