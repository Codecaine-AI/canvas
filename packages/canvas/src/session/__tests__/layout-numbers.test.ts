import { describe, expect, test } from "bun:test";

import { layoutBlock, layoutNumbers } from "../../board/layout-numbers";
import { box, connect, makeDocument } from "./synthetic";

describe("layout numbers", () => {
  test("name the crossing pairs, the sections a wire crosses holding neither end, and the longest wires", () => {
    // v is pinned straight down x=180, through the band section between its
    // ends, and crosses h, which runs left → right along y=448.
    const document = makeDocument(
      [
        box("top", 100, 0), box("bottom", 100, 800),
        box("left", -400, 400), box("right", 600, 400),
        box("band", -600, 300, 1400, 300, "section"),
      ],
      [{ ...connect("v", "top", "bottom"), waypoints: [[180, 500]] }, connect("h", "left", "right")],
    );

    const numbers = layoutNumbers(document);

    expect(numbers.crossings).toBe(1);
    expect(numbers.crossingPairs).toBe(1);
    expect(numbers.topCrossingPairs).toEqual([{ a: "v", b: "h", crossings: 1 }]);
    // h's ends sit inside the band's rect but are not its children, so the
    // band holds neither end of either wire.
    expect(numbers.topTraversals.map((entry) => [entry.wire, entry.section])).toEqual([
      ["h", "band"],
      ["v", "band"],
    ]);
    expect(numbers.longestWires.map((wire) => wire.wire)).toEqual(["h", "v"]);
    expect(Math.round(numbers.wireLength)).toBe(
      Math.round(numbers.longestWires.reduce((total, wire) => total + wire.length, 0)),
    );

    const block = layoutBlock(numbers);
    expect(block.split("\n")[0]).toMatch(/^LAYOUT · wire length \d+px · 1 crossing \(1 wire pair\)$/);
    expect(block).toContain("crossing pairs: v × h 1");
    expect(block).toContain("through a section holding neither end: h through band");
    expect(block).toContain("longest wires: h ");
  });

  test("a section that holds an end is not a traversal, and wires sharing an end never count as crossing", () => {
    const document = makeDocument(
      [
        box("frame", 0, 0, 1200, 600, "section"),
        { ...box("a", 40, 80), parentId: "frame" },
        { ...box("b", 800, 80), parentId: "frame" },
        { ...box("c", 400, 400), parentId: "frame" },
      ],
      [connect("ab", "a", "b"), connect("ac", "a", "c"), connect("cb", "c", "b")],
    );

    const numbers = layoutNumbers(document);

    expect(numbers.crossings).toBe(0);
    expect(numbers.topTraversals).toEqual([]);
    expect(layoutBlock(numbers)).not.toContain("crossing pairs:");
  });
});
