/**
 * The numbered-segment formatter (S4.1) — the single source of segment
 * numbering shared by the digest's edge lines, the ROUTES block, and (from
 * S3.6) the routing ops' results.
 *
 * The parity block below is the contract `shift_segment` stands on: an index
 * this module prints must be an index `connectorBendSegments` enumerates, or
 * the model would name a segment the editor cannot move.
 */
import { describe, expect, test } from "bun:test";

import { connectorBendSegments } from "../../canvas/src/connectors/bend-editing";
import {
  formatNumberedRoute,
  numberedRouteSegments,
  numberedSegmentsForPolyline,
} from "../src/board/edge-route";
import { routedPolyline } from "../src/board/lints/geometry";
import { box, connect, makeDocument } from "./synthetic";

const waypointsOf = (points: Array<[number, number]>): Array<[number, number]> => points;

describe("numberedRouteSegments", () => {
  test("a straight edge is one horizontal segment pinned by its y", () => {
    const document = makeDocument(
      [box("a", 0, 0), box("b", 400, 0)],
      [connect("e", "a", "b")],
    );

    expect(numberedRouteSegments(document.connections[0]!, document)).toEqual([
      { index: 0, axis: "h", fixed: 48, from: { x: 160, y: 48 }, to: { x: 400, y: 48 } },
    ]);
    expect(formatNumberedRoute(document.connections[0]!, document))
      .toBe("a ─(s0 h y=48)→ b");
  });

  test("a manual three-segment elbow prints the surface spec's shape", () => {
    const document = makeDocument(
      [box("A", 0, 200), box("B", 800, 400)],
      [{
        ...connect("e1", "A", "B"),
        waypoints: waypointsOf([[400, 248], [400, 448]]),
      }],
    );

    expect(numberedRouteSegments(document.connections[0]!, document)).toEqual([
      { index: 0, axis: "h", fixed: 248, from: { x: 160, y: 248 }, to: { x: 400, y: 248 } },
      { index: 1, axis: "v", fixed: 400, from: { x: 400, y: 248 }, to: { x: 400, y: 448 } },
      { index: 2, axis: "h", fixed: 448, from: { x: 400, y: 448 }, to: { x: 800, y: 448 } },
    ]);
    expect(formatNumberedRoute(document.connections[0]!, document))
      .toBe("A ─(s0 h y=248)→ (s1 v x=400) ─(s2 h y=448)→ B");
  });

  test("a multi-elbow manual route numbers every leg in polyline order", () => {
    const document = makeDocument(
      [box("A", 0, 200), box("B", 800, 600)],
      [{
        ...connect("e2", "A", "B"),
        waypoints: waypointsOf([[300, 248], [300, 400], [600, 400], [600, 648]]),
      }],
    );

    expect(formatNumberedRoute(document.connections[0]!, document)).toBe(
      "A ─(s0 h y=248)→ (s1 v x=300) ─(s2 h y=400)→ (s3 v x=600) ─(s4 h y=648)→ B",
    );
    expect(numberedRouteSegments(document.connections[0]!, document).map((s) => s.index))
      .toEqual([0, 1, 2, 3, 4]);
  });

  test("the auto-router's anchor stubs are numbered too — they carry bend handles", () => {
    const document = makeDocument(
      [box("A", 0, 200), box("B", 800, 400)],
      [connect("auto", "A", "B")],
    );

    // Five points-pairs, two of them collinear stubs: the stage draws a handle
    // per pair, so the formatter names one per pair and merges nothing.
    expect(formatNumberedRoute(document.connections[0]!, document)).toBe(
      "A ─(s0 h y=248)→ ─(s1 h y=248)→ (s2 v x=480) ─(s3 h y=448)→ ─(s4 h y=448)→ B",
    );
  });

  test("an unroutable edge yields no segments and no text", () => {
    const document = makeDocument([box("a", 0, 0)], [connect("dangling", "a", "ghost")]);

    expect(numberedRouteSegments(document.connections[0]!, document)).toEqual([]);
    expect(formatNumberedRoute(document.connections[0]!, document)).toBe("");
  });
});

describe("numberedSegmentsForPolyline · off-axis and degenerate legs", () => {
  test("a near-diagonal leg takes its dominant axis and that axis' midpoint", () => {
    // Vertical-dominant: |dy| 200 > |dx| 20 → v, x = midpoint of 100 and 120.
    const segments = numberedSegmentsForPolyline([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 120, y: 200 },
      { x: 300, y: 200 },
    ]);

    expect(segments.map((segment) => [segment.index, segment.axis, segment.fixed])).toEqual([
      [0, "h", 0],
      [1, "v", 110],
      [2, "h", 200],
    ]);
  });

  test("a horizontal-dominant diagonal takes h and the mean y", () => {
    const segments = numberedSegmentsForPolyline([
      { x: 0, y: 0 },
      { x: 400, y: 21 },
    ]);

    expect(segments).toEqual([
      { index: 0, axis: "h", fixed: 10.5, from: { x: 0, y: 0 }, to: { x: 400, y: 21 } },
    ]);
    // Printed coordinates are whole world units.
    expect(numberedSegmentsForPolyline([{ x: 0, y: 0 }, { x: 400, y: 21 }])).toHaveLength(1);
  });

  test("a zero-length hop is dropped and its index is left as a hole", () => {
    const segments = numberedSegmentsForPolyline([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
    ]);

    // s1 collapsed; s2 keeps its number rather than sliding down to 1.
    expect(segments.map((segment) => segment.index)).toEqual([0, 2]);
    expect(segments.map((segment) => segment.axis)).toEqual(["h", "v"]);
  });
});

describe("segment-index parity with connectorBendSegments (the shift_segment contract)", () => {
  const parityDocuments = () => {
    const straight = makeDocument(
      [box("a", 0, 0), box("b", 400, 0)],
      [connect("straight", "a", "b")],
    );
    const auto = makeDocument(
      [box("A", 0, 200), box("B", 800, 400)],
      [connect("auto", "A", "B")],
    );
    const manual = makeDocument(
      [box("A", 0, 200), box("B", 800, 600)],
      [{
        ...connect("manual", "A", "B"),
        waypoints: waypointsOf([[300, 248], [300, 400], [600, 400], [600, 648]]),
      }],
    );
    const anchored = makeDocument(
      [box("A", 0, 0), box("B", 600, 500)],
      [{
        ...connect("anchored", "A", "B"),
        from: { objectId: "A", anchor: "bottom" as const },
        to: { objectId: "B", anchor: "left" as const },
      }],
    );
    return [straight, auto, manual, anchored];
  };

  test("every printed index is a bend-handle index, in the same order", () => {
    for (const document of parityDocuments()) {
      const connection = document.connections[0]!;
      const points = routedPolyline(connection, document);
      const bendIndices = connectorBendSegments(points).map((segment) => segment.index);
      const printedIndices = numberedRouteSegments(connection, document)
        .map((segment) => segment.index);

      expect(printedIndices).toEqual(bendIndices);
      expect(printedIndices.length).toBeGreaterThan(0);
    }
  });

  test("axis and fixed coordinate agree with the bend segment they name", () => {
    for (const document of parityDocuments()) {
      const connection = document.connections[0]!;
      const points = routedPolyline(connection, document);
      const bendByIndex = new Map(
        connectorBendSegments(points).map((segment) => [segment.index, segment]),
      );

      for (const segment of numberedRouteSegments(connection, document)) {
        const bend = bendByIndex.get(segment.index)!;
        expect(segment.axis).toBe(bend.axis === "horizontal" ? "h" : "v");
        expect(segment.fixed).toBe(bend.axis === "horizontal" ? bend.midpoint.y : bend.midpoint.x);
        expect(segment.from).toEqual({ x: bend.start.x, y: bend.start.y });
        expect(segment.to).toEqual({ x: bend.end.x, y: bend.end.y });
      }
    }
  });
});
