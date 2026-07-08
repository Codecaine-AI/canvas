import { describe, expect, it } from "bun:test";
import {
  chevronPoints,
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

function pillObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "pill-1",
    type: "pill",
    text: "Pill",
    geometry: { x: 0, y: 0, width: 200, height: 80 },
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
    icon: "cpu",
    text: "Chip",
    geometry: { x: 0, y: 0, width: 60, height: 60 },
    style: { shape: "icon" },
    ...overrides,
  };
}

/** Generic 100x100-bounds object factory for the W5 FigJam parity shape set (Wave A). */
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

  it("guards pill text against stadium caps", () => {
    expect(inscribedTextRect(pillObject({
      geometry: { x: 0, y: 0, width: 200, height: 64 },
      style: { shape: "pill" },
    }))).toEqual({
      x: 32,
      y: 12,
      width: 136,
      height: 40,
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
      { type: "star", x1: width * 0.27, x2: width * 0.73, y1: height * 0.42, y2: height * 0.72 },
      { type: "database", x1: width * 0.06, x2: width * 0.94, y1: height * 0.34, y2: height * 0.8 },
      { type: "document", x1: width * 0.09, x2: width * 0.91, y1: height * 0.06, y2: height * 0.78 },
      { type: "document-stack", x1: width * 0.1, x2: width * 0.96, y1: height * 0.1, y2: height * 0.78 },
      { type: "folder", x1: width * 0.06, x2: width * 0.94, y1: height * 0.3, y2: height * 0.92 },
      { type: "cylinder-horizontal", x1: width * 0.2, x2: width * 0.8, y1: height * 0.12, y2: height * 0.88 },
      { type: "page-corner", x1: width * 0.05, x2: width * 0.94, y1: height * 0.26, y2: height * 0.94 },
      { type: "internal-storage", x1: width * 0.15 + 8, x2: width * 0.94, y1: height * 0.15 + 8, y2: height * 0.92 },
      { type: "parallelogram", x1: width * 0.18 + 8, x2: width * 0.82 - 8, y1: height * 0.06, y2: height * 0.94 },
      { type: "trapezoid", x1: width * 0.2 + 8, x2: width * 0.8 - 8, y1: height * 0.14, y2: height * 0.92 },
      { type: "hexagon", x1: width * 0.22 + 8, x2: width * 0.78 - 8, y1: height * 0.1, y2: height * 0.9 },
      { type: "off-page-connector", x1: width * 0.08, x2: width * 0.92, y1: height * 0.06, y2: height * 0.58 },
      { type: "manual-input", x1: width * 0.08, x2: width * 0.92, y1: height * 0.25 + 8, y2: height * 0.92 },
      { type: "annotation-marker", x1: width * 0.15, x2: width * 0.85, y1: height * 0.15, y2: height * 0.85 },
      { type: "pentagon", x1: width * 0.22, x2: width * 0.78, y1: height * 0.24, y2: height * 0.88 },
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

describe("outlinePolygon: W5 FigJam parity shape set (Wave A)", () => {
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

  it("returns a 4-point parallelogram skewed per PARALLELOGRAM_SKEW_RATIO (18%)", () => {
    const object = shapeObject("parallelogram");
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(4);
    // direction "right" (default): top edge shifted right by 18% of width.
    expect(polygon).toContainEqual({ x: 18, y: 0 });
    expect(polygon).toContainEqual({ x: 82, y: 100 });
  });

  it("returns a 5-point pentagon, point-up", () => {
    const object = shapeObject("pentagon");
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(5);
    expect(polygon[0]).toEqual({ x: 50, y: 0 });
  });

  it("returns an 8-point octagon, flat-top", () => {
    const object = shapeObject("octagon");
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(8);
  });

  it("returns a 10-point star, point-up, with alternating outer/inner radii", () => {
    const object = shapeObject("star");
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(10);
    expect(polygon[0]).toEqual({ x: 50, y: 0 });
  });

  it("returns a 12-point plus/cross polygon", () => {
    const object = shapeObject("plus");
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(12);
    // Top of the vertical bar is centered and inset by half the bar thickness.
    const top = polygon.filter((p) => p.y === 0);
    expect(top.length).toBe(2);
    expect(top.map((p) => p.x).sort((a, b) => a - b)[0]).toBeCloseTo(100 / 3, 5);
    expect(top.map((p) => p.x).sort((a, b) => a - b)[1]).toBeCloseTo(200 / 3, 5);
  });

  it("returns a 6-point fat chevron (distinct from arrow-shape's 7-point sliver)", () => {
    const object = shapeObject("chevron");
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(6);
    // The pointed head of a right-pointing chevron reaches the right edge at mid-height.
    expect(polygon).toContainEqual({ x: 100, y: 50 });
  });

  it("chevronPoints mirrors left vs right direction", () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const right = chevronPoints(bounds, "right");
    const left = chevronPoints(bounds, "left");
    expect(right).toContainEqual({ x: 100, y: 50 });
    expect(left).toContainEqual({ x: 0, y: 50 });
  });

  it("returns a 5-point off-page-connector (downward pentagon)", () => {
    const object = shapeObject("off-page-connector");
    const polygon = outlinePolygon(object);
    expect(polygon).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 50, y: 100 },
      { x: 0, y: 60 },
    ]);
  });

  it("returns a 4-point trapezoid inset 20% on each top corner", () => {
    const object = shapeObject("trapezoid");
    const polygon = outlinePolygon(object);
    expect(polygon).toEqual([
      { x: 20, y: 0 },
      { x: 80, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
  });

  it("returns a 4-point manual-input shape with a slanted top edge", () => {
    const object = shapeObject("manual-input");
    const polygon = outlinePolygon(object);
    expect(polygon).toEqual([
      { x: 0, y: 25 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
  });

  it("returns a 6-point flat-top hexagon", () => {
    const object = shapeObject("hexagon");
    const polygon = outlinePolygon(object);
    expect(polygon.length).toBe(6);
    const rightPoint = polygon.find((p) => Math.abs(p.x - 100) < 1e-6);
    const leftPoint = polygon.find((p) => Math.abs(p.x - 0) < 1e-6);
    expect(rightPoint?.y).toBeCloseTo(50, 5);
    expect(leftPoint?.y).toBeCloseTo(50, 5);
  });

  it("returns a dense circular polygon for or-junction and summing-junction (shared 'junction' outline)", () => {
    const orJunction = outlinePolygon(shapeObject("or-junction"));
    const summingJunction = outlinePolygon(shapeObject("summing-junction"));
    expect(orJunction.length).toBe(32);
    expect(summingJunction.length).toBe(32);
    expect(orJunction).toEqual(summingJunction);
  });

  it("falls back to the bounding-rect outline for bbox-fallback W5 types, extended for below-slot icon text", () => {
    for (const type of [
      "folder",
      "document-stack",
      "cylinder-horizontal",
      "page-corner",
      "icon",
      "internal-storage",
    ] as const) {
      const polygon = outlinePolygon(shapeObject(type));
      const bottom = type === "icon" ? 124 : 100;
      expect(polygon).toEqual([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: bottom },
        { x: 0, y: bottom },
      ]);
    }
  });
});

describe("getConnectionAnchors: W5 FigJam parity shape set (Wave A)", () => {
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
      icon: "person",
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
