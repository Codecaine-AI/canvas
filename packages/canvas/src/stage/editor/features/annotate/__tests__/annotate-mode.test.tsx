import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CanvasAction, CanvasSelection } from "../../../../../state/actions";
import type { InteractiveCanvasDocument } from "../../../../../state/schema";
import { worldToScreen } from "../../../../viewport";
import {
  InteractiveCanvasEditor,
  type InteractiveCanvasEditorState,
} from "../../../InteractiveCanvasEditor";
import { AnnotateFeedback } from "../AnnotateFeedback";
import { AnnotationPins } from "../AnnotationPins";
import { AnnotationHint, AnnotationPopup } from "../AnnotationPopup";
import { annotationTargetLabel } from "../target-label";
import { useAnnotateMode } from "../use-annotate-mode";

const canvasDocument: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "annotate-test",
  mode: "diagram",
  objects: [
    {
      id: "object-a",
      type: "process",
      text: "Object A",
      geometry: { x: 20, y: 20, width: 200, height: 100 },
    },
    {
      id: "section-a",
      type: "section",
      text: "Section A",
      geometry: { x: 300, y: 40, width: 400, height: 300 },
    },
  ],
  connections: [],
};

afterEach(() => cleanup());

function dispatchKeyDown(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
    );
  });
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
        width: 900,
        height: 650,
        right: 900,
        bottom: 650,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return originalRect.call(this);
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  };
}

function AnnotateHarness({ dispatch }: { dispatch: (action: CanvasAction) => void }) {
  const annotate = useAnnotateMode({
    document: canvasDocument,
    enabled: true,
    dispatch,
    screenToWorld: (point) => point,
  });
  return (
    <div
      data-canvas-stage="true"
      onPointerDown={annotate.handleStagePointerDown}
      onPointerMove={annotate.handleStagePointerMove}
      onPointerLeave={annotate.handleStagePointerLeave}
    >
      <div data-canvas-object-id="object-a" data-testid="object-a" />
      <AnnotateFeedback
        document={canvasDocument}
        viewport={{ x: 0, y: 0, zoom: 1 }}
        hoveredObjectId={annotate.hoveredObjectId}
        selectedObjectIds={[]}
      />
      {annotate.popup ? (
        <AnnotationPopup
          anchor={annotate.popup.anchor}
          targetLabel={annotationTargetLabel(
            canvasDocument.objects.find((object) => object.id === annotate.popup?.objectId)!,
          )}
          onSave={annotate.saveAnnotation}
          onCancel={annotate.cancelPopup}
        />
      ) : null}
      {annotate.hint ? (
        <AnnotationHint anchor={annotate.hint.anchor} message={annotate.hint.message} />
      ) : null}
    </div>
  );
}

describe("annotation mode authoring", () => {
  it("sets the hover highlight target and clears it when the pointer leaves", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    const { container } = render(<AnnotateHarness dispatch={dispatch} />);

    fireEvent.pointerMove(screen.getByTestId("object-a"), {
      pointerId: 1,
      clientX: 40,
      clientY: 50,
    });
    expect(
      container.querySelector("[data-canvas-hover-highlight='true']")?.getAttribute(
        "data-canvas-object-id",
      ),
    ).toBe("object-a");

    fireEvent.pointerLeave(container.querySelector("[data-canvas-stage]")!);
    expect(container.querySelector("[data-canvas-hover-highlight='true']")).toBeNull();
  });

  it("selects the object, names it in the popup, and Enter saves an agent request", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    render(<AnnotateHarness dispatch={dispatch} />);

    fireEvent.pointerDown(screen.getByTestId("object-a"), {
      button: 0,
      pointerId: 1,
      clientX: 40,
      clientY: 50,
    });
    const textarea = screen.getByPlaceholderText("Note for the agent…") as HTMLTextAreaElement;
    expect(window.document.activeElement).toBe(textarea);
    expect(screen.getByText("Object A").getAttribute("data-annotation-target-label")).toBe("");
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["object-a"] },
    });

    fireEvent.change(textarea, { target: { value: "Make this more concise" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "canvas.addAnnotation",
      target: { kind: "object", objectId: "object-a" },
      body: "Make this more concise",
      intent: "agent-request",
    });
    expect(dispatch).toHaveBeenNthCalledWith(3, {
      type: "canvas.select",
      selection: { kind: "objects", objectIds: ["object-a"] },
    });
    expect(screen.queryByPlaceholderText("Note for the agent…")).toBeNull();
  });

  it("Escape cancels the popup while Shift+Enter leaves it open", () => {
    const onSave = mock((_body: string) => {});
    const onCancel = mock(() => {});
    const { rerender } = render(
      <AnnotationPopup
        anchor={{ x: 10, y: 20 }}
        targetLabel="Object A"
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    const textarea = screen.getByPlaceholderText("Note for the agent…");
    fireEvent.change(textarea, { target: { value: "Line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<></>);
  });

  it("shows quiet guidance instead of a popup after an empty-canvas click", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    const { container } = render(<AnnotateHarness dispatch={dispatch} />);
    const stage = container.querySelector("[data-canvas-stage]")!;
    fireEvent.pointerDown(stage, {
      button: 0,
      pointerId: 1,
      clientX: 760,
      clientY: 520,
    });

    expect(screen.getByRole("status").textContent).toBe("Click an object to pin a note");
    expect(screen.queryByPlaceholderText("Note for the agent…")).toBeNull();
    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.select",
      selection: { kind: "none" },
    });
  });

  it("uses the selection-toolbar shadow and 140ms enter animation", () => {
    render(
      <AnnotationPopup
        anchor={{ x: 0, y: 0 }}
        targetLabel="Object A"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const popup = window.document.querySelector("[data-annotation-popup]") as HTMLElement;
    expect(popup.style.boxShadow).toContain("0 0 0 0.5px");
    expect(popup.style.boxShadow).toContain("0 2px 5px");
    expect(popup.style.boxShadow).toContain("0 6px 18px");
    expect(popup.style.animation).toContain("canvas-selection-toolbar-enter 140ms");
  });

  it("labels sections by name and falls back to the object type", () => {
    expect(annotationTargetLabel(canvasDocument.objects[1]!)).toBe('Section "Section A"');
    expect(
      annotationTargetLabel({
        ...canvasDocument.objects[0]!,
        text: "",
      }),
    ).toBe("Process");
  });
});

describe("InteractiveCanvasEditor annotation authoring", () => {
  it("E enters annotation mode, click + Enter adds an agent request, and E toggles back", () => {
    const restoreRect = stubStageRect();
    try {
      let latestEditorState: InteractiveCanvasEditorState | undefined;
      let latestDocument: InteractiveCanvasDocument | undefined;
      const { container } = render(
        <InteractiveCanvasEditor
          document={canvasDocument}
          onEditorStateChange={(state) => {
            latestEditorState = state;
          }}
          onDocumentChange={(nextDocument) => {
            latestDocument = nextDocument;
          }}
        />,
      );

      dispatchKeyDown({ key: "e" });
      expect(latestEditorState?.tool).toBe("annotation");
      const stage = container.querySelector("[data-canvas-stage]") as HTMLElement;
      expect(stage.style.cursor).toBe("crosshair");

      const objectElement = container.querySelector(
        '[data-canvas-object-id="object-a"]',
      )!;
      const click = worldToScreen(latestEditorState!.viewport, { x: 120, y: 70 });
      fireEvent.pointerDown(objectElement, {
        button: 0,
        pointerId: 1,
        clientX: click.x,
        clientY: click.y,
      });
      const textarea = screen.getByPlaceholderText("Note for the agent…");
      expect(
        container.querySelector("[data-annotation-target-label]")?.textContent,
      ).toBe("Object A");
      expect(latestEditorState?.selection).toEqual({
        kind: "objects",
        objectIds: ["object-a"],
      });
      expect(container.querySelector("[data-canvas-selection-box='true']")).toBeTruthy();
      fireEvent.change(textarea, { target: { value: "Make this more concise" } });
      fireEvent.keyDown(textarea, { key: "Enter" });

      expect(latestDocument?.annotations).toHaveLength(1);
      expect(latestDocument?.annotations?.[0]).toMatchObject({
        target: { kind: "object", objectId: "object-a" },
        body: "Make this more concise",
        intent: "agent-request",
        status: "open",
      });
      expect(latestEditorState?.tool).toBe("annotation");
      expect(latestEditorState?.selection).toEqual({
        kind: "objects",
        objectIds: ["object-a"],
      });
      expect(screen.queryByPlaceholderText("Note for the agent…")).toBeNull();

      dispatchKeyDown({ key: "e" });
      expect(latestEditorState?.tool).toBe("select");
    } finally {
      restoreRect();
    }
  });

  it("popup Escape cancels only the popup, then a second Escape exits annotation mode", () => {
    const restoreRect = stubStageRect();
    try {
      let latestEditorState: InteractiveCanvasEditorState | undefined;
      const { container } = render(
        <InteractiveCanvasEditor
          document={canvasDocument}
          onEditorStateChange={(state) => {
            latestEditorState = state;
          }}
        />,
      );

      dispatchKeyDown({ key: "e" });
      const objectElement = container.querySelector(
        '[data-canvas-object-id="object-a"]',
      )!;
      const click = worldToScreen(latestEditorState!.viewport, { x: 120, y: 70 });
      fireEvent.pointerDown(objectElement, {
        button: 0,
        pointerId: 1,
        clientX: click.x,
        clientY: click.y,
      });

      fireEvent.keyDown(screen.getByPlaceholderText("Note for the agent…"), {
        key: "Escape",
      });
      expect(screen.queryByPlaceholderText("Note for the agent…")).toBeNull();
      expect(latestEditorState?.tool).toBe("annotation");
      expect(latestEditorState?.selection).toEqual({
        kind: "objects",
        objectIds: ["object-a"],
      });

      dispatchKeyDown({ key: "Escape" });
      expect(latestEditorState?.tool).toBe("select");
    } finally {
      restoreRect();
    }
  });

  it("clicking a preloaded open pin selects it and Delete removes the annotation", () => {
    const restoreRect = stubStageRect();
    try {
      const documentWithPin: InteractiveCanvasDocument = {
        ...canvasDocument,
        annotations: [
          {
            id: "delete-me",
            target: { kind: "object", objectId: "object-a" },
            intent: "agent-request",
            body: "Remove after selection",
            status: "open",
            createdBy: "human",
          },
        ],
      };
      let latestEditorState: InteractiveCanvasEditorState | undefined;
      let latestDocument: InteractiveCanvasDocument | undefined;
      const { container } = render(
        <InteractiveCanvasEditor
          document={documentWithPin}
          onEditorStateChange={(state) => {
            latestEditorState = state;
          }}
          onDocumentChange={(nextDocument) => {
            latestDocument = nextDocument;
          }}
        />,
      );

      const pin = container.querySelector('[data-annotation-pin="delete-me"]')!;
      fireEvent.click(pin);
      expect(latestEditorState?.selection).toEqual({
        kind: "annotation",
        annotationId: "delete-me",
      });

      dispatchKeyDown({ key: "Delete" });
      expect(container.querySelector('[data-annotation-pin="delete-me"]')).toBeNull();
      expect(latestDocument?.annotations).toEqual([]);
      expect(latestEditorState?.selection).toEqual({ kind: "none" });
    } finally {
      restoreRect();
    }
  });
});

describe("annotation pins", () => {
  const pinDocument: InteractiveCanvasDocument = {
    ...canvasDocument,
    annotations: [
      {
        id: "open-agent-note",
        target: { kind: "object", objectId: "object-a" },
        intent: "agent-request",
        body: "Align this with the section",
        status: "open",
        createdBy: "human",
      },
      {
        id: "resolved-agent-note",
        target: { kind: "object", objectId: "object-a" },
        intent: "agent-request",
        body: "Already handled",
        status: "resolved",
        createdBy: "human",
      },
      {
        id: "ordinary-note",
        target: { kind: "object", objectId: "object-a" },
        intent: "note",
        body: "A regular note",
        status: "open",
        createdBy: "human",
      },
    ],
  };

  it("renders only open agent-request object pins at the target top-right", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    const selection: CanvasSelection = { kind: "none" };
    const { container } = render(
      <AnnotationPins
        document={pinDocument}
        selection={selection}
        dispatch={dispatch}
        zoom={2}
      />,
    );
    const pins = container.querySelectorAll("[data-annotation-pin]");
    expect(pins).toHaveLength(1);
    const pin = pins[0] as HTMLButtonElement;
    expect(pin.title).toBe("Align this with the section");
    expect(pin.style.left).toBe("220px");
    expect(pin.style.top).toBe("20px");
    expect(pin.style.transform).toContain("scale(0.5)");
    expect(pin.style.pointerEvents).toBe("auto");
  });

  it("selects the annotation when its pin is clicked", () => {
    const dispatch = mock((_action: CanvasAction) => {});
    const { container } = render(
      <AnnotationPins
        document={pinDocument}
        selection={{ kind: "none" }}
        dispatch={dispatch}
      />,
    );
    fireEvent.click(container.querySelector('[data-annotation-pin="open-agent-note"]')!);
    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.select",
      selection: { kind: "annotation", annotationId: "open-agent-note" },
    });
  });
});
