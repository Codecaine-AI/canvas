import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { routeConnection } from "../../../../routing/routing";
import type { CanvasAction } from "../../../../state/actions";
import type { InteractiveCanvasDocument } from "../../../../state/schema";
import { useTextEditing } from "../use-text-editing";

const document: InteractiveCanvasDocument = {
  schemaVersion: 1,
  id: "text-editing-test",
  mode: "diagram",
  viewport: { x: 0, y: 0, zoom: 1 },
  size: { width: 1200, height: 800 },
  objects: [
    {
      id: "sticky-a",
      type: "sticky",
      text: "line one\n- bullet",
      geometry: { x: 80, y: 100, width: 240, height: 220 },
      style: { shape: "note" },
    },
    {
      id: "shape-a",
      type: "process",
      text: "Shape label",
      geometry: { x: 400, y: 100, width: 160, height: 96 },
      style: { shape: "rounded-rect" },
    },
    {
      id: "person-a",
      type: "icon",
      icon: "person",
      text: "Hello text",
      geometry: { x: 10, y: 20, width: 120, height: 140 },
      style: { shape: "icon" },
    },
    {
      id: "section-a",
      type: "section",
      text: "Section title",
      color: "gray",
      geometry: { x: 40, y: 400, width: 480, height: 360 },
      style: { shape: "section" },
    },
    {
      id: "plus-a",
      type: "plus",
      text: "Plus",
      geometry: { x: 700, y: 100, width: 120, height: 120 },
      style: { shape: "plus" },
    },
  ],
  connections: [
    {
      id: "connection-a",
      from: { objectId: "shape-a", anchor: "right" },
      to: { objectId: "person-a", anchor: "left" },
      label: "Old connector label",
      style: "solid",
      arrow: "forward",
    },
  ],
};

function setup() {
  const dispatch = mock((_action: CanvasAction) => {});
  const view = renderHook(() => useTextEditing({ document, dispatch }));
  return { ...view, dispatch };
}

afterEach(() => {
  cleanup();
});

describe("useTextEditing object targets (single unified text field, D3/D11)", () => {
  it("opens sticky editing seeded with its text and commits a text patch", () => {
    const { result, dispatch } = setup();

    act(() => {
      result.current.openObjectTextEditor("sticky-a");
    });
    expect(result.current.objectTextEditValue).toBe("line one\n- bullet");

    act(() => {
      result.current.setObjectTextEditValue("new body\n- item");
    });
    act(() => {
      result.current.commitObjectText();
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0] as Extract<CanvasAction, { type: "canvas.updateObject" }>;
    expect(action.objectId).toBe("sticky-a");
    expect(action.patch).toEqual({ text: "new body\n- item" });
  });

  it("keeps plain shapes editing and committing their text", () => {
    const { result, dispatch } = setup();

    act(() => {
      result.current.openObjectTextEditor("shape-a");
    });
    expect(result.current.objectTextEditValue).toBe("Shape label");

    act(() => {
      result.current.setObjectTextEditValue("Renamed shape");
    });
    act(() => {
      result.current.commitObjectText();
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.updateObject",
      objectId: "shape-a",
      patch: { text: "Renamed shape" },
    });
    const action = dispatch.mock.calls[0][0] as Extract<CanvasAction, { type: "canvas.updateObject" }>;
    expect("geometry" in action.patch).toBe(false);
  });

  it("commits below-slot text as a text-only object patch", () => {
    const { result, dispatch } = setup();

    act(() => {
      result.current.openObjectTextEditor("person-a");
    });
    act(() => {
      result.current.setObjectTextEditValue("a\nb\nc");
    });
    act(() => {
      result.current.commitObjectText();
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.updateObject",
      objectId: "person-a",
      patch: { text: "a\nb\nc" },
    });
    const action = dispatch.mock.calls[0][0] as Extract<CanvasAction, { type: "canvas.updateObject" }>;
    expect("geometry" in action.patch).toBe(false);
  });

  it("keeps a section's previous title when committed empty", () => {
    const { result, dispatch } = setup();

    act(() => {
      result.current.openObjectTextEditor("section-a");
    });
    act(() => {
      result.current.setObjectTextEditValue("   ");
    });
    act(() => {
      result.current.commitObjectText();
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.updateObject",
      objectId: "section-a",
      patch: { text: "Section title" },
    });
  });

  it("refuses to open the editor for a def without a text slot (plus)", () => {
    const { result } = setup();

    act(() => {
      result.current.openObjectTextEditor("plus-a");
    });

    expect(result.current.objectTextEditId).toBeNull();
    expect(result.current.objectTextEditTarget).toBeUndefined();
  });
});

describe("useTextEditing connector labels", () => {
  it("opens connector label editing at the routed midpoint and commits through updateConnection", () => {
    const { result, dispatch } = setup();
    const connection = document.connections[0]!;
    const fromObject = document.objects.find((object) => object.id === connection.from.objectId)!;
    const toObject = document.objects.find((object) => object.id === connection.to.objectId)!;
    const routed = routeConnection(fromObject, toObject, connection, document.objects);

    act(() => {
      result.current.openConnectionLabelEditor("connection-a");
    });

    expect(result.current.labelEditConnectionId).toBe("connection-a");
    expect(result.current.labelEditValue).toBe("Old connector label");
    expect(result.current.labelEditPoint).toEqual(routed.labelPoint);

    act(() => {
      result.current.setLabelEditValue("New connector label");
    });
    act(() => {
      result.current.commitConnectionLabel();
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.updateConnection",
      connectionId: "connection-a",
      patch: { label: "New connector label" },
    });
    expect(result.current.labelEditConnectionId).toBeNull();
  });

  it("commits an empty connector label as undefined", () => {
    const { result, dispatch } = setup();

    act(() => {
      result.current.openConnectionLabelEditor("connection-a");
    });
    act(() => {
      result.current.setLabelEditValue("   ");
    });
    act(() => {
      result.current.commitConnectionLabel();
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "canvas.updateConnection",
      connectionId: "connection-a",
      patch: { label: undefined },
    });
  });
});
