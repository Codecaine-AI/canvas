import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { CanvasAction } from "../../../../state/actions";
import type { InteractiveCanvasDocument } from "../../../../state/schema";
import { useLabelEditing } from "../use-label-editing";

const document: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "label-editing-test",
  mode: "diagram",
  viewport: { x: 0, y: 0, zoom: 1 },
  size: { width: 1200, height: 800 },
  objects: [
    {
      id: "sticky-a",
      type: "sticky",
      label: "Sticky",
      body: "line one\n- bullet",
      geometry: { x: 80, y: 100, width: 240, height: 220 },
      style: { shape: "note" },
    },
    {
      id: "shape-a",
      type: "process",
      label: "Shape label",
      geometry: { x: 400, y: 100, width: 160, height: 96 },
      style: { shape: "rounded-rect" },
    },
  ],
  connections: [],
};

function setup() {
  const dispatch = mock((_action: CanvasAction) => {});
  const view = renderHook(() => useLabelEditing({ document, dispatch }));
  return { ...view, dispatch };
}

afterEach(() => {
  cleanup();
});

describe("useLabelEditing object targets", () => {
  it("opens sticky text editing against body and commits a body-only patch", () => {
    const { result, dispatch } = setup();

    act(() => {
      result.current.openObjectLabelEditor("sticky-a");
    });
    expect(result.current.objectLabelEditValue).toBe("line one\n- bullet");

    act(() => {
      result.current.setObjectLabelEditValue("new body\n- item");
    });
    act(() => {
      result.current.commitObjectLabel();
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0] as Extract<CanvasAction, { type: "canvas.updateObject" }>;
    expect(action.objectId).toBe("sticky-a");
    expect(action.patch).toEqual({ body: "new body\n- item" });
    expect(Object.prototype.hasOwnProperty.call(action.patch, "label")).toBe(false);
  });

  it("keeps plain shapes editing and committing their label", () => {
    const { result, dispatch } = setup();

    act(() => {
      result.current.openObjectLabelEditor("shape-a");
    });
    expect(result.current.objectLabelEditValue).toBe("Shape label");

    act(() => {
      result.current.setObjectLabelEditValue("Renamed shape");
    });
    act(() => {
      result.current.commitObjectLabel();
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.updateObject",
      objectId: "shape-a",
      patch: { label: "Renamed shape" },
    });
  });
});
