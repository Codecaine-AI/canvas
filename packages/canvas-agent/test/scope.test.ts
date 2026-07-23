import { describe, expect, test } from "bun:test";

import { fitScope, parseSketch, serializeSketch } from "../src/pipeline";
import { loadCanvasBoards } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

/** The scope picks the first half of a board's non-section objects. */
function scopePick(objects: { id: string; type: string }[]): string[] {
  const boxes = objects.filter((object) => object.type !== "section");
  return boxes.slice(0, Math.max(2, Math.ceil(boxes.length / 2))).map((object) => object.id);
}

describe("fitScope on real boards", () => {
  for (const { file, document } of loadCanvasBoards()) {
    test(`${file} scoped program round-trips byte-exactly`, () => {
      const scope = fitScope(document, scopePick(document.objects));
      const parsed = parseSketch(scope.program);
      expect(JSON.stringify(parsed)).toBe(JSON.stringify(scope.sketch));
      expect(serializeSketch(parsed)).toBe(scope.program);
    });

    test(`${file} boundary refs are quoted raw ids that parse back`, () => {
      const scope = fitScope(document, scopePick(document.objects));
      const parsed = parseSketch(scope.program);
      const inside = new Set(scope.scopeObjectIds);
      for (const boundary of scope.boundary.connections) {
        // The outside endpoint appears in the program as its JSON-quoted id…
        expect(scope.program).toContain(JSON.stringify(boundary.outsideId));
        // …and parses back to the same raw id in the edge list.
        expect(parsed.edges.some((edge) => (
          edge.from === boundary.outsideId || edge.to === boundary.outsideId
        ))).toBe(true);
        // Exactly one endpoint is in scope.
        expect(inside.has(boundary.insideId)).toBe(true);
        expect(inside.has(boundary.outsideId)).toBe(false);
        // Every quoted outside id is described in the legend.
        expect(scope.legend.outside.some((ref) => ref.id === boundary.outsideId)).toBe(true);
      }
    });

    test(`${file} legend ordinals match the program's declarations`, () => {
      const scope = fitScope(document, scopePick(document.objects));
      const declared = [...scope.program.matchAll(/(?:item|section) (\d+) text=/g)]
        .map((match) => Number(match[1]));
      expect(declared).toEqual(scope.legend.items.map((entry) => entry.ordinal));
      expect(declared).toEqual(declared.map((_, index) => index + 1));
      const documentIds = new Set(document.objects.map((object) => object.id));
      for (const entry of scope.legend.items) {
        expect(documentIds.has(entry.id)).toBe(true);
      }
    });
  }
});

describe("fitScope legend and boundary (synthetic)", () => {
  const document = makeDocument(
    [
      box("a", 0, 0),
      box("b", 0, 160),
      box("c", 400, 0),
      box("d", 0, -300),
    ],
    [connect("k1", "a", "c"), connect("k2", "d", "b"), connect("k3", "a", "b")],
  );
  const scope = fitScope(document, ["a", "b"]);

  test("frame is the selection's bounding rect", () => {
    expect(scope.frame).toEqual({ x: 0, y: 0, width: 160, height: 256 });
    expect(scope.boundary.frame).toEqual(scope.frame);
  });

  test("boundary connections carry direction and quoted outside ids", () => {
    expect(scope.boundary.connections).toEqual([
      { connectionId: "k1", insideId: "a", outsideId: "c", direction: "outbound" },
      { connectionId: "k2", insideId: "b", outsideId: "d", direction: "inbound" },
    ]);
    expect(scope.program).toContain('"c"');
    expect(scope.program).toContain('"d"');
    // The interior arrow stays numeric (no quotes around a or b refs).
    const arrowLines = scope.program.split("\n").filter((line) => line.startsWith("  ") && line.includes(">"));
    expect(arrowLines.some((line) => !line.includes('"'))).toBe(true);
  });

  test("legend describes outside refs with frame sides", () => {
    const sides = Object.fromEntries(scope.legend.outside.map((ref) => [ref.id, ref.side]));
    expect(sides).toEqual({ c: "E", d: "N" });
  });

  test("nearest outside neighbors per frame side", () => {
    const bySide = Object.fromEntries(scope.boundary.neighbors.map((n) => [n.side, n]));
    expect(bySide.E).toMatchObject({ id: "c", distance: 240 });
    expect(bySide.N).toMatchObject({ id: "d", distance: 204 });
    expect(bySide.S).toBeUndefined();
    expect(bySide.W).toBeUndefined();
  });

  test("legend items cover exactly the scoped objects", () => {
    expect(scope.scopeObjectIds.sort()).toEqual(["a", "b"]);
    expect(scope.legend.items.map((entry) => entry.id).sort()).toEqual(["a", "b"]);
    const a = scope.legend.items.find((entry) => entry.id === "a")!;
    expect(a).toMatchObject({ type: "rectangle", text: "a", width: 160, height: 96 });
  });
});

describe("fitScope ring 2 (coupled outsiders)", () => {
  test("an outside tier member rides along as a quoted pin", () => {
    // Four same-register boxes with mixed widths (so no grid lattice forms
    // and the row is too long for one leaf — the fitter splits it into
    // groups and detects the shared y register as a tier).
    const document = makeDocument([
      box("e1", 0, 0, 160),
      box("e2", 400, 0, 200),
      box("e3", 900, 0, 160),
      box("e4", 1300, 0, 200),
    ]);
    const scope = fitScope(document, ["e1", "e2"]);
    // The full-document y-register tier couples e3/e4; they appear quoted in
    // the align line, never as movable items.
    expect(scope.sketch.tiers).toHaveLength(1);
    expect(scope.sketch.tiers[0]!.members).toEqual(["e1", "e2", "e3", "e4"]);
    expect(scope.program).toContain('align y: 1 2 "e3" "e4"');
    expect(scope.legend.items.map((entry) => entry.id)).not.toContain("e3");
    expect(scope.legend.outside).toEqual([
      expect.objectContaining({ id: "e3", side: "E" }),
      expect.objectContaining({ id: "e4", side: "E" }),
    ]);
    // Round-trips byte-exactly with the quoted pin.
    expect(serializeSketch(parseSketch(scope.program))).toBe(scope.program);
  });
});

describe("fitScope whole sections", () => {
  test("a scoped section pulls in its derived members with section semantics", () => {
    const document = makeDocument([
      box("wrap", 0, 0, 640, 480, "section"),
      box("m1", 64, 96),
      box("m2", 320, 96),
      box("outsider", 1000, 0),
    ]);
    const scope = fitScope(document, ["wrap"]);
    expect(scope.scopeObjectIds.sort()).toEqual(["m1", "m2", "wrap"]);
    expect(scope.program).toContain("section 1 text=wrap");
    expect(serializeSketch(parseSketch(scope.program))).toBe(scope.program);
    // Frame covers the section rect.
    expect(scope.frame).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });

  test("unknown scope ids throw", () => {
    const document = makeDocument([box("a", 0, 0)]);
    expect(() => fitScope(document, ["nope"])).toThrow(/unknown object id/);
    expect(() => fitScope(document, [])).toThrow(/at least one object/);
  });
});
