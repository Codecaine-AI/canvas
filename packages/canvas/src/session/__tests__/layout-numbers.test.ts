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
    expect(block.split("\n")[0]).toMatch(/^LAYOUT · wire length \d+px · 1 crossing \(1 wire pair\) · 0 labels without a clear spot$/);
    expect(block).toContain("crossing pairs: v × h 1");
    expect(block).toContain("through a section holding neither end: h through band");
    expect(block).toContain("longest wires: h ");
  });

  test("a section that holds an end is not a traversal, and wires that only meet at their shared end do not cross", () => {
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

  test("two wires from one node that cross away from it count as a crossing", () => {
    // hp leaves hub's right side and drops down x=480 into p's top; hq leaves
    // hub's bottom and runs along y=348 into q's left: they cross at
    // (480, 348), far from hub.
    const document = makeDocument(
      [box("hub", 0, 0), box("p", 400, 400), box("q", 600, 300)],
      [
        { id: "hp", from: { objectId: "hub", anchor: "right" }, to: { objectId: "p", anchor: "top" } },
        { id: "hq", from: { objectId: "hub", anchor: "bottom" }, to: { objectId: "q", anchor: "left" } },
      ],
    );

    const numbers = layoutNumbers(document);

    expect(numbers.crossings).toBe(1);
    expect(numbers.topCrossingPairs).toEqual([{ a: "hp", b: "hq", crossings: 1 }]);
  });

  test("count the label chips that found no clear spot, by wire", () => {
    // a and b sit 64px apart: no spot on e's wire holds its chip clear of both
    // ends. f has room, so its chip is clear.
    const document = makeDocument(
      [box("a", 0, 0), box("b", 224, 0), box("c", 0, 400), box("d", 800, 400)],
      [
        { ...connect("e", "a", "b"), label: "connect()" },
        { ...connect("f", "c", "d"), label: "go" },
      ],
    );
    const numbers = layoutNumbers(document);
    expect(numbers.blockedLabels).toEqual(["e"]);
    const block = layoutBlock(numbers);
    expect(block.split("\n")[0]).toEndWith("· 1 label without a clear spot");
    expect(block).toContain("labels without a clear spot: e");
  });
});
