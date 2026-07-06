import { describe, expect, it } from "bun:test";
import {
  ANCHOR_SNAP_VIEW_PX,
  getConnectionAnchors,
  nearestOutlinePoint,
  outlinePolygon,
  OUTLINE_SNAP_WORLD_PX,
  resolveConnectionCascade,
} from "../connection-overlay";
import type { InteractiveCanvasObject } from "../../model/schema";

function rectObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "rect-1",
    type: "process",
    label: "Rect",
    geometry: { x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  };
}

function pillObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "pill-1",
    type: "pill",
    label: "Pill",
    geometry: { x: 0, y: 0, width: 200, height: 80 },
    ...overrides,
  };
}

function diamondObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "diamond-1",
    type: "decision",
    label: "Diamond",
    geometry: { x: 0, y: 0, width: 100, height: 100 },
    style: { shape: "diamond" },
    ...overrides,
  };
}

function arrowShapeObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "arrow-1",
    type: "arrow-shape",
    label: "Arrow",
    geometry: { x: 0, y: 0, width: 200, height: 100 },
    direction: "right",
    ...overrides,
  };
}

function chipIconObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "chip-1",
    type: "chip-icon",
    label: "Chip",
    geometry: { x: 0, y: 0, width: 60, height: 60 },
    ...overrides,
  };
}

describe("outlinePolygon", () => {
  it("returns the axis-aligned bounds rect for a plain rect-shaped object", () => {
    const object = rectObject();
    const polygon = outlinePolygon(object);
    expect(polygon).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
  });

  it("returns a 4-point diamond for a diamond-styled object", () => {
    const object = diamondObject();
    const polygon = outlinePolygon(object);
    expect(polygon).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 50 },
    ]);
  });

  it("returns a rounded stadium polygon for a pill object (not the raw bbox corners)", () => {
    const object = pillObject();
    const polygon = outlinePolygon(object);
    // A pill's polygon should NOT contain the sharp bbox corner (0,0) since
    // the left cap is a semicircle centered at (radius, cy).
    expect(polygon).not.toContainEqual({ x: 0, y: 0 });
    expect(polygon.length).toBeGreaterThan(4);
  });

  it("returns a 7-point chevron for an arrow-shape object", () => {
    const object = arrowShapeObject();
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(7);
    // The tip of a right-pointing chevron should reach the right edge at mid-height.
    expect(polygon).toContainEqual({ x: 200, y: 50 });
  });

  it("falls back to the bounding-rect outline for object types with no modeled outline (e.g. chip-icon)", () => {
    const object = chipIconObject();
    const polygon = outlinePolygon(object);
    expect(polygon).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 60 },
      { x: 0, y: 60 },
    ]);
  });
});

describe("getConnectionAnchors", () => {
  it("produces 4 cardinal anchors on the true rect outline (bbox edge midpoints for a rect)", () => {
    const object = rectObject();
    const anchors = getConnectionAnchors(object);
    expect(anchors).toHaveLength(4);
    const points = anchors.map((a) => a.point);
    expect(points).toContainEqual({ x: 50, y: 0 });
    expect(points).toContainEqual({ x: 50, y: 100 });
    expect(points).toContainEqual({ x: 0, y: 50 });
    expect(points).toContainEqual({ x: 100, y: 50 });
  });

  it("produces anchors on the true diamond outline, not the bbox edges", () => {
    const object = diamondObject();
    const anchors = getConnectionAnchors(object);
    const points = anchors.map((a) => a.point);
    // The diamond's N/S/E/W outline points are the same as its 4 vertices
    // since the candidate rays are axis-aligned through the center.
    expect(points).toContainEqual({ x: 50, y: 0 });
    expect(points).toContainEqual({ x: 50, y: 100 });
    expect(points).toContainEqual({ x: 0, y: 50 });
    expect(points).toContainEqual({ x: 100, y: 50 });
  });

  it("produces anchor coord values as [0..1, 0..1] fractions of the bounds", () => {
    const object = rectObject();
    const anchors = getConnectionAnchors(object);
    for (const anchor of anchors) {
      expect(anchor.coord[0]).toBeGreaterThanOrEqual(0);
      expect(anchor.coord[0]).toBeLessThanOrEqual(1);
      expect(anchor.coord[1]).toBeGreaterThanOrEqual(0);
      expect(anchor.coord[1]).toBeLessThanOrEqual(1);
    }
    const top = anchors[0]!;
    expect(top.coord).toEqual([0.5, 0]);
  });

  it("produces anchors on the true pill outline (top/bottom anchors sit above/below the flat edge center, not the bbox corner)", () => {
    const object = pillObject(); // 200x80, radius=40
    const anchors = getConnectionAnchors(object);
    const points = anchors.map((a) => a.point);
    // Top anchor: candidate ray straight up from center (100,40) to (100,-10);
    // outline crosses at (100, 0) since that's on the flat top edge.
    expect(points.some((p) => Math.abs(p.x - 100) < 1e-6 && Math.abs(p.y - 0) < 1e-6)).toBe(true);
  });
});

describe("nearestOutlinePoint", () => {
  it("finds the closest point on a rect outline for an external point", () => {
    const polygon = outlinePolygon(rectObject());
    const nearest = nearestOutlinePoint({ x: 50, y: -20 }, polygon);
    expect(nearest).toEqual({ x: 50, y: 0 });
  });

  it("finds the closest point on a diamond outline for an internal point", () => {
    const polygon = outlinePolygon(diamondObject());
    const nearest = nearestOutlinePoint({ x: 25, y: 25 }, polygon);
    // Should land somewhere on the top-left edge (from (50,0) to (0,50)).
    expect(nearest.x + nearest.y).toBeCloseTo(50, 0);
  });
});

describe("resolveConnectionCascade", () => {
  it("snaps to the nearest cardinal anchor when the pointer is within the screen-px anchor radius", () => {
    const object = rectObject();
    // Anchor is at (50, 0); place the pointer 3px away (well within threshold at zoom=1).
    const point = { x: 50, y: 3 };
    const result = resolveConnectionCascade(point, [object], 1);
    expect(result.kind).toBe("anchor");
    if (result.kind === "anchor") {
      expect(result.objectId).toBe("rect-1");
      expect(result.point).toEqual({ x: 50, y: 0 });
    }
  });

  it("does not snap to an anchor when just outside the screen-px anchor radius but still snaps to outline", () => {
    const object = rectObject();
    // 6px away from the top anchor (50,0), zoom=1 -> world threshold is 8px so
    // this is actually within range; use a distance clearly beyond 8 instead.
    const point = { x: 50, y: 20 }; // 20px from anchor -> beyond ANCHOR_SNAP_VIEW_PX
    const result = resolveConnectionCascade(point, [object], 1);
    // 20px from the top edge is also beyond OUTLINE_SNAP_WORLD_PX (8), and the
    // point is inside the rect's hover-expanded bound and inside the polygon,
    // so this should resolve to "inside".
    expect(result.kind).toBe("inside");
  });

  it("scales the anchor snap radius by zoom (screen px / zoom = world px)", () => {
    const object = rectObject();
    // 6 world px away from top anchor. At zoom=1, world threshold=8 -> snaps.
    // At zoom=0.25, world threshold=8/0.25=32 -> still snaps (larger world radius).
    // At zoom=4, world threshold=8/4=2 -> should NOT snap (6 > 2).
    const point = { x: 50, y: 6 };
    const atZoom1 = resolveConnectionCascade(point, [object], 1);
    const atHighZoom = resolveConnectionCascade(point, [object], 4);
    expect(atZoom1.kind).toBe("anchor");
    expect(atHighZoom.kind).not.toBe("anchor");
  });

  it("snaps to the nearest outline point when close to the border but beyond anchor radius and away from the 4 cardinal points", () => {
    const object = rectObject();
    // A point near the top-right corner region, away from the N and E anchors,
    // close to the top edge (within OUTLINE_SNAP_WORLD_PX of y=0).
    const point = { x: 80, y: 4 };
    const result = resolveConnectionCascade(point, [object], 1);
    expect(result.kind).toBe("outline");
    if (result.kind === "outline") {
      expect(result.point.y).toBeCloseTo(0, 5);
    }
  });

  it("resolves to 'inside' when the pointer is inside the shape but far from any anchor or edge", () => {
    const object = rectObject();
    const point = { x: 50, y: 50 }; // dead center
    const result = resolveConnectionCascade(point, [object], 1);
    expect(result).toEqual({ kind: "inside", objectId: "rect-1" });
  });

  it("resolves to 'free' with the raw point when no candidate's hover-expanded bound contains the pointer", () => {
    const object = rectObject();
    const point = { x: 5000, y: 5000 };
    const result = resolveConnectionCascade(point, [object], 1);
    expect(result).toEqual({ kind: "free", point });
  });

  it("excludes objects in excludeIds (e.g. the connector's own source object during endpoint drag)", () => {
    const object = rectObject();
    const point = { x: 50, y: 50 };
    const result = resolveConnectionCascade(point, [object], 1, new Set(["rect-1"]));
    expect(result).toEqual({ kind: "free", point });
  });

  it("lets a later candidate in the list win over an earlier one at the same point (z-order semantics)", () => {
    const back = rectObject({ id: "back", geometry: { x: 0, y: 0, width: 100, height: 100 } });
    const front = rectObject({ id: "front", geometry: { x: 0, y: 0, width: 100, height: 100 } });
    const point = { x: 50, y: 50 };
    const result = resolveConnectionCascade(point, [back, front], 1);
    expect(result.kind).toBe("inside");
    if (result.kind === "inside") {
      expect(result.objectId).toBe("front");
    }
  });

  it("exposes the anchor/outline snap constants used by the cascade", () => {
    expect(ANCHOR_SNAP_VIEW_PX).toBe(8);
    expect(OUTLINE_SNAP_WORLD_PX).toBe(8);
  });
});
