/**
 * Label placement: the renderer keeps a wire's chip off boxes, chips and
 * other wires when its own wire has a clear stretch, and every chip consumer
 * (stage Connector, static SVG, painted bounds, the lints' chipFor) draws or
 * judges the chip at that one placed point.
 */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";
import { chipFor } from "../../board/lints/geometry";
import { rule as coveredContent } from "../../board/lints/rules/covered-content";
import { connectionPaintedBounds } from "../../render/painted-bounds";
import { renderDocumentToSvg } from "../../render/static-svg";
import { Connector } from "../Connector";
import { connectionLabelChipMetrics } from "../label-chip";
import { placeConnectionLabels } from "../label-placement";

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

function chipFindings(document: InteractiveCanvasDocument): string[] {
  return coveredContent.check(document, undefined)
    .filter((finding) => finding.message.startsWith("label "))
    .map((finding) => finding.message);
}

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
    expect(chipFindings(document)).toEqual([]);
  });

  it("moves a chip off another wire that crosses its midpoint", () => {
    // d → e runs straight down x = 300, through the a → b midpoint.
    const document = doc(
      [A, B, box("d", 250, -200), box("e", 250, 200)],
      [wire("ab", "a", "b", "request"), wire("de", "d", "e")],
    );
    const point = placeConnectionLabels(document).get("ab")!;
    expect(point.x).not.toBe(300);
    expect(chipFindings(document)).toEqual([]);
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
    expect(chipFindings(document)).toEqual([]);
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
    expect(chipFindings(document)).toEqual([]);
  });

  it("keeps the least-bad point when the wire has no clear stretch", () => {
    // A 40px wire cannot hold a 73px chip clear of both endpoint boxes. The
    // midpoint covers a sliver of each, less than sliding onto either one.
    const document = doc([A, box("b", 140, 0)], [wire("ab", "a", "b", "request")]);
    expect(placeConnectionLabels(document).get("ab")).toEqual({ x: 120, y: 30 });
    expect(chipFindings(document)).toHaveLength(2);
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
    expect(chipFindings(document)).toEqual([]);
  });

  it("keeps a colliding pin when its wire has no clear spot", () => {
    const document = doc(
      [A, box("b", 140, 0)],
      [wire("ab", "a", "b", "request", { labelPosition: { along: 0.25 } })],
    );
    expect(placeConnectionLabels(document).get("ab")).toEqual({ x: 110, y: 30 });
  });
});

describe("placed label parity", () => {
  it("stage chip, static SVG chip, painted bounds and the lint chip share one center", () => {
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
