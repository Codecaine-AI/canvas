import { describe, expect, it } from "bun:test";
import {
  connectionPaintedBounds,
  objectPaintedBounds,
  paintedBounds,
  type Rect,
} from "../painted-bounds";
import { routeConnection } from "../../connectors/routing";
import { belowExtendedBoundsPx } from "../../objects/text-slots";
import { canvasThemePreset, FIGJAM_CANVAS_STYLE } from "../../theme/canvas-style";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../state/schema";
import { measureWidth } from "../../theme/text-measure";

function box(
  id: string,
  x: number,
  y: number,
  width = 120,
  height = 80,
  text = "",
): InteractiveCanvasObject {
  return { id, type: "process", text, geometry: { x, y, width, height }, style: { shape: "rounded-rect" } };
}

function makeDocument(
  objects: InteractiveCanvasObject[],
  connections: InteractiveCanvasDocument["connections"] = [],
): InteractiveCanvasDocument {
  return { schemaVersion: 1, id: "painted-fixture", mode: "diagram", objects, connections };
}

function expectContains(outer: Rect, inner: Rect, tolerance = 0.001): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - tolerance);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - tolerance);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + tolerance);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + tolerance);
}

describe("paintedBounds", () => {
  it("is the exact rect union for plain unconnected objects", () => {
    const document = makeDocument([box("a", 0, 0), box("b", 400, 300)]);
    expect(paintedBounds(document)).toEqual({ x: 0, y: 0, width: 520, height: 380 });
  });

  it("includes an obstacle detour that routes outside both endpoint bboxes", () => {
    const a = box("a", 0, 0);
    const b = box("b", 600, 0);
    const wall = box("wall", 300, -220, 120, 520);
    const document = makeDocument(
      [a, b, wall],
      [{ id: "c", from: { objectId: "a" }, to: { objectId: "b" }, arrow: "forward" }],
    );

    // The production route must detour around the wall — verify the fixture
    // actually exercises that (some vertex sits outside both endpoint rects
    // AND outside the wall).
    const routed = routeConnection(a, b, document.connections[0]!, document.objects);
    const points = routed.points ?? [];
    const ys = points.map((point) => point.y);
    const routeBottom = Math.max(...ys);
    expect(routeBottom).toBeGreaterThan(300); // below every object rect

    const painted = paintedBounds(document);
    // The painted extent covers the full routed polyline…
    const xs = points.map((point) => point.x);
    expectContains(painted, {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    });
    // …which reaches beyond the union of the object rects alone.
    expect(painted.y + painted.height).toBeCloseTo(routeBottom, 5);
  });

  it("includes the label chip at the route's halfway point", () => {
    const a = box("a", 0, 0, 100, 60);
    const b = box("b", 0, 300, 100, 60);
    // The chip is the label measured in Inter Bold 16 plus 12px a side (the
    // chip Connector.tsx draws), centered on the straight vertical route at
    // x = 50 — wider than the boxes, so it sets the painted extent.
    const label = "extremely long connection label";
    const chipWidth = measureWidth(label, { family: "Inter", size: 16, weight: 700 }) + 2 * 12;
    expect(chipWidth).toBeGreaterThan(200);
    const document = makeDocument(
      [a, b],
      [{ id: "c", from: { objectId: "a" }, to: { objectId: "b" }, arrow: "forward", label }],
    );
    const painted = paintedBounds(document, undefined, FIGJAM_CANVAS_STYLE);
    expect(painted.x).toBeCloseTo(50 - chipWidth / 2, 5);
    expect(painted.x + painted.width).toBeCloseTo(50 + chipWidth / 2, 5);
  });

  it("includes a section title chip poking below a shallow frame", () => {
    const section: InteractiveCanvasObject = {
      id: "sec",
      type: "section",
      text: "Zone",
      geometry: { x: 0, y: 0, width: 300, height: 20 },
      style: { shape: "section" },
    };
    // Chip: 3px inset + 27px tall → bottom edge at y 30, below the 20px frame.
    expect(paintedBounds(makeDocument([section]), undefined, FIGJAM_CANVAS_STYLE)).toEqual({ x: 0, y: 0, width: 300, height: 30 });
  });

  it("includes an icon's caption band below the glyph box", () => {
    const icon: InteractiveCanvasObject = {
      id: "i",
      type: "icon",
      icon: "bolt",
      text: "A long caption that wraps below the glyph",
      geometry: { x: 0, y: 0, width: 120, height: 120 },
      style: { shape: "icon" },
    };
    const painted = paintedBounds(makeDocument([icon]));
    const local = belowExtendedBoundsPx(icon);
    expect(painted).toEqual({ x: local.x, y: local.y, width: local.width, height: local.height });
    expect(painted.y + painted.height).toBeGreaterThan(120);
    expect(objectPaintedBounds(icon)).toEqual(painted);
  });

  it("includes an icon's detail line under the caption, sized in the style's detail font", () => {
    const icon: InteractiveCanvasObject = {
      id: "i",
      type: "icon",
      icon: "database",
      text: "Orders DB",
      detail: "s3://customer-data/normalized/2026/records.parquet",
      geometry: { x: 0, y: 0, width: 64, height: 64 },
      style: { shape: "icon" },
    };
    const plain = { ...icon, detail: undefined };
    const light = canvasThemePreset("schematic-light");
    // Name line (18) + 3px gap + one 14px mono line at 1.3.
    expect(objectPaintedBounds(icon, light).height).toBe(objectPaintedBounds(plain, light).height + 3 + 14 * 1.3);
    // The long detail widens the band to its 200px max.
    expect(objectPaintedBounds(icon, light).width).toBe(200);
    // Figjam's detail line is 13px sans.
    expect(objectPaintedBounds(icon, FIGJAM_CANVAS_STYLE).height).toBe(objectPaintedBounds(plain, FIGJAM_CANVAS_STYLE).height + 3 + 13 * 1.3);
    expect(paintedBounds(makeDocument([icon]), undefined, light)).toEqual(objectPaintedBounds(icon, light));
  });

  it("targets a subset: connections touching a target count, unrelated objects do not", () => {
    const a = box("a", 0, 0);
    const b = box("b", 600, 0);
    const far = box("far", 0, 2000);
    const document = makeDocument(
      [a, b, far],
      [{ id: "c", from: { objectId: "a" }, to: { objectId: "b" }, arrow: "forward" }],
    );
    const painted = paintedBounds(document, new Set(["a"]));
    // The route to b's border is part of a's painted picture…
    expect(painted.x + painted.width).toBeGreaterThanOrEqual(600);
    // …but the unrelated far object is not.
    expect(painted.y + painted.height).toBeLessThan(1000);
    // Naming the connection id directly also pulls in its painted route.
    const byConnection = paintedBounds(document, new Set(["c"]));
    const direct = connectionPaintedBounds(document, document.connections[0]!);
    expect(direct).not.toBeNull();
    expectContains(byConnection, direct!);
  });

  it("is deterministic", () => {
    const document = makeDocument(
      [box("a", 0, 0), box("b", 600, 0), box("wall", 300, -220, 120, 520)],
      [{ id: "c", from: { objectId: "a" }, to: { objectId: "b" }, arrow: "forward", label: "edge" }],
    );
    expect(paintedBounds(document)).toEqual(paintedBounds(document));
  });
});

describe("painted bounds under a theme", () => {
  it("measures connection label chips at the size the style draws them", () => {
    const document = makeDocument(
      [box("a", 0, 0), box("b", 600, 0)],
      [{ id: "c", from: { objectId: "a" }, to: { objectId: "b" }, arrow: "forward", label: "read/write" }],
    );
    const connection = document.connections[0]!;
    const figjam = connectionPaintedBounds(document, connection, FIGJAM_CANVAS_STYLE)!;
    const light = connectionPaintedBounds(document, connection, canvasThemePreset("schematic-light"))!;
    // A straight route at y 40: the chip alone sets the height (30px sans vs 26px mono).
    expect(figjam.height).toBe(30);
    expect(light.height).toBe(26);
    expect(paintedBounds(document, new Set(["c"]), canvasThemePreset("schematic-light"))).toEqual(light);
  });
});
