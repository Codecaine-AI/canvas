import { describe, expect, it } from "bun:test";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";

import { ROOT_PAGE_FRAME_ID, withRootPageFrame } from "../new-document";

function document(
  objects: InteractiveCanvasDocument["objects"] = [],
): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "board-a",
    title: "Board A",
    mode: "diagram",
    size: { width: 960, height: 560 },
    viewport: { x: 0, y: 0, zoom: 1 },
    objects,
    connections: [],
    annotations: [],
  };
}

describe("withRootPageFrame", () => {
  it("seeds the conventional background page frame", () => {
    const framed = withRootPageFrame(document());

    expect(framed.objects).toEqual([
      {
        id: ROOT_PAGE_FRAME_ID,
        type: "section",
        text: "Board A",
        color: "white",
        parentId: null,
        geometry: { x: 32, y: 32, width: 896, height: 496 },
        style: { shape: "section" },
        locked: "background",
      },
    ]);
    expect(framed.size).toEqual({ width: 960, height: 560 });
  });

  it("parents roots without disturbing existing nesting", () => {
    const framed = withRootPageFrame(document([
      {
        id: "section-a",
        type: "section",
        text: "Section A",
        geometry: { x: 80, y: 80, width: 400, height: 300 },
        style: { shape: "section" },
      },
      {
        id: "card-a",
        type: "process",
        text: "Card A",
        parentId: "section-a",
        geometry: { x: 120, y: 160, width: 160, height: 80 },
        style: { shape: "rounded-rect" },
      },
    ]));

    expect(framed.objects.map(({ id, parentId }) => ({ id, parentId }))).toEqual([
      { id: ROOT_PAGE_FRAME_ID, parentId: null },
      { id: "section-a", parentId: ROOT_PAGE_FRAME_ID },
      { id: "card-a", parentId: "section-a" },
    ]);
  });

  it("preserves an existing root frame and remains idempotent", () => {
    const existing = document([
      {
        id: "page-frame",
        type: "section",
        text: "Existing frame",
        color: "white",
        parentId: null,
        geometry: { x: 16, y: 16, width: 928, height: 528 },
        style: { shape: "section" },
        locked: "background",
      },
      {
        id: "card-a",
        type: "process",
        text: "Card A",
        geometry: { x: 120, y: 160, width: 160, height: 80 },
        style: { shape: "rounded-rect" },
      },
    ]);

    const framed = withRootPageFrame(existing);
    expect(framed.objects[0]?.id).toBe("page-frame");
    expect(framed.objects[1]?.parentId).toBe("page-frame");
    expect(withRootPageFrame(framed)).toEqual(framed);
  });

  it("expands the frame and document to enclose out-of-bounds content", () => {
    const framed = withRootPageFrame({
      ...document([
        {
          id: "wide-card",
          type: "process",
          text: "Wide card",
          geometry: { x: -20, y: -10, width: 220, height: 140 },
          style: { shape: "rounded-rect" },
        },
      ]),
      size: { width: 100, height: 80 },
    });

    expect(framed.objects[0]?.geometry).toEqual({
      x: -52,
      y: -42,
      width: 284,
      height: 204,
    });
    expect(framed.size).toEqual({ width: 264, height: 194 });
  });
});
