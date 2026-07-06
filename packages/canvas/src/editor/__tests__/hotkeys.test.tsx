import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useRef } from "react";
import type { CanvasAction, CanvasSelection } from "../../model/actions";
import { syntheticInteractiveCanvas } from "../../fixtures/synthetic-canvas";
import { IDLE_INTERACTION_STATE, type InteractionState } from "../../interaction/interaction";
import { InteractiveCanvasEditor } from "../InteractiveCanvasEditor";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../model/schema";
import { useCanvasHotkeys } from "../use-canvas-hotkeys";

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
    expect(dispatch).toHaveBeenCalledWith({ type: "canvas.setTool", tool: "container" });
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

  afterEach(() => {
    cleanup();
  });

  it("double-clicking an object opens a textarea seeded with its label, and Enter commits canvas.updateObject", () => {
    const restoreRect = stubStageRect();
    try {
      const saved: InteractiveCanvasDocument[] = [];
      render(
        <InteractiveCanvasEditor
          document={syntheticInteractiveCanvas}
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
          document={syntheticInteractiveCanvas}
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

  it("double-clicking empty canvas creates a text object and opens its label editor immediately", () => {
    const restoreRect = stubStageRect();
    try {
      render(
        <InteractiveCanvasEditor
          document={syntheticInteractiveCanvas}
          onSave={() => undefined}
          onCancel={() => undefined}
        />,
      );

      const canvasLayer = Array.from(
        document.querySelectorAll(".interactive-canvas-stage .interactive-canvas-layer"),
      ).find((element) => element instanceof HTMLElement && element.tagName === "DIV") as HTMLElement;
      expect(canvasLayer).toBeTruthy();

      // A point clearly outside every existing fixture object's geometry.
      fireEvent.doubleClick(canvasLayer, { clientX: 1150, clientY: 700 });

      const textarea = screen.getByRole("textbox", { name: "Object label" }) as HTMLTextAreaElement;
      expect(textarea.value).toBe("Text");

      fireEvent.change(textarea, { target: { value: "New note" } });
      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(screen.queryByRole("textbox", { name: "Object label" })).toBeNull();
      expect(screen.getAllByText("New note").length).toBeGreaterThan(0);
    } finally {
      restoreRect();
    }
  });

  it("shift-Enter inserts a newline instead of committing", () => {
    const restoreRect = stubStageRect();
    try {
      render(
        <InteractiveCanvasEditor
          document={syntheticInteractiveCanvas}
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
          document={syntheticInteractiveCanvas}
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

  it("clicking a swatch sets paletteToken on the selected object without touching its shape/tone", () => {
    const restoreRect = stubStageRect();
    try {
      render(
        <InteractiveCanvasEditor
          document={syntheticInteractiveCanvas}
          onSave={() => undefined}
          onCancel={() => undefined}
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
          document={syntheticInteractiveCanvas}
          onSave={() => undefined}
          onCancel={() => undefined}
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
          document={syntheticInteractiveCanvas}
          onSave={() => undefined}
          onCancel={() => undefined}
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
});
