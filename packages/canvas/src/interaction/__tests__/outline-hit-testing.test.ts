/**
 * D16 (P3) — outline-derived hit-testing: hitTestObjects respects each
 * object's def-declared outline (a diamond's empty corners fall through to
 * what's behind), bbox-outline kinds stay byte-identical, and the world-px
 * tolerance keeps the stroke clickable.
 */

import { describe, expect, it } from "bun:test";
import {
  connectionBoundsForObject,
  outlineContainsPoint,
  OUTLINE_HIT_TOLERANCE_WORLD_PX,
} from "../../objects/geometry";
import { sectionTitleChipWorldRect } from "../../objects/section/title-chip-geometry";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { hitTestObjects } from "../hit-testing";

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
    id: "outline-hit-doc",
    mode: "diagram",
    objects,
    connections: [],
  };
}

describe("outlineContainsPoint (D16)", () => {
  it("bbox-outline kinds test the plain bounds — corners included, exactly as pre-D16", () => {
    expect(outlineContainsPoint(rectBehind, { x: 0.5, y: 0.5 })).toBe(true);
    expect(outlineContainsPoint(rectBehind, { x: 50, y: 50 })).toBe(true);
    expect(outlineContainsPoint(rectBehind, { x: -1, y: 50 })).toBe(false);
  });

  it("true-outline kinds reject points inside the bbox but outside the outline", () => {
    // Diamond top-left corner region: edge runs (50,0)->(0,50), i.e. x+y=50.
    expect(outlineContainsPoint(diamond, { x: 5, y: 5 })).toBe(false);
    expect(outlineContainsPoint(diamond, { x: 50, y: 50 })).toBe(true);
  });

  it("keeps the stroke clickable: points within the world-px tolerance of the outline still hit", () => {
    expect(OUTLINE_HIT_TOLERANCE_WORLD_PX).toBe(4);
    // (23,23) is ~2.83 world px outside the x+y=50 edge -> inside tolerance.
    expect(outlineContainsPoint(diamond, { x: 23, y: 23 })).toBe(true);
    // (20,20) is ~7.07 world px outside -> beyond tolerance.
    expect(outlineContainsPoint(diamond, { x: 20, y: 20 })).toBe(false);
  });
});

describe("hitTestObjects (D16)", () => {
  it("clicking a diamond's empty corner falls through to the object behind", () => {
    const hit = hitTestObjects(doc([rectBehind, diamond]), { x: 5, y: 5 });
    expect(hit?.id).toBe("rect-behind");
  });

  it("clicking a diamond's empty corner with nothing behind resolves to null (canvas)", () => {
    expect(hitTestObjects(doc([diamond]), { x: 5, y: 5 })).toBeNull();
  });

  it("clicking inside the diamond outline hits the diamond (topmost wins)", () => {
    const hit = hitTestObjects(doc([rectBehind, diamond]), { x: 50, y: 50 });
    expect(hit?.id).toBe("diamond");
  });

  it("bbox-outline objects hit on their full box, corners included (byte-identical to pre-D16)", () => {
    const hit = hitTestObjects(doc([rectBehind]), { x: 0.5, y: 0.5 });
    expect(hit?.id).toBe("rect-behind");
  });

  it("below-slot text outside stored geometry hits the object", () => {
    const person: InteractiveCanvasObject = {
      id: "person",
      type: "icon",
      icon: "person",
      text: "Adapt Question Based on Interview History",
      geometry: { x: 10, y: 20, width: 120, height: 140 },
      style: { shape: "icon" },
    };
    const bounds = connectionBoundsForObject(person);
    const hit = hitTestObjects(doc([person]), {
      x: bounds.x + bounds.width / 2,
      y: person.geometry.y + person.geometry.height + 12,
    });

    expect(hit?.id).toBe("person");
  });

  it("checks zoom-scaled section title chips before overlapping foreign objects", () => {
    const zoom = 0.25;
    const overlappingRect: InteractiveCanvasObject = {
      id: "overlapping-rect",
      type: "process",
      text: "Overlapping rect",
      geometry: { x: 0, y: 30, width: 80, height: 80 },
    };
    const chipRect = sectionTitleChipWorldRect(shortSection, zoom);
    const point = {
      x: chipRect.x + 8,
      y: chipRect.y + chipRect.height - 8,
    };

    expect(point.y).toBeGreaterThan(shortSection.geometry.y + shortSection.geometry.height);
    expect(point.x).toBeGreaterThanOrEqual(overlappingRect.geometry.x);
    expect(point.x).toBeLessThanOrEqual(overlappingRect.geometry.x + overlappingRect.geometry.width);
    expect(point.y).toBeGreaterThanOrEqual(overlappingRect.geometry.y);
    expect(point.y).toBeLessThanOrEqual(overlappingRect.geometry.y + overlappingRect.geometry.height);
    expect(hitTestObjects(doc([shortSection, overlappingRect]), point, { zoom })?.id).toBe("short-section");
  });
});
