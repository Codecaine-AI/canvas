/**
 * Studio places a section with the same color chooser as place_section
 * (board/section-colors.ts): a section dropped into a gray section never
 * comes out gray, so the nest reads as a level.
 */
import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { InteractiveCanvasDocument } from "../../../state/schema";
import { worldToScreen } from "../../viewport";
import {
  InteractiveCanvasEditor,
  type InteractiveCanvasEditorState,
} from "../InteractiveCanvasEditor";

const STAGE_WIDTH = 1200;
const STAGE_HEIGHT = 900;

function boardDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "section-placement-color",
    mode: "diagram",
    objects: [
      { id: "page", type: "section", text: "Page", color: "white", parentId: null, geometry: { x: 0, y: 0, width: 1200, height: 900 } },
      { id: "pack", type: "section", text: "Pack", color: "gray", parentId: "page", geometry: { x: 40, y: 40, width: 1100, height: 800 } },
    ],
    connections: [],
  };
}

function stubStageRect() {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if ((this as HTMLElement).dataset.canvasStage === "true") {
      return {
        x: 0, y: 0, left: 0, top: 0,
        width: STAGE_WIDTH, height: STAGE_HEIGHT, right: STAGE_WIDTH, bottom: STAGE_HEIGHT,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return originalRect.call(this);
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  };
}

describe("Studio section placement", () => {
  afterEach(() => {
    cleanup();
  });

  it("a section placed inside a gray section takes another color", () => {
    const restoreRect = stubStageRect();
    try {
      const states: InteractiveCanvasEditorState[] = [];
      const documents: InteractiveCanvasDocument[] = [];
      const view = render(
        <InteractiveCanvasEditor
          document={boardDocument()}
          onEditorStateChange={(state) => states.push(state)}
          onDocumentChange={(document) => documents.push(document)}
        />,
      );
      const stage = view.container.querySelector("[data-canvas-stage]") as HTMLElement;
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
      });
      expect(states.at(-1)!.tool).toBe("section");
      const point = worldToScreen(states.at(-1)!.viewport, { x: 500, y: 420 });
      fireEvent.pointerDown(stage, { button: 0, pointerId: 1, clientX: point.x, clientY: point.y });
      fireEvent.pointerUp(stage, { button: 0, pointerId: 1, clientX: point.x, clientY: point.y });

      const placed = documents.at(-1)!.objects.find((object) => !["page", "pack"].includes(object.id));
      expect(placed).toMatchObject({ type: "section", parentId: "pack" });
      expect(placed!.color).not.toBe("gray");
    } finally {
      restoreRect();
    }
  });
});
