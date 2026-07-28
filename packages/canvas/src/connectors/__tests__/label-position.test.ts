/**
 * `labelPointFor` — the single effective-label-point reader (S1.1).
 *
 * The chip has one home in the tree: without a `labelPosition` it is the
 * router's own arc-length midpoint (parity asserted here, so the pre-pin
 * behavior can never drift), and with one it is a walk to fraction `along`
 * plus a perpendicular `offset` whose sign is LEFT of travel.
 */
import { describe, expect, it } from "bun:test";

import type { CanvasPoint } from "../../state/geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../../state/schema";
import { labelPointFor, routeConnection } from "../routing";

const EPSILON = 1e-6;

function expectPointClose(actual: CanvasPoint, expected: CanvasPoint): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(EPSILON);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(EPSILON);
}

function object(id: string, x: number, y: number): InteractiveCanvasObject {
  return { id, type: "process", text: id, geometry: { x, y, width: 100, height: 60 } };
}

function connection(
  labelPosition?: InteractiveCanvasConnection["labelPosition"],
): InteractiveCanvasConnection {
  return {
    id: "connection",
    from: { objectId: "from", anchor: "right" },
    to: { objectId: "to", anchor: "left" },
    label: "chip",
    labelPosition,
  };
}

/**
 * A straight left-to-right run: `from` right edge (100, 30) → `to` left edge
 * (300, 30), 200px of arc length on one horizontal segment. Every `along`
 * fraction is therefore trivially checkable by hand.
 */
function straightRoute() {
  return routeConnection(object("from", 0, 0), object("to", 300, 0), connection());
}

describe("labelPointFor", () => {
  it("falls back to the router's own midpoint when the connection carries no pin", () => {
    const from = object("from", 0, 0);
    const to = object("to", 260, 120);
    const edge = connection();
    const routed = routeConnection(from, to, edge);

    // Parity with polylineHalfwayPoint, which is what routed.labelPoint is:
    // the unpinned path is byte-for-byte the pre-S1.1 behavior.
    expect(labelPointFor(routed, edge)).toEqual(routed.labelPoint);
    expect(labelPointFor(routed, undefined)).toEqual(routed.labelPoint);
    expect(labelPointFor(routed, {})).toEqual(routed.labelPoint);
  });

  it("walks to along=0 (the start), 0.5 (the midpoint) and 1 (the end)", () => {
    const routed = straightRoute();
    expectPointClose(routed.start, { x: 100, y: 30 });
    expectPointClose(routed.end, { x: 300, y: 30 });

    expectPointClose(labelPointFor(routed, connection({ along: 0 })), { x: 100, y: 30 });
    expectPointClose(labelPointFor(routed, connection({ along: 0.5 })), { x: 200, y: 30 });
    expectPointClose(labelPointFor(routed, connection({ along: 1 })), { x: 300, y: 30 });
  });

  it("along=0.5 with no offset lands exactly on the unpinned midpoint", () => {
    const from = object("from", 0, 0);
    const to = object("to", 260, 120);
    const routed = routeConnection(from, to, connection());

    expectPointClose(labelPointFor(routed, connection({ along: 0.5 })), routed.labelPoint);
  });

  it("offsets perpendicular to travel — positive is LEFT of the from→to direction", () => {
    const routed = straightRoute();

    // Travelling +x in a y-down world: left of travel is -y (upward).
    expectPointClose(labelPointFor(routed, connection({ along: 0.5, offset: 24 })), { x: 200, y: 6 });
    expectPointClose(labelPointFor(routed, connection({ along: 0.5, offset: -24 })), { x: 200, y: 54 });
    // A zero offset is the bare `along` point.
    expectPointClose(labelPointFor(routed, connection({ along: 0.5, offset: 0 })), { x: 200, y: 30 });
  });

  it("offsets a downward run to its own left, not the board's", () => {
    // `from` above `to`: the route runs +y, whose left-hand side is +x.
    const routed = routeConnection(
      object("from", 0, 0),
      object("to", 0, 300),
      { ...connection({ along: 0.5, offset: 20 }), from: { objectId: "from", anchor: "bottom" }, to: { objectId: "to", anchor: "top" } },
    );
    const pinned = labelPointFor(routed, { labelPosition: { along: 0.5, offset: 20 } });
    const bare = labelPointFor(routed, { labelPosition: { along: 0.5 } });

    expect(pinned.x - bare.x).toBeCloseTo(20, 6);
    expect(pinned.y).toBeCloseTo(bare.y, 6);
  });

  it("clamps an out-of-range `along` rather than walking off the path", () => {
    // The validator drops these before they reach a document; this is the
    // guard for drafts and direct callers.
    const routed = straightRoute();
    expectPointClose(labelPointFor(routed, connection({ along: -3 })), { x: 100, y: 30 });
    expectPointClose(labelPointFor(routed, connection({ along: 42 })), { x: 300, y: 30 });
  });

  it("ignores a non-finite along or offset instead of emitting NaN coordinates", () => {
    const routed = straightRoute();
    expect(labelPointFor(routed, connection({ along: Number.NaN }))).toEqual(routed.labelPoint);
    expectPointClose(labelPointFor(routed, connection({ along: 0.5, offset: Number.NaN })), {
      x: 200,
      y: 30,
    });
  });

  it("falls back to the midpoint on a degenerate zero-length route", () => {
    const routed = {
      path: "",
      start: { x: 40, y: 40 },
      end: { x: 40, y: 40 },
      labelPoint: { x: 40, y: 40 },
      startAnchor: "right" as const,
      endAnchor: "left" as const,
      points: [{ x: 40, y: 40 }, { x: 40, y: 40 }],
    };

    expect(labelPointFor(routed, connection({ along: 0.75, offset: 30 }))).toEqual(routed.labelPoint);
  });

  it("uses the LOCAL segment direction on an elbowed route, not the chord", () => {
    // An elbow from a bottom anchor to a left anchor: the first leg runs
    // downward, so a pin near along=0 offsets along +x, while the last leg
    // runs rightward and offsets along -y.
    const routed = routeConnection(object("from", 0, 0), object("to", 300, 300), {
      ...connection(),
      from: { objectId: "from", anchor: "bottom" },
      to: { objectId: "to", anchor: "left" },
    });
    const nearStart = labelPointFor(routed, { labelPosition: { along: 0.02, offset: 10 } });
    const nearStartBare = labelPointFor(routed, { labelPosition: { along: 0.02 } });
    const nearEnd = labelPointFor(routed, { labelPosition: { along: 0.98, offset: 10 } });
    const nearEndBare = labelPointFor(routed, { labelPosition: { along: 0.98 } });

    // Down-travelling first leg → offset lands on +x, y untouched.
    expect(nearStart.x - nearStartBare.x).toBeCloseTo(10, 6);
    expect(nearStart.y).toBeCloseTo(nearStartBare.y, 6);
    // Right-travelling last leg → offset lands on -y, x untouched.
    expect(nearEnd.y - nearEndBare.y).toBeCloseTo(-10, 6);
    expect(nearEnd.x).toBeCloseTo(nearEndBare.x, 6);
  });
});
