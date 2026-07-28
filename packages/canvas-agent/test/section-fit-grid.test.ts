/**
 * fit_section on the 20 grid (gesture-surface S2.4), plus the `match_size`
 * size lookup. The agent fit pads by grid multiples and snaps the fitted rect
 * outward, so a frame closed around on-grid children lands on the grid and a
 * frame closed around hand-drawn ones only ever gains air.
 */
import { describe, expect, test } from "bun:test";

import type { CanvasGeometry, InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

import { resolveFitSection, resolveSizeLike } from "../src/service/session/apply-ops";
import { AGENT_GRID, snapRectOutward } from "../src/service/session/tools/grid";
import { box, makeDocument } from "./synthetic";

function frame(id: string, x: number, y: number, width: number, height: number) {
  return { ...box(id, x, y, width, height, "section"), text: id } as InteractiveCanvasObject;
}

function fittedGeometry(
  objects: InteractiveCanvasObject[],
  sectionId: string,
): CanvasGeometry {
  const resolved = resolveFitSection(makeDocument(objects), sectionId);
  expect(resolved).not.toHaveProperty("note");
  if (!("internal" in resolved)) throw new Error("expected a fit patch");
  const operation = resolved.internal;
  if (operation.type !== "updateObject") throw new Error("expected an updateObject patch");
  return operation.patch.geometry as CanvasGeometry;
}

describe("fit_section pads on the agent grid", () => {
  test("a frame fitted around 20-grid children is all multiples of 20", () => {
    const geometry = fittedGeometry(
      [
        frame("frame", 0, 0, 1000, 600),
        box("kid-a", 200, 200, 300, 60),
        box("kid-b", 560, 320, 180, 100),
      ],
      "frame",
    );

    expect(geometry).toEqual({ x: 160, y: 120, width: 620, height: 340 });
    for (const value of [geometry.x, geometry.y, geometry.width, geometry.height]) {
      expect(value % AGENT_GRID).toBe(0);
    }
    // 40 of body air on the left/right/bottom, 40 + 40 above the first child
    // (the title chip's band on top of the body rung).
    expect(200 - geometry.x).toBe(40);
    expect(200 - geometry.y).toBe(80);
    expect(geometry.x + geometry.width - (560 + 180)).toBe(40);
    expect(geometry.y + geometry.height - (320 + 100)).toBe(40);
  });

  test("the top gap keeps the spacing the old flat 48 padding produced", () => {
    // 40 body + 40 title clearance = 80 against the old 48 + 30 = 78: fitted
    // frames look the same, they are just on grid now.
    const geometry = fittedGeometry(
      [frame("frame", 0, 0, 800, 600), box("kid", 300, 300, 200, 100)],
      "frame",
    );
    expect(300 - geometry.y).toBe(80);
  });

  test("children drawn off grid still yield an on-grid frame that contains them", () => {
    const children = [
      box("kid-a", 203, 207, 301, 63),
      box("kid-b", 517, 141, 97, 219),
    ];
    const geometry = fittedGeometry([frame("frame", 0, 0, 1000, 600), ...children], "frame");

    for (const value of [geometry.x, geometry.y, geometry.width, geometry.height]) {
      expect(value % AGENT_GRID).toBe(0);
    }
    for (const child of children) {
      expect(child.geometry.x - geometry.x).toBeGreaterThanOrEqual(AGENT_GRID);
      expect(child.geometry.y - geometry.y).toBeGreaterThanOrEqual(AGENT_GRID);
      expect(geometry.x + geometry.width - (child.geometry.x + child.geometry.width))
        .toBeGreaterThanOrEqual(AGENT_GRID);
      expect(geometry.y + geometry.height - (child.geometry.y + child.geometry.height))
        .toBeGreaterThanOrEqual(AGENT_GRID);
    }
  });

  test("nothing to fit still reports the same notes", () => {
    const empty = resolveFitSection(makeDocument([frame("frame", 0, 0, 400, 300)]), "frame");
    expect(empty).toHaveProperty("note");
    expect((empty as { note: string }).note).toContain("empty");

    const missing = resolveFitSection(makeDocument([box("plain", 0, 0)]), "plain");
    expect((missing as { note: string }).note).toContain("no section");
  });
});

describe("snapRectOutward", () => {
  test("is an identity on grid multiples", () => {
    const rect = { x: 160, y: 120, width: 620, height: 340 };
    expect(snapRectOutward(rect)).toEqual(rect);
  });

  test("grows: the snapped rect always contains the input", () => {
    const rect = { x: 163, y: 127, width: 381, height: 183 };
    const snapped = snapRectOutward(rect);
    expect(snapped).toEqual({ x: 160, y: 120, width: 400, height: 200 });
    expect(snapped.x).toBeLessThanOrEqual(rect.x);
    expect(snapped.y).toBeLessThanOrEqual(rect.y);
    expect(snapped.x + snapped.width).toBeGreaterThanOrEqual(rect.x + rect.width);
    expect(snapped.y + snapped.height).toBeGreaterThanOrEqual(rect.y + rect.height);
  });

  test("handles negative coordinates and degenerate input", () => {
    expect(snapRectOutward({ x: -31, y: -1, width: 2, height: 2 })).toEqual({
      x: -40,
      y: -20,
      width: 20,
      height: 40,
    });
    expect(snapRectOutward({ x: Number.NaN, y: 0, width: 10, height: 10 })).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    });
  });
});

describe("match_size lookup", () => {
  test("reads the source object's size, and null for an unknown id", () => {
    const document = makeDocument([box("model", 0, 0, 300, 60), box("peer", 400, 0, 180, 40)]);
    expect(resolveSizeLike(document, "model")).toEqual({ width: 300, height: 60 });
    expect(resolveSizeLike(document, "peer")).toEqual({ width: 180, height: 40 });
    expect(resolveSizeLike(document, "connection-1")).toBeNull();
  });

  test("returns the raw size — the descriptor is what quantizes it", () => {
    const document = makeDocument([box("hand-drawn", 0, 0, 187, 63)]);
    expect(resolveSizeLike(document, "hand-drawn")).toEqual({ width: 187, height: 63 });
  });
});
