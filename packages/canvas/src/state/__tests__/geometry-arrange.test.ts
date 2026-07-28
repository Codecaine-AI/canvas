/**
 * The arrange engine (gesture-surface phase 2): descendant-carrying
 * translation, the gap-based space_out re-pitch, descendant-carrying align,
 * and the on-grid fit padding. Engine-level only — the tools that call these
 * are a later slice, so everything here drives the exported functions
 * directly.
 */
import { describe, expect, it } from "bun:test";

import {
  SECTION_FIT_PADDING_PX,
  SECTION_TITLE_CLEARANCE_PX,
  alignObjects,
  alignWithDescendants,
  moveClosureIds,
  moveRootIds,
  sectionFitGeometry,
  spaceOutObjects,
  translateWithDescendants,
} from "../geometry";
import { reconcileSectionMembership } from "../section-membership";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../schema";

function box(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 80,
  overrides: Partial<InteractiveCanvasObject> = {},
): InteractiveCanvasObject {
  return {
    id,
    type: "process",
    text: id,
    parentId: null,
    geometry: { x, y, width, height },
    ...overrides,
  };
}

function section(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  overrides: Partial<InteractiveCanvasObject> = {},
): InteractiveCanvasObject {
  return box(id, x, y, width, height, { type: "section", color: "gray", ...overrides });
}

function makeDocument(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "arrange",
    title: "Arrange",
    mode: "diagram",
    objects,
    connections: [],
  };
}

function geometryOf(objects: InteractiveCanvasObject[], id: string) {
  return objects.find((object) => object.id === id)!.geometry;
}

/**
 * A frame at (200,200) 400x300 holding two children, plus a nested frame with
 * a child of its own, plus one object outside every frame. Membership is what
 * reconcileSectionMembership would derive (each child is >= 60% inside its
 * smallest containing frame), so the reconcile-is-identity assertions below
 * are meaningful.
 */
function nestedDocument(): InteractiveCanvasDocument {
  return makeDocument([
    section("outer", 200, 200, 400, 300),
    box("child-a", 240, 260, 100, 80, { parentId: "outer" }),
    section("inner", 380, 260, 180, 180, { parentId: "outer" }),
    box("child-b", 400, 300, 100, 80, { parentId: "inner" }),
    box("loose", 800, 200, 100, 80),
  ]);
}

describe("S2.1 translateWithDescendants", () => {
  it("carries a section's transitive descendants and leaves everything else alone", () => {
    const document = nestedDocument();
    const objects = translateWithDescendants(document, ["outer"], { dx: 100, dy: -40 });

    expect(geometryOf(objects, "outer")).toEqual({ x: 300, y: 160, width: 400, height: 300 });
    expect(geometryOf(objects, "child-a")).toEqual({ x: 340, y: 220, width: 100, height: 80 });
    expect(geometryOf(objects, "inner")).toEqual({ x: 480, y: 220, width: 180, height: 180 });
    expect(geometryOf(objects, "child-b")).toEqual({ x: 500, y: 260, width: 100, height: 80 });
    // Untouched objects keep referential identity, not just equal values.
    expect(objects.find((object) => object.id === "loose")).toBe(
      document.objects.find((object) => object.id === "loose")!,
    );
  });

  it("moves a plain object without touching anything else", () => {
    const document = nestedDocument();
    const objects = translateWithDescendants(document, ["child-a"], { dx: 20, dy: 20 });

    expect(geometryOf(objects, "child-a")).toEqual({ x: 260, y: 280, width: 100, height: 80 });
    expect(geometryOf(objects, "outer")).toEqual({ x: 200, y: 200, width: 400, height: 300 });
  });

  it("moves a child listed alongside its own section exactly once", () => {
    const document = nestedDocument();
    const both = translateWithDescendants(
      document,
      ["outer", "child-a", "inner", "child-b", "child-a"],
      { dx: 60, dy: 60 },
    );
    const sectionOnly = translateWithDescendants(document, ["outer"], { dx: 60, dy: 60 });

    expect(both).toEqual(sectionOnly);
    expect(geometryOf(both, "child-a")).toEqual({ x: 300, y: 320, width: 100, height: 80 });
  });

  it("never changes containment — reconcileSectionMembership is an identity after a move", () => {
    const document = nestedDocument();
    expect(reconcileSectionMembership(document)).toBe(document);

    for (const delta of [
      { dx: 1000, dy: 0 },
      { dx: -1000, dy: -1000 },
      { dx: 37, dy: -13 },
    ]) {
      const moved = { ...document, objects: translateWithDescendants(document, ["outer"], delta) };
      // Identity by reference: the reconcile found nothing to change at all.
      expect(reconcileSectionMembership(moved)).toBe(moved);
      expect(moved.objects.map((object) => object.parentId ?? null)).toEqual(
        document.objects.map((object) => object.parentId ?? null),
      );
    }
  });

  it("skips unknown ids and no-op deltas", () => {
    const document = nestedDocument();
    expect(translateWithDescendants(document, ["nope", "gone"], { dx: 20, dy: 20 })).toBe(
      document.objects,
    );
    expect(translateWithDescendants(document, ["outer"], { dx: 0, dy: 0 })).toBe(document.objects);

    const objects = translateWithDescendants(document, ["child-a", "connection-1"], {
      dx: 20,
      dy: 0,
    });
    expect(geometryOf(objects, "child-a").x).toBe(260);
  });

  it("keeps on-grid geometry on-grid for on-grid deltas", () => {
    const document = nestedDocument();
    const objects = translateWithDescendants(document, ["outer"], { dx: 20, dy: -60 });
    for (const id of ["outer", "child-a", "inner", "child-b"]) {
      const geometry = geometryOf(objects, id);
      expect(geometry.x % 20).toBe(0);
      expect(geometry.y % 20).toBe(0);
    }
  });

  it("exposes the closure and root helpers it is built from", () => {
    const document = nestedDocument();
    expect([...moveClosureIds(document, ["outer"])].sort()).toEqual([
      "child-a",
      "child-b",
      "inner",
      "outer",
    ]);
    expect([...moveClosureIds(document, ["loose", "missing"])]).toEqual(["loose"]);
    expect(moveRootIds(document, ["outer", "child-a", "loose"])).toEqual(["outer", "loose"]);
    expect(moveRootIds(document, ["child-a", "child-a", "missing"])).toEqual(["child-a"]);
  });
});

describe("S2.2 spaceOutObjects", () => {
  it("holds the first box and gives every pair the requested clear gap", () => {
    const document = makeDocument([
      box("a", 0, 0, 100, 80),
      box("b", 140, 0, 60, 80),
      box("c", 400, 0, 200, 80),
    ]);
    const spaced = spaceOutObjects(document, ["a", "b", "c"], "horizontal", 40);

    expect(geometryOf(spaced.objects, "a")).toEqual({ x: 0, y: 0, width: 100, height: 80 });
    expect(geometryOf(spaced.objects, "b").x).toBe(140);
    expect(geometryOf(spaced.objects, "c").x).toBe(240);
    // The clear gaps, read back off the result.
    expect(geometryOf(spaced.objects, "b").x - 100).toBe(40);
    expect(geometryOf(spaced.objects, "c").x - (140 + 60)).toBe(40);
  });

  it("sorts by position, not by the order the ids arrive in", () => {
    const document = makeDocument([
      box("a", 0, 0, 100, 80),
      box("b", 500, 0, 100, 80),
      box("c", 250, 0, 100, 80),
    ]);
    const spaced = spaceOutObjects(document, ["b", "c", "a"], "horizontal", 20);

    expect(geometryOf(spaced.objects, "a").x).toBe(0);
    expect(geometryOf(spaced.objects, "c").x).toBe(120);
    expect(geometryOf(spaced.objects, "b").x).toBe(240);
  });

  it("grows the span when the gap is bigger than what is there, and shrinks it when smaller", () => {
    const document = makeDocument([
      box("a", 0, 0, 100, 80),
      box("b", 120, 0, 100, 80),
      box("c", 240, 0, 100, 80),
    ]);
    const opened = spaceOutObjects(document, ["a", "b", "c"], "horizontal", 200);
    expect(geometryOf(opened.objects, "b").x).toBe(300);
    expect(geometryOf(opened.objects, "c").x).toBe(600);

    const closed = spaceOutObjects(document, ["a", "b", "c"], "horizontal", 0);
    expect(geometryOf(closed.objects, "b").x).toBe(100);
    expect(geometryOf(closed.objects, "c").x).toBe(200);
  });

  it("leaves cross-axis positions untouched", () => {
    const document = makeDocument([
      box("a", 0, 17, 100, 80),
      box("b", 200, 333, 100, 80),
    ]);
    const spaced = spaceOutObjects(document, ["a", "b"], "horizontal", 40);
    expect(geometryOf(spaced.objects, "a").y).toBe(17);
    expect(geometryOf(spaced.objects, "b").y).toBe(333);
    expect(geometryOf(spaced.objects, "b").x).toBe(140);
  });

  it("re-pitches vertically off heights", () => {
    const document = makeDocument([
      box("a", 0, 0, 100, 80),
      box("b", 0, 500, 100, 40),
      box("c", 0, 900, 100, 80),
    ]);
    const spaced = spaceOutObjects(document, ["a", "b", "c"], "vertical", 60);
    expect(geometryOf(spaced.objects, "b").y).toBe(140);
    expect(geometryOf(spaced.objects, "c").y).toBe(240);
    expect(geometryOf(spaced.objects, "c").x).toBe(0);
  });

  it("moves sections with their contents and does not re-pitch a listed child inside a listed frame", () => {
    const document = nestedDocument();
    const spaced = spaceOutObjects(document, ["outer", "loose", "child-a"], "horizontal", 100);

    // outer holds (leftmost), loose slides to outer's right edge + 100.
    expect(geometryOf(spaced.objects, "outer")).toEqual({
      x: 200,
      y: 200,
      width: 400,
      height: 300,
    });
    expect(geometryOf(spaced.objects, "loose").x).toBe(700);
    // child-a travels with outer — which held — so it does not move at all.
    expect(geometryOf(spaced.objects, "child-a")).toEqual({
      x: 240,
      y: 260,
      width: 100,
      height: 80,
    });
    expect(reconcileSectionMembership(spaced)).toBe(spaced);
  });

  it("carries descendants when the section itself is the one that slides", () => {
    // `loose` sits left of the frame, so the frame is what re-pitches.
    const document = makeDocument(
      nestedDocument().objects.map((object) =>
        object.id === "loose" ? { ...object, geometry: { ...object.geometry, x: 0 } } : object,
      ),
    );
    const spaced = spaceOutObjects(document, ["outer", "loose"], "horizontal", 40);

    expect(geometryOf(spaced.objects, "loose").x).toBe(0);
    // outer's frame slides from 200 to 100 + 40 = 140: a delta of -60.
    expect(geometryOf(spaced.objects, "outer").x).toBe(140);
    expect(geometryOf(spaced.objects, "child-a").x).toBe(180);
    expect(geometryOf(spaced.objects, "inner").x).toBe(320);
    expect(geometryOf(spaced.objects, "child-b").x).toBe(340);
    expect(reconcileSectionMembership(spaced)).toBe(spaced);
  });

  it("needs two known ids to do anything", () => {
    const document = nestedDocument();
    expect(spaceOutObjects(document, ["loose"], "horizontal", 40)).toBe(document);
    expect(spaceOutObjects(document, ["loose", "missing"], "horizontal", 40)).toBe(document);
    expect(spaceOutObjects(document, ["outer", "child-a"], "horizontal", 40)).toBe(document);
  });

  it("keeps a 20-grid board on the 20 grid for a 20-grid gap", () => {
    const document = makeDocument([
      box("a", 0, 0, 300, 60),
      box("b", 340, 0, 180, 60),
      box("c", 900, 0, 220, 60),
    ]);
    const spaced = spaceOutObjects(document, ["a", "b", "c"], "horizontal", 120);
    for (const object of spaced.objects) {
      expect(object.geometry.x % 20).toBe(0);
      expect(object.geometry.y % 20).toBe(0);
    }
    expect(geometryOf(spaced.objects, "b").x).toBe(420);
    expect(geometryOf(spaced.objects, "c").x).toBe(720);
  });
});

describe("S2.3 alignWithDescendants", () => {
  const edges = [
    ["left", "center_h", "center-x", "right"],
    ["top", "center_v", "center-y", "bottom"],
  ] as const;

  it("matches alignObjects exactly when nothing listed is a section", () => {
    const document = makeDocument([
      box("a", 0, 0, 100, 80),
      box("b", 40, 300, 260, 40),
      box("c", 500, 90, 60, 200),
    ]);
    for (const group of edges) {
      for (const edge of group) {
        const canvasAxis = edge === "center_h" ? "center-x" : edge === "center_v" ? "center-y" : edge;
        expect(alignWithDescendants(document, ["a", "b", "c"], edge)).toEqual(
          alignObjects(document, ["a", "b", "c"], canvasAxis),
        );
      }
    }
  });

  it("aligns a section by its own frame edge and carries its contents", () => {
    const document = nestedDocument();
    const aligned = alignWithDescendants(document, ["outer", "loose"], "left");

    // Bounds start at outer's x (200), so outer holds and loose slides left.
    expect(geometryOf(aligned.objects, "outer").x).toBe(200);
    expect(geometryOf(aligned.objects, "loose").x).toBe(200);
    expect(geometryOf(aligned.objects, "child-a").x).toBe(240);

    const right = alignWithDescendants(document, ["outer", "loose"], "right");
    // Bounds right edge is loose's (900); outer's frame slides by 300.
    expect(geometryOf(right.objects, "outer").x).toBe(500);
    expect(geometryOf(right.objects, "child-a").x).toBe(540);
    expect(geometryOf(right.objects, "inner").x).toBe(680);
    expect(geometryOf(right.objects, "child-b").x).toBe(700);
    // Cross axis untouched.
    expect(geometryOf(right.objects, "child-b").y).toBe(300);
    // The frame's OWN membership is intact — it travelled rigidly. (What the
    // frame now sits on top of is another matter: aligning it right parks it
    // over `loose`, and reconcile will adopt that object exactly as a UI drag
    // to the same place would. Rigid-move invariance is about the moved set.)
    const parents = new Map(
      reconcileSectionMembership(right).objects.map((object) => [
        object.id,
        object.parentId ?? null,
      ]),
    );
    expect(parents.get("child-a")).toBe("outer");
    expect(parents.get("inner")).toBe("outer");
    expect(parents.get("child-b")).toBe("inner");
    expect(parents.get("loose")).toBe("outer");
  });

  it("drops a child listed alongside the section that carries it", () => {
    const document = nestedDocument();
    const withChild = alignWithDescendants(document, ["outer", "child-a", "loose"], "top");
    const withoutChild = alignWithDescendants(document, ["outer", "loose"], "top");
    expect(withChild).toEqual(withoutChild);
    // child-a keeps its offset inside outer rather than being aligned itself.
    expect(geometryOf(withChild.objects, "child-a").y - geometryOf(withChild.objects, "outer").y)
      .toBe(60);
  });

  it("centres frames as one unit", () => {
    const document = nestedDocument();
    const centred = alignWithDescendants(document, ["outer", "loose"], "center_v");
    const outer = geometryOf(centred.objects, "outer");
    const loose = geometryOf(centred.objects, "loose");
    expect(outer.y + outer.height / 2).toBe(loose.y + loose.height / 2);
    expect(geometryOf(centred.objects, "child-a").y - outer.y).toBe(60);
  });

  it("needs two independent roots and skips unknown ids", () => {
    const document = nestedDocument();
    expect(alignWithDescendants(document, ["outer"], "left")).toBe(document);
    expect(alignWithDescendants(document, ["outer", "child-a"], "left")).toBe(document);
    expect(alignWithDescendants(document, ["loose", "connection-1"], "left")).toBe(document);
  });

  it("leaves alignObjects' own behaviour untouched (it still moves only listed ids)", () => {
    const document = nestedDocument();
    const aligned = alignObjects(document, ["outer", "loose"], "right");
    expect(geometryOf(aligned.objects, "outer").x).toBe(500);
    expect(geometryOf(aligned.objects, "child-a").x).toBe(240);
  });
});

describe("S2.4 sectionFitGeometry padding config", () => {
  const document = makeDocument([
    section("frame", 0, 0, 100, 100),
    box("kid-a", 200, 200, 300, 60, { parentId: "frame" }),
    box("kid-b", 560, 320, 180, 100, { parentId: "frame" }),
  ]);

  it("keeps the UI defaults when no config is passed", () => {
    // 24 body / 30 title, then the 4-grid write normalization (D1): the top
    // gap lands within half a normalization step of the nominal 54.
    const fitted = sectionFitGeometry(document, "frame")!;
    expect(200 - fitted.x).toBe(SECTION_FIT_PADDING_PX);
    expect(200 - fitted.y).toBeGreaterThanOrEqual(
      SECTION_FIT_PADDING_PX + SECTION_TITLE_CLEARANCE_PX - 2,
    );
    expect(fitted).toEqual(sectionFitGeometry(document, "frame", SECTION_FIT_PADDING_PX)!);
  });

  it("still accepts a bare number as body padding, meaning the same as { padding }", () => {
    const fitted = sectionFitGeometry(document, "frame", 48)!;
    expect(200 - fitted.x).toBe(48);
    expect(fitted).toEqual(sectionFitGeometry(document, "frame", { padding: 48 })!);
    expect(fitted).toEqual(
      sectionFitGeometry(document, "frame", {
        padding: 48,
        titleClearance: SECTION_TITLE_CLEARANCE_PX,
      })!,
    );
  });

  it("lands entirely on the 20 grid for on-grid children with the agent's 40/40 config", () => {
    const fitted = sectionFitGeometry(document, "frame", { padding: 40, titleClearance: 40 })!;
    expect(fitted).toEqual({ x: 160, y: 120, width: 620, height: 340 });
    for (const value of [fitted.x, fitted.y, fitted.width, fitted.height]) {
      expect(value % 20).toBe(0);
    }
    // The air actually delivered: 40 on the body edges, 40 + 40 above the
    // first child (the title band plus the body rung).
    expect(200 - fitted.x).toBe(40);
    expect(200 - fitted.y).toBe(80);
    expect(fitted.x + fitted.width - (560 + 180)).toBe(40);
    expect(fitted.y + fitted.height - (320 + 100)).toBe(40);
  });

  it("clears the title chip by more than the UI's own clearance", () => {
    // TITLE_CHIP is 3px inset + 27px tall = 30 (SECTION_TITLE_CLEARANCE_PX).
    expect(40).toBeGreaterThan(SECTION_TITLE_CLEARANCE_PX);
    expect(40).toBeGreaterThan(SECTION_FIT_PADDING_PX);
  });
});
