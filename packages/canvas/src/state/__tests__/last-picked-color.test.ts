import { describe, expect, it } from "bun:test";
import {
  createInteractiveCanvasState,
  FIRST_USE_COLORS,
  reduceInteractiveCanvasState,
} from "../actions";
import type { InteractiveCanvasDocument } from "../schema";

/**
 * D17 — last-picked color memory: per-kind buckets (shape / sticky /
 * section / connector) seeded with the first-use fallbacks. Object color
 * picks update their kind bucket; connector color picks only affect the
 * selected connector, and new connectors always start gray.
 */

function makeDocument(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "last-picked-doc",
    mode: "diagram",
    objects: [
      { id: "shape-a", type: "process", text: "A", geometry: { x: 0, y: 0, width: 160, height: 96 } },
      { id: "shape-b", type: "process", text: "B", geometry: { x: 300, y: 0, width: 160, height: 96 } },
      {
        id: "sticky-a",
        type: "sticky",
        text: "",
        geometry: { x: 0, y: 200, width: 176, height: 128 },
        style: { shape: "note" },
      },
      {
        id: "section-a",
        type: "section",
        text: "Section",
        geometry: { x: 600, y: 0, width: 480, height: 360 },
        style: { shape: "section" },
      },
    ],
    connections: [
      {
        id: "conn-a",
        from: { objectId: "shape-a", anchor: "right" },
        to: { objectId: "shape-b", anchor: "left" },
      },
    ],
  };
}

describe("D17: last-picked color memory", () => {
  it("starts at the per-kind first-use fallbacks", () => {
    const state = createInteractiveCanvasState(makeDocument());
    expect(state.lastPickedColor).toEqual({
      shape: "gray",
      sticky: "yellow",
      section: "gray",
      connector: "gray",
    });
    expect(state.lastPickedColor).toEqual(FIRST_USE_COLORS);
  });

  it("a color patch updates ONLY the patched object's kind bucket", () => {
    let state = createInteractiveCanvasState(makeDocument());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "sticky-a",
      patch: { color: "pink" },
    });
    expect(state.lastPickedColor.sticky).toBe("pink");
    expect(state.lastPickedColor.shape).toBe("gray");
    expect(state.lastPickedColor.section).toBe("gray");
    expect(state.lastPickedColor.connector).toBe("gray");

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "section-a",
      patch: { color: "teal" },
    });
    expect(state.lastPickedColor.section).toBe("teal");
    expect(state.lastPickedColor.sticky).toBe("pink");
  });

  it("non-color patches leave the memory untouched", () => {
    let state = createInteractiveCanvasState(makeDocument());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "shape-a",
      patch: { text: "renamed" },
    });
    expect(state.lastPickedColor).toEqual(FIRST_USE_COLORS);
  });

  it("new objects take the remembered pick for their kind (place path)", () => {
    let state = createInteractiveCanvasState(makeDocument());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "shape-a",
      patch: { color: "red" },
    });
    state = reduceInteractiveCanvasState(state, { type: "canvas.addObject", objectType: "ellipse" });
    expect(state.document.objects.at(-1)?.color).toBe("red");

    // A different kind keeps ITS memory: a new sticky is still yellow.
    state = reduceInteractiveCanvasState(state, { type: "canvas.addObject", objectType: "sticky" });
    expect(state.document.objects.at(-1)?.color).toBe("yellow");

    // Sections read the section bucket.
    state = reduceInteractiveCanvasState(state, { type: "canvas.addObject", objectType: "section" });
    expect(state.document.objects.at(-1)?.color).toBe("gray");
  });

  it("an explicit action color wins over the memory", () => {
    let state = createInteractiveCanvasState(makeDocument());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.addObject",
      objectType: "process",
      color: "teal",
    });
    expect(state.document.objects.at(-1)?.color).toBe("teal");
    // Stamping via the action is not a pick — memory unchanged.
    expect(state.lastPickedColor.shape).toBe("gray");
  });

  it("connector picks do not update color memory; quick-connect duplicates the source color and creates a gray connector", () => {
    let state = createInteractiveCanvasState(makeDocument());
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateConnection",
      connectionId: "conn-a",
      patch: { color: "violet" },
    });
    expect(state.document.connections.find((connection) => connection.id === "conn-a")?.color)
      .toBe("violet");
    expect(state.lastPickedColor.connector).toBe("gray");
    expect(state.lastPickedColor.shape).toBe("gray");

    state = reduceInteractiveCanvasState(state, {
      type: "canvas.updateObject",
      objectId: "shape-a",
      patch: { color: "green" },
    });
    state = reduceInteractiveCanvasState(state, {
      type: "canvas.quickConnect",
      fromObjectId: "shape-a",
      fromAnchor: "bottom",
      drop: { point: { x: 900, y: 900 } },
    });
    const created = state.document.objects.at(-1);
    expect(created?.type).toBe("process");
    expect(created?.color).toBe("green");
    const createdConnection = state.document.connections.at(-1);
    expect(createdConnection?.color).toBe("gray");
  });
});
