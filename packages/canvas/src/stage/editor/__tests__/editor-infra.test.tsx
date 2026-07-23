import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { InteractiveCanvasDocument } from "../../../state/schema";
import { worldToScreen } from "../../viewport";
import {
  InteractiveCanvasEditor,
  type InteractiveCanvasEditorState,
} from "../InteractiveCanvasEditor";

const STAGE_WIDTH = 800;
const STAGE_HEIGHT = 600;

function editorDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "editor-infra-test",
    mode: "diagram",
    size: { width: STAGE_WIDTH, height: STAGE_HEIGHT },
    objects: [
      {
        id: "a",
        type: "process",
        text: "First",
        geometry: { x: 120, y: 140, width: 120, height: 80 },
      },
      {
        id: "b",
        type: "process",
        text: "Second",
        geometry: { x: 420, y: 320, width: 120, height: 80 },
      },
    ],
    connections: [],
  };
}

function stubStageRect() {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if ((this as HTMLElement).dataset.canvasStage === "true") {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        right: STAGE_WIDTH,
        bottom: STAGE_HEIGHT,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return originalRect.call(this);
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  };
}

function latestState(states: InteractiveCanvasEditorState[]): InteractiveCanvasEditorState {
  const state = states.at(-1);
  if (!state) throw new Error("Expected the editor state callback to fire");
  return state;
}

function objectCenter(
  document: InteractiveCanvasDocument,
  objectId: string,
  state: InteractiveCanvasEditorState,
) {
  const object = document.objects.find((item) => item.id === objectId);
  if (!object) throw new Error(`Missing object ${objectId}`);
  return worldToScreen(state.viewport, {
    x: object.geometry.x + object.geometry.width / 2,
    y: object.geometry.y + object.geometry.height / 2,
  });
}

function pointerClick(element: Element, point: { x: number; y: number }, pointerId: number) {
  fireEvent.pointerDown(element, {
    button: 0,
    pointerId,
    clientX: point.x,
    clientY: point.y,
  });
  fireEvent.pointerUp(element, {
    button: 0,
    pointerId,
    clientX: point.x,
    clientY: point.y,
  });
}

function dispatchKeyDown(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

describe("InteractiveCanvasEditor infrastructure", () => {
  afterEach(() => {
    cleanup();
  });

  it("locks document interactions while preserving pan/zoom, then restores select editing", () => {
    const restoreRect = stubStageRect();
    try {
      const document = editorDocument();
      const states: InteractiveCanvasEditorState[] = [];
      const onEditorStateChange = (state: InteractiveCanvasEditorState) => states.push(state);
      const view = render(
        <InteractiveCanvasEditor
          document={document}
          onEditorStateChange={onEditorStateChange}
        />,
      );

      const stage = view.container.querySelector("[data-canvas-stage]") as HTMLElement;
      const firstObject = () =>
        view.container.querySelector('[data-canvas-object-layer] [data-canvas-object-id="a"]')!;
      const secondObject = () =>
        view.container.querySelector('[data-canvas-object-layer] [data-canvas-object-id="b"]')!;

      pointerClick(firstObject(), objectCenter(document, "a", latestState(states)), 1);
      expect(latestState(states).selection).toEqual({ kind: "objects", objectIds: ["a"] });
      expect(view.container.querySelector("[data-selection-toolbar]")).toBeTruthy();

      fireEvent.click(view.container.querySelector('[data-toolbar-action="color"]')!);
      expect(view.container.querySelector("[data-canvas-color]")).toBeTruthy();

      view.rerender(
        <InteractiveCanvasEditor
          document={document}
          cameraOnly
          onEditorStateChange={onEditorStateChange}
        />,
      );

      expect(latestState(states).tool).toBe("hand");
      expect(view.container.querySelector("[data-selection-toolbar]")).toBeNull();
      pointerClick(secondObject(), objectCenter(document, "b", latestState(states)), 2);
      act(() => dispatchKeyDown({ key: "Delete" }));
      expect(latestState(states).selection).toEqual({ kind: "objects", objectIds: ["a"] });
      expect(view.container.querySelectorAll("[data-canvas-object-layer] [data-canvas-object-id]")).toHaveLength(2);

      const beforePan = latestState(states).viewport;
      fireEvent.pointerDown(stage, { button: 0, pointerId: 3, clientX: 400, clientY: 300 });
      fireEvent.pointerMove(stage, { pointerId: 3, clientX: 460, clientY: 340 });
      fireEvent.pointerUp(stage, { button: 0, pointerId: 3, clientX: 460, clientY: 340 });
      const afterPan = latestState(states).viewport;
      expect(afterPan.x).not.toBe(beforePan.x);
      expect(afterPan.y).not.toBe(beforePan.y);

      const beforeZoom = afterPan.zoom;
      act(() => dispatchKeyDown({ key: "=", metaKey: true }));
      expect(latestState(states).viewport.zoom).toBeGreaterThan(beforeZoom);

      view.rerender(
        <InteractiveCanvasEditor
          document={document}
          cameraOnly={false}
          onEditorStateChange={onEditorStateChange}
        />,
      );

      expect(latestState(states).tool).toBe("select");
      expect(view.container.querySelector("[data-selection-toolbar]")).toBeTruthy();
      expect(view.container.querySelector("[data-canvas-color]")).toBeNull();
      pointerClick(secondObject(), objectCenter(document, "b", latestState(states)), 4);
      expect(latestState(states).selection).toEqual({ kind: "objects", objectIds: ["b"] });
    } finally {
      restoreRect();
    }
  });

  it("appends caller overlays after the editor feedback in each stage slot", () => {
    const { container } = render(
      <InteractiveCanvasEditor
        document={editorDocument()}
        worldOverlay={<span data-testid="world-extra" />}
        screenOverlay={<span data-testid="screen-extra" />}
      />,
    );

    const worldExtra = container.querySelector('[data-testid="world-extra"]')!;
    const screenExtra = container.querySelector('[data-testid="screen-extra"]')!;
    const worldLayer = worldExtra.closest("[data-canvas-world-overlay-layer]")!;
    const screenLayer = screenExtra.closest(".interactive-canvas-overlay")!;

    expect(worldLayer.lastElementChild).toBe(worldExtra);
    expect(screenLayer.lastElementChild).toBe(screenExtra);
  });

  it("reports tool-only changes through onEditorStateChange", () => {
    const states: InteractiveCanvasEditorState[] = [];
    const { container } = render(
      <InteractiveCanvasEditor
        document={editorDocument()}
        onEditorStateChange={(state) => states.push(state)}
      />,
    );

    expect(latestState(states).tool).toBe("select");
    states.length = 0;
    fireEvent.click(container.querySelector('[data-dock-tool="hand"]')!);

    expect(states).toHaveLength(1);
    expect(latestState(states).tool).toBe("hand");
  });
});
