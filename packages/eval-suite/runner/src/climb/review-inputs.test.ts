import { describe, expect, test } from "bun:test";

import { box, labelled, wire } from "./fixtures/review/stubs.ts";
import { borderRuns, choicesLines, closeLanes, outerEdgeRuns, reviewUnits, sectionGaps, spaceLines, untagWires, wireMeasureLines, type Board } from "./review-inputs.ts";

describe("climb review measures of wires", () => {
  const section = [box("s", "section", null, 100, 100, 400, 300)];

  test("a wire runs along a border when it stays within 24 px of it for 100 px or more, inside or outside the section", () => {
    expect(borderRuns([wire("w", "a", "b", [[150, 110], [450, 110]])], section))
      .toEqual([{ wire: "w", section: "s", side: "top", distance: 10, length: 300, from: { x: 150, y: 110 }, to: { x: 450, y: 110 } }]);
    // Outside the section, and longer than its side: the stretch is the part beside the border.
    expect(borderRuns([wire("w", "a", "b", [[50, 90], [600, 90]])], section))
      .toEqual([{ wire: "w", section: "s", side: "top", distance: 10, length: 400, from: { x: 100, y: 90 }, to: { x: 500, y: 90 } }]);
    expect(borderRuns([wire("w", "a", "b", [[110, 0], [110, 500]])], section)).toMatchObject([{ side: "left", distance: 10, length: 300 }]);
    expect(borderRuns([wire("w", "a", "b", [[480, 150], [480, 350], [520, 350]])], section)).toMatchObject([{ side: "right", distance: 20, length: 200 }]);
    // 30 px off, 90 px long, and a wire that only crosses the border.
    expect(borderRuns([wire("far", "a", "b", [[150, 130], [450, 130]]), wire("brief", "a", "b", [[150, 110], [240, 110]]), wire("cross", "a", "b", [[300, 0], [300, 200]])], section)).toEqual([]);
  });

  test("2 wires in close lanes are found with the node they share, and a merged trunk is not a lane", () => {
    const pair = (yB: number, extra: { toB?: string; fromB?: string; fromX?: number } = {}) => closeLanes([
      wire("a", "x", "n", [[0, 100], [300, 100]]), wire("b", extra.fromB ?? "y", extra.toB ?? "n", [[extra.fromX ?? 0, yB], [300, yB]]),
    ], 40, 60);
    expect(pair(120)).toEqual([{ wire: "a", other: "b", distance: 20, length: 300, shared: { end: "target", id: "n" }, from: { x: 0, y: 100 }, to: { x: 300, y: 100 } }]);
    expect(pair(120, { toB: "m", fromB: "x" })).toMatchObject([{ shared: { end: "source", id: "x" } }]);
    expect(pair(120, { toB: "m" })).toMatchObject([{ shared: null }]);
    // Ford kept merged junctions: wires on one line are one trunk.
    expect(pair(100)).toEqual([]);
    // Too far apart, and side by side for under 60 px.
    expect(pair(150)).toEqual([]);
    expect(pair(120, { fromX: 250 })).toEqual([]);
  });

  const twoSections: Board = {
    objects: [
      box("s1", "section", null, 100, 100, 300, 300), box("s2", "section", null, 600, 100, 300, 300),
      box("a", "rectangle", "s1", 150, 150), box("b", "rectangle", "s2", 700, 150), box("c", "rectangle", null, 0, 500), box("d", "rectangle", null, 500, 500),
    ],
    connections: [],
  };

  test("a wire runs along the board's outer edge when it goes round the sections with nothing beyond it", () => {
    const round = wire("round", "a", "b", [[200, 150], [200, 40], [750, 40], [750, 150]]);
    expect(outerEdgeRuns([round], twoSections, null)).toEqual([{ wire: "round", side: "top", length: 550, from: { x: 200, y: 40 }, to: { x: 750, y: 40 } }]);
    // A wire in the gutter has a section on each side of it.
    expect(outerEdgeRuns([wire("gutter", "a", "b", [[250, 200], [500, 200], [500, 300], [700, 300]])], twoSections, null)).toEqual([]);
    // A straight wire between 2 loose items below the sections is on the line of its own ends: no detour.
    expect(outerEdgeRuns([wire("direct", "c", "d", [[100, 550], [500, 550]])], twoSections, null)).toEqual([]);
    expect(outerEdgeRuns([wire("below", "a", "b", [[200, 250], [200, 700], [750, 700], [750, 250]])], twoSections, null)).toMatchObject([{ side: "bottom", length: 550 }]);
  });

  test("the measures of a wire sheet name each wire by its tag, with the numbers and the place of each fact", () => {
    const page = box("page", "section", null, 0, 0, 1200, 600);
    const board: Board = {
      objects: [page, box("s", "section", "page", 100, 100, 400, 300), box("t", "section", "page", 700, 100, 300, 300), box("n", "rectangle", "t", 800, 150)],
      connections: [],
    };
    const rows = [
      wire("hug", "a", "n", [[150, 110], [450, 110]]),
      wire("head", "a", "n", [[750, 50], [750, 150]]),
      wire("frame", "a", "t", [[600, 250], [700, 250]]),
      wire("l1", "p", "n", [[520, 300], [640, 300]]),
      wire("l2", "q", "n", [[520, 320], [640, 320]]),
      wire("edge", "a", "n", [[150, 10], [450, 10]]),
    ].map((fact, index) => ({ tag: `W${index + 1}`, kind: "s → t", fact }));
    expect(wireMeasureLines(rows, { board, pageFrame: page, headers: new Map([["t", { x: 700, y: 100, width: 120, height: 28 }]]) })).toEqual([
      "W1 hug runs 300 px at 10 px from the top border of section s, from (150, 110) to (450, 110)",
      "W6 edge runs 300 px at 10 px from the top border of the board frame page, from (150, 10) to (450, 10)",
      "W6 edge runs 300 px along the outer top edge of the board, from (150, 10) to (450, 10): no object lies beyond it",
      "W2 head runs through the header chip of section t (x 700 to 820, y 100 to 128)",
      "W3 frame ends on the frame of section t at (700, 250), not on a node",
      "W4 l1 and W5 l2 both end on n and run 120 px in 2 lanes 20 px apart, from (520, 300) to (640, 300)",
    ]);
    // A clean sheet has no measure.
    expect(wireMeasureLines([{ tag: "W1", kind: "s → t", fact: wire("ok", "a", "n", [[500, 200], [800, 200]]) }], { board, pageFrame: page, headers: new Map() })).toEqual([]);
  });

  test("a finding names its wires by id: the tags of the reviewer's own wire sheet are not in the text the drawer reads", () => {
    const rows = ["e-auth", "e-live", "e-out"].map((id, index) => ({ tag: `W${index + 1}`, kind: "s → t", fact: wire(id, "a", "b", [[0, 0], [10, 0]]) }));
    expect(untagWires("W1 crosses W3 at (120, 740). The trunk W2+W3 runs 300 px. W30 and SW1 stay.", rows))
      .toBe("e-auth crosses e-out at (120, 740). The trunk e-live+e-out runs 300 px. W30 and SW1 stay.");
  });
});

describe("climb review measures of space", () => {
  const sections = (...boxes: Array<[string, number, number, number, number, (string | null)?]>): Board =>
    ({ objects: boxes.map(([id, x, y, width, height, parent]) => box(id, "section", parent ?? null, x, y, width, height)), connections: [] });
  const gaps = (board: Board, facts = [] as ReturnType<typeof wire>[]) => sectionGaps(reviewUnits(board).units, facts);
  const along = (id: string, x: number) => wire(id, "p", "q", [[250, 50], [x, 50], [x, 300], [400, 300]]);

  test("2 sections that face each other with no section between them have a gap: its width, its gutter and the wires along it", () => {
    const board = sections(["a", 0, 0, 300, 400], ["b", 360, 0, 300, 400], ["c", 0, 500, 300, 200]);
    expect(gaps(board, [along("w1", 320), labelled("across", "p", "q", [[250, 200], [400, 200]], "calls", 310, 190)])).toEqual([
      { a: "a", b: "b", side: "side by side", gap: 60, gutter: { x: 300, y: 0, width: 60, height: 400 }, wires: ["w1"], chips: 1, tight: false },
      { a: "a", b: "c", side: "stacked", gap: 100, gutter: { x: 0, y: 400, width: 300, height: 100 }, wires: [], chips: 0, tight: false },
    ]);
  });

  test("a gap is tight when more than 1 wire per 40 px of its width runs along it", () => {
    const board = sections(["a", 0, 0, 300, 400], ["b", 360, 0, 300, 400]);
    expect(gaps(board, [along("w1", 320)]).map((gap) => gap.tight)).toEqual([false]);
    expect(gaps(board, [along("w1", 320), along("w2", 340)])).toMatchObject([{ gap: 60, wires: ["w1", "w2"], tight: true }]);
    // 2 wires fit a gap of 80 px.
    expect(gaps(sections(["a", 0, 0, 300, 400], ["b", 380, 0, 300, 400]), [along("w1", 320), along("w2", 340)])).toMatchObject([{ gap: 80, tight: false }]);
  });

  test("sections with a section between them, a section and one it holds, and sections that do not face each other have no gap", () => {
    expect(gaps(sections(["a", 0, 0, 300, 400], ["m", 360, 0, 300, 400], ["b", 720, 0, 300, 400])).map((gap) => `${gap.a}-${gap.b}`)).toEqual(["a-m", "m-b"]);
    expect(gaps(sections(["outer", 0, 0, 600, 400], ["inner", 40, 40, 200, 200, "outer"]))).toEqual([]);
    expect(gaps(sections(["a", 0, 0, 300, 300], ["b", 400, 400, 300, 300]))).toEqual([]);
  });

  test("the space reviewer reads which sections talk, whether they are neighbours, each long wire and each sink", () => {
    const board: Board = {
      objects: [
        box("a", "section", null, 0, 0, 300, 400), box("m", "section", null, 360, 0, 300, 400), box("b", "section", null, 720, 0, 300, 400),
        box("a1", "rectangle", "a", 100, 50), box("a2", "rectangle", "a", 100, 250), box("m1", "rectangle", "m", 460, 50),
        box("b1", "rectangle", "b", 820, 50, 100, 100, { text: "Store" }), box("k", "rectangle", null, 0, 600),
      ],
      connections: [],
    };
    const facts = [
      wire("w1", "a1", "b1", [[200, 100], [820, 100]], { length: 900, bends: 2 }), wire("w2", "a2", "b1", [[200, 300], [820, 300]], { length: 950 }),
      wire("w3", "m1", "b1", [[560, 120], [820, 120]], { length: 200 }), wire("w4", "a1", "m1", [[200, 80], [460, 80]], { length: 150 }),
      wire("w5", "k", "b1", [[100, 650], [870, 650]], { length: 1000 }),
    ];
    expect(spaceLines(reviewUnits(board).units, facts, board)).toEqual({
      shape: "1020 × 700 px, aspect ratio 1.46 : 1",
      gaps: [
        "a ↔ m · side by side · gap 60 px · gutter x 300 to 360, y 0 to 400 · 0 wires run along it · 0 label chips in it",
        "m ↔ b · side by side · gap 60 px · gutter x 660 to 720, y 0 to 400 · 0 wires run along it · 0 label chips in it",
      ],
      // Most wires first: a and b talk most, and m sits between them.
      pairs: [
        "a ↔ b · 2 wires · 1850 px of wire in total · NOT neighbours: m lies between them",
        "b ↔ loose · 1 wire · 1000 px of wire in total · one end is a loose item",
        "b ↔ m · 1 wire · 200 px of wire in total · neighbours, side by side, gap 60 px",
        "a ↔ m · 1 wire · 150 px of wire in total · neighbours, side by side, gap 60 px",
      ],
      long: ["w5 · k (loose) → b1 (b) · 1000 px · 0 bends", "w2 · a2 (a) → b1 (b) · 950 px · 0 bends", "w1 · a1 (a) → b1 (b) · 900 px · 2 bends"],
      sinks: [`b1 "Store" in b · 4 wires in from a, m, loose · mean 763 px · longest 1000 px`],
    });
  });

  test("a tight gap is marked for the space reviewer", () => {
    const board = sections(["a", 0, 0, 300, 400], ["b", 360, 0, 300, 400]);
    expect(spaceLines(reviewUnits(board).units, [along("w1", 320), along("w2", 340)], board).gaps)
      .toEqual(["a ↔ b · side by side · gap 60 px · gutter x 300 to 360, y 0 to 400 · 2 wires run along it · 0 label chips in it · TIGHT: more than 1 wire per 40 px of gap"]);
  });
});

describe("climb review measures of choices", () => {
  const board = (colourOfP2: string, gears: number): Board => ({
    objects: [
      box("p1", "section", null, 0, 0, 400, 400, { color: "gray", text: "Engine" }), box("p2", "section", null, 500, 0, 400, 400, { color: colourOfP2, text: "Store" }),
      ...["A", "B", "C", "D"].map((text, index) => box(`n${index + 1}`, "rectangle", "p1", 50, 50 + 80 * index, 100, 60, { text, ...(index < gears ? { icon: "gear" } : {}) })),
      box("n5", "rectangle", "p2", 550, 50, 100, 60, { color: "blue", style: { shape: "cylinder" }, text: "Traces" }),
    ],
    connections: [],
  });
  const facts = [wire("w", "n1", "n5", [[150, 80], [550, 80]], { label: "writes" }), wire("v", "n2", "n5", [[150, 160], [550, 160]], { style: "dashed", colour: "violet" })];

  test("the choices reviewer reads each object's kind, shape, icon and colour with its section's colour, and each wire's label and style", () => {
    const lines = choicesLines(board("gray", 4), facts);
    expect(lines.objects).toEqual([
      `p1 · section · shape - · no icon · gray · in board · "Engine"`,
      `p2 · section · shape - · no icon · gray · in board · "Store"`,
      `n1 · rectangle · shape - · icon gear · no colour · in p1 (gray) · "A"`,
      `n2 · rectangle · shape - · icon gear · no colour · in p1 (gray) · "B"`,
      `n3 · rectangle · shape - · icon gear · no colour · in p1 (gray) · "C"`,
      `n4 · rectangle · shape - · icon gear · no colour · in p1 (gray) · "D"`,
      `n5 · rectangle · shape cylinder · no icon · blue · in p2 (gray) · "Traces"`,
    ]);
    expect(lines.wires).toEqual([`w · n1 → n5 · "writes" · solid default`, "v · n2 → n5 · no label · dashed violet"]);
  });

  test("it counts what repeats: sections of one colour, sibling sections all of one colour, nodes of one look, one icon on 4 nodes or more", () => {
    expect(choicesLines(board("gray", 4), facts).counts).toEqual([
      "2 sections have colour gray: p1, p2",
      "The 2 sibling sections in the board all have colour gray: p1, p2",
      "4 of 5 nodes are rectangle, shape -, no colour",
      "1 of 5 nodes are rectangle, shape cylinder, blue",
      `Icon gear is on 4 nodes: n1 "A", n2 "B", n3 "C", n4 "D"`,
      "1 of 5 nodes have no icon",
    ]);
    // Sibling sections with 2 colours, and an icon on 3 nodes, are not listed.
    expect(choicesLines(board("blue", 3), facts).counts).toEqual([
      "1 section has colour gray: p1",
      "1 section has colour blue: p2",
      "4 of 5 nodes are rectangle, shape -, no colour",
      "1 of 5 nodes are rectangle, shape cylinder, blue",
      "2 of 5 nodes have no icon",
    ]);
  });
});
