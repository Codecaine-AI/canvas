/**
 * D16 (P3) — context-menu retargeting: right-clicking a true-outline shape's
 * empty bbox corner opens the menu of the object actually under the point
 * (outline-wise), or falls back to the canvas menu.
 */

import { describe, expect, it } from "bun:test";
import { sectionTitleChipWorldRect } from "../../../../../objects/section/title-chip-geometry";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../../../../state/schema";
import { resolveContextMenuTarget } from "../use-canvas-context-menu";

const diamond: InteractiveCanvasObject = {
  id: "diamond",
  type: "decision",
  text: "Diamond",
  geometry: { x: 0, y: 0, width: 100, height: 100 },
  style: { shape: "diamond" },
};

const rectBehind: InteractiveCanvasObject = {
  id: "rect-behind",
  type: "process",
  text: "Rect",
  geometry: { x: 0, y: 0, width: 100, height: 100 },
};

const shortSection: InteractiveCanvasObject = {
  id: "short-section",
  type: "section",
  text: "Short section",
  geometry: { x: 0, y: 0, width: 100, height: 20 },
};

function doc(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "context-retarget-doc",
    mode: "diagram",
    objects,
    connections: [],
  };
}

describe("resolveContextMenuTarget (D16)", () => {
  it("keeps the clicked object when the point is inside its outline", () => {
    expect(resolveContextMenuTarget(doc([diamond]), diamond, { x: 50, y: 50 })?.id).toBe("diamond");
  });

  it("retargets a corner click to the object behind", () => {
    expect(
      resolveContextMenuTarget(doc([rectBehind, diamond]), diamond, { x: 5, y: 5 })?.id,
    ).toBe("rect-behind");
  });

  it("returns null (canvas menu) for a corner click with nothing behind", () => {
    expect(resolveContextMenuTarget(doc([diamond]), diamond, { x: 5, y: 5 })).toBeNull();
  });

  it("can retarget back to a section through its zoom-scaled title chip", () => {
    const zoom = 0.25;
    const point = sectionTitleChipWorldRect(shortSection, zoom);
    expect(
      resolveContextMenuTarget(
        doc([shortSection]),
        shortSection,
        { x: point.x + 8, y: point.y + point.height - 8 },
        { zoom },
      )?.id,
    ).toBe("short-section");
  });
});
