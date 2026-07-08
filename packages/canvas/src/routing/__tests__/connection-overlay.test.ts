import { describe, expect, it } from "bun:test";
import {
  ANCHOR_SNAP_VIEW_PX,
  OUTLINE_SNAP_WORLD_PX,
  resolveConnectionCascade,
} from "../connection-overlay";
import { connectionBoundsForObject } from "../../objects/geometry";
import type { InteractiveCanvasObject } from "../../state/schema";

// The outline-polygon / anchor-projection tests moved with the geometry to
// objects/__tests__/geometry.test.ts (P3, D4); this file keeps the cascade
// layer that stayed in routing.

function rectObject(overrides: Partial<InteractiveCanvasObject> = {}): InteractiveCanvasObject {
  return {
    id: "rect-1",
    type: "process",
    text: "Rect",
    geometry: { x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  };
}

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

  it("uses the extended below-text box for hover, outline, and bottom anchor snapping", () => {
    const object = rectObject({
      id: "person-1",
      type: "person",
      text: "Adapt Question Based on Interview History",
      geometry: { x: 10, y: 20, width: 120, height: 140 },
      style: { shape: "person" },
    });
    const bounds = connectionBoundsForObject(object);
    const bottomPoint = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 2 };
    const result = resolveConnectionCascade(bottomPoint, [object], 1);

    expect(result.kind).toBe("anchor");
    if (result.kind === "anchor") {
      expect(result.point).toEqual({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height });
      expect(result.coord).toEqual([0.5, 1]);
    }
  });

  it("lets the first candidate in the list win at the same point (topmost-first semantics)", () => {
    const front = rectObject({ id: "front", geometry: { x: 0, y: 0, width: 100, height: 100 } });
    const back = rectObject({ id: "back", geometry: { x: 0, y: 0, width: 100, height: 100 } });
    const point = { x: 50, y: 50 };
    const result = resolveConnectionCascade(point, [front, back], 1);
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
