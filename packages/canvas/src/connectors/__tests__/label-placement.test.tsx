/**
 * Label placement: the renderer keeps a wire's chip off boxes, chips and
 * other wires when its own wire has a clear stretch, and every chip consumer
 * (stage Connector, static SVG, painted bounds, chipFor) draws or
 * judges the chip at that one placed point.
 */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useTableBackend } from "@codecaine-ai/text-measure";
import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";
import { chipFor } from "../../board/lints/geometry";
import { connectionPaintedBounds } from "../../render/painted-bounds";
import { renderDocumentToSvg } from "../../render/static-svg";
import { Connector } from "../Connector";
import { connectionLabelChipMetrics } from "../label-chip";
import { ARROW_KEEP_OUT_PX, blockedLabelIds, placeConnectionLabels, routedConnectionIn } from "../label-placement";
import { FIGJAM_CANVAS_STYLE } from "../../theme/canvas-style";

function box(id: string, x: number, y: number, width = 100, height = 60): InteractiveCanvasObject {
  return { id, type: "process", text: id, geometry: { x, y, width, height } };
}

function wire(
  id: string, from: string, to: string, label?: string,
  extra: Partial<InteractiveCanvasConnection> = {},
): InteractiveCanvasConnection {
  const horizontal = from === "a";
  return {
    id,
    from: { objectId: from, anchor: horizontal ? "right" : "bottom" },
    to: { objectId: to, anchor: horizontal ? "left" : "top" },
    label,
    ...extra,
  };
}

function doc(objects: InteractiveCanvasObject[], connections: InteractiveCanvasConnection[]): InteractiveCanvasDocument {
  return { id: "doc", title: "doc", objects, connections, annotations: [] } as unknown as InteractiveCanvasDocument;
}

/** a → b: one straight horizontal run, y = 30 from x = 100 to x = 500, midpoint (300, 30). */
const A = box("a", 0, 0);
const B = box("b", 500, 0);
/** A box just under the midpoint: the mid chip (26px high) dips 3px into its top. */
const UNDER_MIDDLE = box("c", 260, 40, 80, 40);

describe("placeConnectionLabels", () => {
  it("moves a chip off a box onto a clear stretch of its own wire", () => {
    const document = doc([A, B, UNDER_MIDDLE], [wire("ab", "a", "b", "request")]);
    const point = placeConnectionLabels(document).get("ab")!;
    expect(point.y).toBe(30);
    const { width } = connectionLabelChipMetrics("request");
    // Clear of c (x 260..340) and of both endpoint boxes.
    expect(point.x - width / 2 >= 340 || point.x + width / 2 <= 260).toBe(true);
    expect(point.x - width / 2).toBeGreaterThan(100);
    expect(point.x + width / 2).toBeLessThan(500);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("moves a chip off another wire that crosses its midpoint", () => {
    // d → e runs straight down x = 300, through the a → b midpoint.
    const document = doc(
      [A, B, box("d", 250, -200), box("e", 250, 200)],
      [wire("ab", "a", "b", "request"), wire("de", "d", "e")],
    );
    const point = placeConnectionLabels(document).get("ab")!;
    expect(point.x).not.toBe(300);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("places chips in document order so a later chip never lands on an earlier one", () => {
    // Two parallel runs 20px apart (y = 10 and y = 30) with the same
    // midpoint x: the two 26px chips would overlap there.
    const document = doc(
      [box("a", 0, 0, 100, 20), box("c", 0, 20, 100, 20), box("b", 500, 0, 100, 20), box("d", 500, 20, 100, 20)],
      [wire("ab", "a", "b", "first"), wire("cd", "a", "b", "second", {
        from: { objectId: "c", anchor: "right" },
        to: { objectId: "d", anchor: "left" },
      })],
    );
    const placed = placeConnectionLabels(document);
    expect(placed.get("ab")).toEqual({ x: 300, y: 10 });
    expect(placed.get("cd")!.y).toBe(30);
    expect(placed.get("cd")!.x).not.toBe(300);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("keeps a clear chip at its midpoint", () => {
    const document = doc([A, B], [wire("ab", "a", "b", "request")]);
    expect(placeConnectionLabels(document).get("ab")).toEqual({ x: 300, y: 30 });
  });

  it("keeps a clear pin exactly where the drawer put it", () => {
    const document = doc([A, B], [wire("ab", "a", "b", "request", { labelPosition: { along: 0.3, offset: 20 } })]);
    expect(placeConnectionLabels(document).get("ab")).toEqual({ x: 220, y: 10 });
  });

  it("moves a pin that covers a box to the clear spot nearest the pin", () => {
    const document = doc(
      [A, B, UNDER_MIDDLE],
      [wire("ab", "a", "b", "request", { labelPosition: { along: 0.5 } })],
    );
    const point = placeConnectionLabels(document).get("ab")!;
    const { width } = connectionLabelChipMetrics("request");
    expect(point.x - width / 2 >= 340 || point.x + width / 2 <= 260).toBe(true);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("keeps the least-bad point when the wire has no clear stretch", () => {
    // A 40px wire cannot hold a 73px chip clear of both endpoint boxes. The
    // midpoint covers a sliver of each, less than sliding onto either one.
    const document = doc([A, box("b", 140, 0)], [wire("ab", "a", "b", "request")]);
    expect(placeConnectionLabels(document).get("ab")).toEqual({ x: 120, y: 30 });
    expect(blockedLabelIds(document)).toEqual(["ab"]);
  });

  it("finds a clear gap narrower than the sampling step", () => {
    // Two boxes under the wire leave a 4px window of clear centers, x 214..218.
    const { width } = connectionLabelChipMetrics("request");
    const left = box("left", 100, 40, 216 - width / 2 - 2 - 100, 40);
    const right = box("right", 216 + width / 2 + 2, 40, 500 - (216 + width / 2 + 2), 40);
    const document = doc([A, B, left, right], [wire("ab", "a", "b", "request")]);
    const point = placeConnectionLabels(document).get("ab")!;
    expect(point.x - width / 2).toBeGreaterThanOrEqual(left.geometry.x + left.geometry.width);
    expect(point.x + width / 2).toBeLessThanOrEqual(right.geometry.x);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("finds a gap between two wires the chip may overlap by up to 8px", () => {
    // Two wires end under the chip from the left and the right. A chip may
    // run over each by 8px, which leaves clear centers x 214..218 only. Each
    // wire is a U between a and b (bends through a box fall back to auto
    // routing), so its run at y 42 stays where it is pinned.
    const { width } = connectionLabelChipMetrics("request");
    const lx = 214 - width / 2 + 7;
    const rx = 218 + width / 2 - 7;
    const objects = [A, B, box("l0", 60, 300), box("l1", lx - 50, 200), box("r0", rx - 50, 200), box("r1", 420, 300)];
    const connections: InteractiveCanvasConnection[] = [
      wire("ab", "a", "b", "request"),
      { id: "left", from: { objectId: "l0", anchor: "top" }, to: { objectId: "l1", anchor: "top" }, waypoints: [[110, 42], [lx, 42]] },
      { id: "right", from: { objectId: "r0", anchor: "top" }, to: { objectId: "r1", anchor: "top" }, waypoints: [[rx, 42], [470, 42]] },
    ];
    const document = doc(objects, connections);
    const point = placeConnectionLabels(document).get("ab")!;
    expect(point.x).toBeGreaterThanOrEqual(214);
    expect(point.x).toBeLessThanOrEqual(218);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("places again when the measuring backend changes the chip's width", async () => {
    // The table backend measures this figjam chip about 10px wider than
    // HarfBuzz, so a box 1px right of the narrow chip's edge blocks only the
    // wide one at the midpoint.
    const label = "ÁVÁVÁVÁV";
    const hbWidth = connectionLabelChipMetrics(label, FIGJAM_CANVAS_STYLE).width;
    const document = doc([A, B, box("c", 300 + hbWidth / 2 + 1, 40, 80, 40)], [wire("ab", "a", "b", label)]);
    try {
      useTableBackend();
      expect(connectionLabelChipMetrics(label, FIGJAM_CANVAS_STYLE).width).toBeGreaterThan(hbWidth + 2);
      const table = placeConnectionLabels(document, FIGJAM_CANVAS_STYLE).get("ab")!;
      await useHarfBuzz();
      const fresh = placeConnectionLabels({ ...document, objects: [...document.objects] }, FIGJAM_CANVAS_STYLE).get("ab")!;
      expect(fresh).not.toEqual(table);
      expect(placeConnectionLabels(document, FIGJAM_CANVAS_STYLE).get("ab")).toEqual(fresh);
    } finally {
      await useHarfBuzz();
    }
  });

  it("keeps a colliding pin when its wire has no clear spot", () => {
    const document = doc(
      [A, box("b", 140, 0)],
      [wire("ab", "a", "b", "request", { labelPosition: { along: 0.25 } })],
    );
    expect(placeConnectionLabels(document).get("ab")).toEqual({ x: 110, y: 30 });
  });
});

function section(id: string, x: number, y: number, width: number, height: number): InteractiveCanvasObject {
  return { id, type: "section", text: id, geometry: { x, y, width, height } };
}

/** Whether the chip for `label` centered on `point` has `x` strictly inside its width. */
function straddlesX(label: string, point: { x: number }, x: number): boolean {
  const { width } = connectionLabelChipMetrics(label);
  return point.x - width / 2 < x && x < point.x + width / 2;
}

describe("placeConnectionLabels keep-out", () => {
  it("moves a chip off a section frame edge its wire crosses", () => {
    // The frame's right edge, x = 300, runs through the a → b midpoint.
    const document = doc([section("s", -40, -80, 340, 200), A, B], [wire("ab", "a", "b", "request")]);
    const point = placeConnectionLabels(document).get("ab")!;
    expect(point.y).toBe(30);
    expect(straddlesX("request", point, 300)).toBe(false);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("moves a pinned chip off a frame edge to the clear spot nearest its pin", () => {
    const document = doc(
      [section("s", -40, -80, 340, 200), A, B],
      [wire("ab", "a", "b", "request", { labelPosition: { along: 0.5 } })],
    );
    const point = placeConnectionLabels(document).get("ab")!;
    expect(straddlesX("request", point, 300)).toBe(false);
    // Just off the edge, with a few px of air: not slid away along the wire.
    const { width } = connectionLabelChipMetrics("request");
    expect(Math.abs(point.x - 300)).toBeLessThan(width / 2 + 16);
  });

  it("moves a chip off a sticky", () => {
    const note: InteractiveCanvasObject = { id: "n", type: "sticky", text: "note", geometry: { x: 260, y: 40, width: 80, height: 80 } };
    const document = doc([A, B, note], [wire("ab", "a", "b", "request")]);
    const point = placeConnectionLabels(document).get("ab")!;
    expect(straddlesX("request", point, 260) || straddlesX("request", point, 340) || straddlesX("request", point, 300)).toBe(false);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("keeps a chip off the arrowhead end of a short wire", () => {
    // a → b leaves a short run; the centered chip would reach into its last 24px.
    const near = box("b", 200, 0);
    const document = doc([A, near], [wire("ab", "a", "b", "brief")]);
    const routed = routedConnectionIn(document, document.connections[0]!, A, near);
    const end = routed.points!.at(-1)!;
    const point = placeConnectionLabels(document).get("ab")!;
    const { width } = connectionLabelChipMetrics("brief");
    expect(point.x + width / 2).toBeLessThanOrEqual(end.x - ARROW_KEEP_OUT_PX);
    expect(point.x - width / 2).toBeGreaterThanOrEqual(100);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("keeps a chip centered on a short wire with no arrowhead", () => {
    const near = box("b", 200, 0);
    const document = doc([A, near], [wire("ab", "a", "b", "brief", { arrow: "none" })]);
    expect(placeConnectionLabels(document).get("ab")!.x).toBe(150);
  });

  it("slides a wide chip sideways off a frame edge its vertical wire hugs", () => {
    // c → d runs down x = 150, 30px inside the frame's left edge at x = 120:
    // a chip centered on the wire crosses that edge all the way down.
    const label = "a label wider than the gap";
    const document = doc(
      [section("s", 120, -100, 400, 700), box("c", 100, 0), box("d", 100, 400)],
      [wire("cd", "c", "d", label)],
    );
    const point = placeConnectionLabels(document).get("cd")!;
    const { width } = connectionLabelChipMetrics(label);
    expect(point.x - width / 2).toBeGreaterThanOrEqual(120);
    // The wire still runs through the chip, inside its edge.
    expect(point.x - width / 2).toBeLessThan(150);
    expect(blockedLabelIds(document)).toEqual([]);
  });
});

describe("placeConnectionLabels tags in line", () => {
  it("lines up the chips of side-by-side runs in one column", () => {
    // Three level runs 100px apart with their middles at x = 300, 400 and 350.
    const document = doc(
      [box("a", 0, 0), box("b", 500, 0), box("c", 0, 100), box("d", 700, 100), box("e", 0, 200), box("f", 600, 200)],
      [
        wire("ab", "a", "b", "first"),
        wire("cd", "a", "b", "second", { from: { objectId: "c", anchor: "right" }, to: { objectId: "d", anchor: "left" } }),
        wire("ef", "a", "b", "third", { from: { objectId: "e", anchor: "right" }, to: { objectId: "f", anchor: "left" } }),
      ],
    );
    const placed = placeConnectionLabels(document);
    expect([placed.get("ab")!.y, placed.get("cd")!.y, placed.get("ef")!.y]).toEqual([30, 130, 230]);
    expect(placed.get("cd")!.x).toBe(placed.get("ab")!.x);
    expect(placed.get("ef")!.x).toBe(placed.get("ab")!.x);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("brings the chips of long runs to the chip of a short run", () => {
    // The short run is x 200..500; the two long runs are x 200..2000, with their middles at x = 1100.
    const document = doc(
      [box("a", 0, 0), box("b", 500, 0), box("c", 0, 100), box("d", 2000, 100), box("e", 0, 200), box("f", 2000, 200)],
      [
        wire("ab", "a", "b", "short"),
        wire("cd", "a", "b", "long", { from: { objectId: "c", anchor: "right" }, to: { objectId: "d", anchor: "left" } }),
        wire("ef", "a", "b", "long", { from: { objectId: "e", anchor: "right" }, to: { objectId: "f", anchor: "left" } }),
      ],
    );
    const placed = placeConnectionLabels(document);
    const column = placed.get("ab")!.x;
    expect([placed.get("cd")!.x, placed.get("ef")!.x]).toEqual([column, column]);
    // Nearer the middle of the short run than its arrowhead.
    expect(column - 350).toBeLessThan(500 - column);
  });

  it("leaves a pinned chip out of the column", () => {
    const document = doc(
      [box("a", 0, 0), box("b", 500, 0), box("c", 0, 100), box("d", 700, 100)],
      [
        wire("ab", "a", "b", "first", { labelPosition: { along: 0.25 } }),
        wire("cd", "a", "b", "second", { from: { objectId: "c", anchor: "right" }, to: { objectId: "d", anchor: "left" } }),
      ],
    );
    const placed = placeConnectionLabels(document);
    expect(placed.get("ab")).toEqual({ x: 200, y: 30 });
    expect(placed.get("cd")).toEqual({ x: 400, y: 130 });
  });

  it("carries the chip of a wire that leaves a section in the white space, with line on both sides", () => {
    // The gap between the frames is x 300..400; the wire's middle, x = 580, is inside the second frame.
    const document = doc(
      [section("s", -40, -80, 340, 200), section("t", 400, -80, 640, 200), box("a", 180, 0), box("b", 880, 0)],
      [wire("ab", "a", "b", "ok")],
    );
    const point = placeConnectionLabels(document).get("ab")!;
    const { width } = connectionLabelChipMetrics("ok");
    expect(point.y).toBe(30);
    expect(point.x - width / 2).toBeGreaterThanOrEqual(300 + 16);
    expect(point.x + width / 2).toBeLessThanOrEqual(400 - 16);
  });

  it("keeps the chip in the white space when the gap is too tight for line on both sides", () => {
    // The same gap, x 300..400, and a chip that leaves less than 16px a side.
    const document = doc(
      [section("s", -40, -80, 340, 200), section("t", 400, -80, 640, 200), box("a", 180, 0), box("b", 880, 0)],
      [wire("ab", "a", "b", "request")],
    );
    const point = placeConnectionLabels(document).get("ab")!;
    const { width } = connectionLabelChipMetrics("request");
    expect(width).toBeGreaterThan(100 - 2 * 16);
    expect(point.x - width / 2).toBeGreaterThan(300);
    expect(point.x + width / 2).toBeLessThan(400);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("lines up the chips of downward wires whose chips sit near each other, in one row", () => {
    // Two wires down, 300 apart: further than 240, but their chips on one row leave less than 240 between them.
    const down = (id: string, from: string, to: string) =>
      wire(id, "a", "b", "request", { from: { objectId: from, anchor: "bottom" }, to: { objectId: to, anchor: "top" } });
    const document = doc(
      [box("p", 0, 0), box("q", 0, 360), box("r", 300, 0), box("s", 300, 560)],
      [down("pq", "p", "q"), down("rs", "r", "s")],
    );
    const placed = placeConnectionLabels(document);
    expect(300 - connectionLabelChipMetrics("request").width).toBeLessThan(240);
    expect(placed.get("pq")!.y).toBe(placed.get("rs")!.y);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("leaves side-by-side chips in their own gaps when one line would put one inside a section", () => {
    // Two rows 220 apart. The top wire crosses a gap at x 300..400, the bottom one a gap at x 700..800.
    const document = doc(
      [
        section("s", -40, -80, 340, 200), section("t", 400, -80, 640, 200), box("a", 180, 0), box("b", 880, 0),
        section("u", -40, 140, 740, 200), section("v", 800, 140, 240, 200), box("c", 180, 220), box("d", 880, 220),
      ],
      [wire("ab", "a", "b", "request"), wire("cd", "c", "d", "request")],
    );
    const placed = placeConnectionLabels(document);
    const { width } = connectionLabelChipMetrics("request");
    expect(placed.get("ab")!.x - width / 2).toBeGreaterThan(300);
    expect(placed.get("ab")!.x + width / 2).toBeLessThan(400);
    expect(placed.get("cd")!.x - width / 2).toBeGreaterThan(700);
    expect(placed.get("cd")!.x + width / 2).toBeLessThan(800);
  });

  // a's right side to c's top: across to x = 450, then down. The middle of the wire is the corner.
  const elbow = (labelPosition?: InteractiveCanvasConnection["labelPosition"]) =>
    doc([A, box("c", 400, 380)], [wire("ac", "a", "c", "request", { to: { objectId: "c", anchor: "top" }, labelPosition })]);
  const CORNER = { x: 450, y: 30 };
  /** Whether the "request" chip on `point` sits on one straight run of the elbow, 12px or more from its corner. */
  function onOneRun(point: { x: number; y: number }): boolean {
    const { width, height } = connectionLabelChipMetrics("request");
    const across = point.y === CORNER.y && point.x + width / 2 <= CORNER.x - 12;
    const down = point.x === CORNER.x && point.y - height / 2 >= CORNER.y + 12;
    return across || down;
  }

  it("moves a chip off a bend onto a straight run, clear of the corner", () => {
    const document = elbow();
    const points = routedConnectionIn(document, document.connections[0]!, document.objects[0]!, document.objects[1]!).points!;
    expect(points).toContainEqual(CORNER);
    expect(onOneRun(placeConnectionLabels(document).get("ac")!)).toBe(true);
    expect(blockedLabelIds(document)).toEqual([]);
  });

  it("moves a pin on a bend to the nearest straight run and keeps a pin beside its wire", () => {
    // The two runs are the same length, so a pin at 0.5 is on the corner.
    const moved = placeConnectionLabels(elbow({ along: 0.5 })).get("ac")!;
    expect(onOneRun(moved)).toBe(true);
    expect(Math.hypot(moved.x - CORNER.x, moved.y - CORNER.y)).toBeLessThan(30);
    const beside = placeConnectionLabels(elbow({ along: 0.5, offset: 40 })).get("ac")!;
    expect(Math.hypot(beside.x - CORNER.x, beside.y - CORNER.y)).toBeCloseTo(40, 5);
  });
});

describe("placed label parity", () => {
  it("stage chip, static SVG chip, painted bounds and chipFor share one center", () => {
    const document = doc([A, B, UNDER_MIDDLE], [wire("ab", "a", "b", "request")]);
    const connection = document.connections[0]!;
    const placed = placeConnectionLabels(document).get("ab")!;
    expect(placed.x).not.toBe(300);

    // Lints.
    const chip = chipFor(connection, document)!;
    expect(chip.rect.x + chip.rect.width / 2).toBeCloseTo(placed.x, 6);
    expect(chip.rect.y + chip.rect.height / 2).toBeCloseTo(placed.y, 6);

    // Static SVG: the chip's text sits at the label point.
    const svg = renderDocumentToSvg(document).svg;
    const text = svg.match(/<text ([^>]*)>request<\/text>/)![1]!;
    expect(Number(text.match(/(?:^| )x="([^"]+)"/)![1])).toBeCloseTo(placed.x, 1);
    expect(Number(text.match(/(?:^| )y="([^"]+)"/)![1])).toBeCloseTo(placed.y, 1);

    // Painted bounds: the wire spans x 100..500, so the chip's right edge
    // decides the extent only if it is there; it must at least contain the chip.
    const bounds = connectionPaintedBounds(document, connection)!;
    expect(bounds.x).toBeLessThanOrEqual(chip.rect.x);
    expect(bounds.y).toBeLessThanOrEqual(chip.rect.y);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(chip.rect.y + chip.rect.height);

    // Stage: the live Connector translates its chip group to the label point.
    const markup = renderToStaticMarkup(
      <svg>
        <Connector
          document={document}
          connection={connection}
          fromObject={A}
          toObject={B}
          zoom={1}
        />
      </svg>,
    );
    const transform = markup.match(/data-canvas-connection-label="ab"[^>]*transform="translate\(([^ ]+) ([^)]+)\)"/)
      ?? markup.match(/transform="translate\(([^ ]+) ([^)]+)\)"[^>]*data-canvas-connection-label="ab"/);
    expect(transform).not.toBeNull();
    expect(Number(transform![1])).toBeCloseTo(placed.x, 6);
    expect(Number(transform![2])).toBeCloseTo(placed.y, 6);
  });
});
