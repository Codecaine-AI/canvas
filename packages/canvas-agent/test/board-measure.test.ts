import { describe, expect, test } from "bun:test";

import {
  axisGap,
  formatRegionMeasures,
  measureRegion,
  rectIntersectionArea,
} from "../src/board/measure";
import tools from "../src/catalog/layout-editor/tools";
import type { ToolRegistrar } from "../src/catalog/layout-editor/tools";
import { box, makeDocument } from "./synthetic";

/** A 2×2 grid of 160×96 boxes inside a 640×480 frame. Every number below is
 *  hand-computed off these coordinates. */
function gridBoard() {
  const home = { ...box("home", 0, 0, 640, 480, "section"), text: "Home" };
  const kid = (id: string, x: number, y: number) => ({ ...box(id, x, y), parentId: "home" });
  return {
    home,
    document: makeDocument([
      home,
      kid("a", 40, 80),
      kid("b", 280, 80),
      kid("c", 40, 240),
      kid("d", 280, 240),
    ]),
  };
}

describe("axisGap", () => {
  test("measures the clear space between two boxes and goes negative on overlap", () => {
    const a = { x: 0, y: 0, width: 160, height: 96 };
    const b = { x: 240, y: 0, width: 160, height: 96 };
    expect(axisGap(a, b, "x")).toBe(80);
    // Same span on y: they overlap fully, so the y "gap" is minus the overlap.
    expect(axisGap(a, b, "y")).toBe(-96);
    // Order-independent.
    expect(axisGap(b, a, "x")).toBe(80);
  });
});

describe("rectIntersectionArea", () => {
  test("is the overlap area, and zero when the rects miss", () => {
    expect(rectIntersectionArea(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 50, width: 100, height: 100 },
    )).toBe(2500);
    expect(rectIntersectionArea(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 20, width: 10, height: 10 },
    )).toBe(0);
  });
});

describe("measureRegion", () => {
  test("reports the neighbour corridor on each axis, naming the pair", () => {
    const { document, home } = gridBoard();

    const measured = measureRegion(document, home.geometry, { sectionId: "home" });

    // a right edge 200, b left edge 280 → 80. a bottom 176, c top 240 → 64.
    expect(measured.gaps).toEqual([
      { axis: "x", a: "a", b: "b", gap: 80 },
      { axis: "x", a: "c", b: "d", gap: 80 },
      { axis: "y", a: "a", b: "c", gap: 64 },
      { axis: "y", a: "b", b: "d", gap: 64 },
    ]);
    // The frame itself is the wall, not a member of what it contains.
    expect(measured.memberIds).toEqual(["a", "b", "c", "d"]);
  });

  test("only neighbours count — a box between two others hides their corridor", () => {
    const document = makeDocument([
      box("a", 0, 0),
      box("b", 240, 0),
      box("c", 480, 0),
    ]);

    const measured = measureRegion(document, { x: 0, y: 0, width: 640, height: 96 });

    expect(measured.gaps).toEqual([
      { axis: "x", a: "a", b: "b", gap: 80 },
      { axis: "x", a: "b", b: "c", gap: 80 },
    ]);
  });

  test("pitch is the delta between the distinct leading edges on each axis", () => {
    const { document, home } = gridBoard();

    const measured = measureRegion(document, home.geometry, { sectionId: "home" });

    // Columns at x 40/280, rows at y 80/240.
    expect(measured.pitch).toEqual([
      { axis: "x", deltas: [240] },
      { axis: "y", deltas: [160] },
    ]);
  });

  test("boxes sharing a leading edge collapse into one track", () => {
    const document = makeDocument([
      box("a", 0, 0),
      box("b", 240, 0),
      box("c", 0, 200),
      box("d", 240, 200),
      box("e", 0, 400),
    ]);

    const measured = measureRegion(document, { x: 0, y: 0, width: 640, height: 640 });

    expect(measured.pitch).toEqual([
      { axis: "x", deltas: [240] },
      // Three rows at 0/200/400 — two boxes share the first two.
      { axis: "y", deltas: [200, 200] },
    ]);
  });

  test("a section region carries the free margin a fit would reclaim on each side", () => {
    const { document, home } = gridBoard();

    const measured = measureRegion(document, home.geometry, { sectionId: "home" });

    // Children span 40,80 → 440,336; the fit pads 24 a side plus a 30px title
    // band on top, normalized onto the write grid: 16,28 448×336.
    expect(measured.sectionId).toBe("home");
    expect(measured.free).toEqual({ left: 16, right: 176, top: 28, bottom: 116 });
  });

  test("a region that is not a section has no free rect", () => {
    const { document } = gridBoard();

    const measured = measureRegion(document, { x: 0, y: 0, width: 480, height: 200 });

    expect(measured.sectionId).toBeNull();
    expect(measured.free).toBeNull();
  });

  test("a section region is recognised from its rect alone", () => {
    const { document, home } = gridBoard();

    expect(measureRegion(document, home.geometry).sectionId).toBe("home");
  });

  test("ink share is painted content over region area — frames are walls, not ink", () => {
    const { document, home } = gridBoard();

    // Four 160×96 boxes = 61 440 of 640×480 = 307 200 → 0.2.
    expect(measureRegion(document, home.geometry, { sectionId: "home" }).inkShare)
      .toBeCloseTo(0.2, 10);
    // Half the frame, two of the four boxes: 30 720 of 96 000 → 0.32.
    expect(measureRegion(document, { x: 0, y: 0, width: 480, height: 200 }).inkShare)
      .toBeCloseTo(0.32, 10);
  });

  test("an empty region measures to nothing rather than failing", () => {
    const { document } = gridBoard();

    const measured = measureRegion(document, { x: 5000, y: 5000, width: 100, height: 100 });

    expect(measured.memberIds).toEqual([]);
    expect(measured.gaps).toEqual([]);
    expect(measured.pitch).toEqual([]);
    expect(measured.inkShare).toBe(0);
  });
});

describe("MEASURES grammar", () => {
  test("a framed section prints gaps, pitch, free and ink in that order", () => {
    const { document, home } = gridBoard();

    const block = formatRegionMeasures(
      "section home",
      measureRegion(document, home.geometry, { sectionId: "home" }),
    );

    expect(block).toBe([
      "MEASURES · section home 0,0 640×480",
      "  gaps x  a↔b 80 · c↔d 80",
      "  gaps y  a↔c 64 · b↔d 64",
      "  pitch x 240",
      "  pitch y 160",
      "  free    left 16 · right 176 · top 28 · bottom 116",
      "  ink     20%",
    ].join("\n"));
  });

  test("empty categories are omitted", () => {
    const { document } = gridBoard();

    const block = formatRegionMeasures(
      "at",
      measureRegion(document, { x: 0, y: 0, width: 480, height: 200 }),
    );

    // One row of two boxes: no y corridor, no y pitch, no free rect.
    expect(block).toBe([
      "MEASURES · at 0,0 480×200",
      "  gaps x  a↔b 80",
      "  pitch x 240",
      "  ink     32%",
    ].join("\n"));
  });

  test("a uniform pitch collapses to interval×count", () => {
    const document = makeDocument([
      box("a", 0, 0),
      box("b", 240, 0),
      box("c", 480, 0),
    ]);

    const block = formatRegionMeasures(
      "at",
      measureRegion(document, { x: 0, y: 0, width: 720, height: 96 }),
    );

    expect(block).toContain("  pitch x 240×2");
  });

  test("an empty region says so", () => {
    const { document } = gridBoard();

    expect(formatRegionMeasures(
      "at",
      measureRegion(document, { x: 5000, y: 5000, width: 100, height: 100 }),
    )).toBe([
      "MEASURES · at 5000,5000 100×100",
      "  empty   no boxes in this region",
    ].join("\n"));
  });
});

describe("the look tool declaration", () => {
  function lookTool() {
    const registered: Array<Record<string, unknown>> = [];
    const pi = {
      on: () => {},
      registerTool: (definition: Record<string, unknown>) => registered.push(definition),
    } as unknown as ToolRegistrar;
    tools(pi, undefined);
    return registered.find((definition) => definition.name === "look")!;
  }

  test("declares the framing knob the runtime honours", () => {
    const parameters = lookTool().parameters as {
      properties: Record<string, unknown>;
      required?: string[];
    };

    expect(Object.keys(parameters.properties)).toEqual(["view"]);
    expect(parameters.required).toEqual(["view"]);
    // One id or several — an inlined union, per the schemas.ts wire constraints.
    expect(parameters.properties.view).toMatchObject({
      anyOf: [
        { type: "string" },
        { type: "array", items: { type: "string" }, minItems: 1 },
      ],
    });
  });

  test("the description says what look actually returns", () => {
    const description = lookTool().description as string;

    expect(description).toContain("section, object, or connection ids");
    expect(description).toContain("measured");
    // One framed region per call; the board render rides the state block.
    expect(description).toContain("Exactly one frame per call");
    expect(description).toContain("look never returns it");
    // The retired framing knob is gone from the surface.
    expect(description).not.toContain("diagnostic");
    // The pre-state-pointer claims are gone: look returns none of these.
    expect(description).not.toContain("the current digest");
    expect(description).not.toContain("every open lint");
    expect(description).not.toContain("the request queue, and");
  });
});
