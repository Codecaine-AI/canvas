import { describe, expect, it } from "bun:test";
import {
  connectionBoundsForObject,
  getConnectionAnchors,
  inscribedTextRect,
  nearestOutlinePoint,
  outlinePolygon,
} from "../geometry";
import type { InteractiveCanvasObject } from "../../state/schema";

function rectObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "rect-1",
    type: "process",
    text: "Rect",
    geometry: { x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  };
}

function diamondObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "diamond-1",
    type: "decision",
    text: "Diamond",
    geometry: { x: 0, y: 0, width: 100, height: 100 },
    style: { shape: "diamond" },
    ...overrides,
  };
}

function arrowShapeObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "arrow-1",
    type: "arrow-shape",
    text: "Arrow",
    geometry: { x: 0, y: 0, width: 200, height: 100 },
    direction: "right",
    ...overrides,
  };
}

function iconObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "chip-1",
    type: "icon",
    icon: "model",
    text: "Chip",
    geometry: { x: 0, y: 0, width: 60, height: 60 },
    style: { shape: "icon" },
    ...overrides,
  };
}

/** Generic 100x100-bounds object factory for the universal shape core. */
function shapeObject(
  type: InteractiveCanvasObject["type"],
  overrides: Partial<InteractiveCanvasObject> = {},
): InteractiveCanvasObject {
  return {
    id: `${type}-1`,
    type,
    text: type,
    geometry: { x: 0, y: 0, width: 100, height: 100 },
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

  it("returns a 7-point chevron for an arrow-shape object", () => {
    const object = arrowShapeObject();
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(7);
    // The tip of a right-pointing arrow should reach the right edge at mid-height.
    expect(polygon).toContainEqual({ x: 200, y: 50 });
  });

  it("extends the bbox outline for icon objects with visible below text", () => {
    const object = iconObject();
    const polygon = outlinePolygon(object);
    expect(polygon).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 84 },
      { x: 0, y: 84 },
    ]);
  });
});

describe("inscribedTextRect", () => {
  it("returns null for center-slot fallback shapes", () => {
    expect(inscribedTextRect(rectObject())).toBeNull();
  });

  it("returns a centered 0.68 bbox-fraction rect for ellipses", () => {
    const width = 160;
    const height = 120;
    const rectWidth = width * 0.68;
    const rectHeight = height * 0.68;
    expect(inscribedTextRect(shapeObject("ellipse", {
      geometry: { x: 0, y: 0, width: 160, height: 120 },
      style: { shape: "ellipse" },
    }))).toEqual({
      x: (width - rectWidth) / 2,
      y: (height - rectHeight) / 2,
      width: rectWidth,
      height: rectHeight,
    });
  });

  it("returns a centered half-bbox-minus-12 rect for decision diamonds", () => {
    expect(inscribedTextRect(diamondObject({
      geometry: { x: 0, y: 0, width: 160, height: 112 },
    }))).toEqual({
      x: 46,
      y: 34,
      width: 68,
      height: 44,
    });
  });

  it("returns direction-aware triangle bands", () => {
    const width = 140;
    const height = 120;
    expect(inscribedTextRect(shapeObject("triangle", {
      geometry: { x: 0, y: 0, width, height },
    }))).toEqual({
      x: width * 0.25,
      y: height * 0.52,
      width: width * 0.5,
      height: height * 0.9 - height * 0.52,
    });
    expect(inscribedTextRect(shapeObject("triangle", {
      direction: "down",
      geometry: { x: 0, y: 0, width, height },
    }))).toEqual({
      x: width * 0.25,
      y: height * 0.1,
      width: width * 0.5,
      height: height * 0.48 - height * 0.1,
    });
  });

  it("returns closed-form per-shape center rects", () => {
    const width = 200;
    const height = 120;
    const cases: Array<{
      type: InteractiveCanvasObject["type"];
      x1: number;
      x2: number;
      y1: number;
      y2: number;
    }> = [
      { type: "predefined-process", x1: width * 0.047 + 10, x2: width - (width * 0.047 + 10), y1: 12, y2: height - 12 },
      { type: "octagon", x1: width * 0.19, x2: width * 0.81, y1: height * 0.19, y2: height * 0.81 },
    ];

    for (const testCase of cases) {
      expect(inscribedTextRect(shapeObject(testCase.type, {
        geometry: { x: 0, y: 0, width, height },
      }))).toEqual({
        x: testCase.x1,
        y: testCase.y1,
        width: Math.max(0, testCase.x2 - testCase.x1),
        height: Math.max(0, testCase.y2 - testCase.y1),
      });
    }
  });
});

describe("outlinePolygon: the universal shape core", () => {
  it("returns a dense 32-point ellipse polygon inscribed in the bounds", () => {
    const object = shapeObject("ellipse");
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(32);
    // Rightmost point (angle 0) sits on the true ellipse outline at (100, 50).
    expect(polygon[0]).toEqual({ x: 100, y: 50 });
  });

  it("returns a 3-point up-pointing triangle with the apex at top-center", () => {
    const object = shapeObject("triangle");
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(3);
    expect(polygon).toContainEqual({ x: 50, y: 0 });
  });

  it("returns a 3-point down-pointing triangle when direction is 'down'", () => {
    const object = shapeObject("triangle", { direction: "down" });
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(3);
    // Apex is now at the bottom-center.
    expect(polygon).toContainEqual({ x: 50, y: 100 });
  });

  it("returns an 8-point octagon, flat-top", () => {
    const object = shapeObject("octagon");
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(8);
  });

  it("falls back to the bounding-rect outline for bbox-fallback types, extended for below-slot icon text", () => {
    for (const type of ["icon"] as const) {
      const polygon = outlinePolygon(shapeObject(type));
      const bottom = 124;
      expect(polygon).toEqual([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: bottom },
        { x: 0, y: bottom },
      ]);
    }
  });
});

describe("getConnectionAnchors: the universal shape core", () => {
  it("produces a top anchor exactly at the apex for an up-pointing triangle (x = 0.5 fraction of width)", () => {
    const object = shapeObject("triangle");
    const anchors = getConnectionAnchors(object);
    const top = anchors.find((a) => a.coord[1] === 0);
    expect(top).toBeDefined();
    expect(top?.point).toEqual({ x: 50, y: 0 });
    expect(top?.coord).toEqual([0.5, 0]);
  });

  it("produces a bottom anchor exactly at the apex for a down-pointing triangle", () => {
    const object = shapeObject("triangle", { direction: "down" });
    const anchors = getConnectionAnchors(object);
    const bottom = anchors.find((a) => a.coord[1] === 1);
    expect(bottom).toBeDefined();
    expect(bottom?.point).toEqual({ x: 50, y: 100 });
  });

  it("produces anchors on the true ellipse outline (cardinal points touch the bbox edge midpoints, same as a circle inscribed in a square)", () => {
    const object = shapeObject("ellipse");
    const anchors = getConnectionAnchors(object);
    const points = anchors.map((a) => a.point);
    expect(points.some((p) => Math.abs(p.x - 50) < 1e-6 && Math.abs(p.y - 0) < 1e-6)).toBe(true);
    expect(points.some((p) => Math.abs(p.x - 100) < 1e-6 && Math.abs(p.y - 50) < 1e-6)).toBe(true);
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

  it("uses the external below-text band for bbox outline and bottom anchor only", () => {
    const object = shapeObject("icon", {
      icon: "human",
      text: "Adapt Question Based on Interview History",
      geometry: { x: 10, y: 20, width: 120, height: 140 },
      style: { shape: "icon" },
    });
    const bounds = connectionBoundsForObject(object);
    const anchors = getConnectionAnchors(object);

    expect(bounds.height).toBeGreaterThan(object.geometry.height);
    expect(bounds.width).toBeGreaterThan(object.geometry.width);
    expect(outlinePolygon(object)).toEqual([
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    ]);
    expect(anchors[0]!.point).toEqual({ x: 70, y: 20 });
    expect(anchors[1]!.point).toEqual({
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height,
    });
    expect(anchors[2]!.point).toEqual({ x: 10, y: 90 });
    expect(anchors[3]!.point).toEqual({ x: 130, y: 90 });
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
