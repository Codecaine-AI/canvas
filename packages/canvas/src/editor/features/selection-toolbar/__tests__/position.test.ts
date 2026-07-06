import { describe, expect, it } from "bun:test";
import { positionSelectionToolbar } from "../position";

const VIEWPORT = { width: 1200, height: 800 };
const TOOLBAR = { width: 300, height: 30 };

describe("positionSelectionToolbar", () => {
  it("centers the toolbar horizontally on the selection and floats 27px above it, in the common case", () => {
    const selection = { x: 500, y: 300, width: 100, height: 60 };
    const result = positionSelectionToolbar(selection, TOOLBAR, VIEWPORT);
    expect(result.placement).toBe("above");
    // selection center x = 550; toolbar centered => x = 550 - 150 = 400
    expect(result.x).toBe(400);
    // y = selection.y - 27 - toolbar.height = 300 - 27 - 30 = 243
    expect(result.y).toBe(243);
  });

  it("clamps to the left viewport edge when the selection is near x=0", () => {
    const selection = { x: 0, y: 300, width: 40, height: 40 };
    const result = positionSelectionToolbar(selection, TOOLBAR, VIEWPORT);
    // naive center would be negative; clamp to the 8px margin
    expect(result.x).toBe(8);
    expect(result.x).toBeGreaterThanOrEqual(0);
  });

  it("clamps to the right viewport edge when the selection is near the right edge", () => {
    const selection = { x: 1150, y: 300, width: 40, height: 40 };
    const result = positionSelectionToolbar(selection, TOOLBAR, VIEWPORT);
    const maxX = VIEWPORT.width - TOOLBAR.width - 8;
    expect(result.x).toBe(maxX);
    expect(result.x + TOOLBAR.width).toBeLessThanOrEqual(VIEWPORT.width);
  });

  it("flips below the selection when there isn't enough room above (selection near the top)", () => {
    const selection = { x: 500, y: 10, width: 100, height: 40 };
    const result = positionSelectionToolbar(selection, TOOLBAR, VIEWPORT);
    expect(result.placement).toBe("below");
    expect(result.y).toBe(10 + 40 + 27); // selection.y + height + gap
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it("clamps vertically inside the viewport even in the flipped-below case near the bottom", () => {
    // Selection near the very top AND toolbar so tall the flipped position would also be fine,
    // but we also verify the bottom clamp independently:
    const selection = { x: 500, y: 780, width: 100, height: 400 };
    // Selection extends far below the viewport; aboveY should have plenty of room so we stay "above".
    const result = positionSelectionToolbar(selection, TOOLBAR, VIEWPORT);
    expect(result.y + TOOLBAR.height).toBeLessThanOrEqual(VIEWPORT.height - 8 + 1e-6);
    expect(result.y).toBeGreaterThanOrEqual(8 - 1e-6);
  });

  it("never returns a rect that extends outside the viewport on any side, across a grid of selections", () => {
    for (const x of [-50, 0, 300, 600, 900, 1150, 1400]) {
      for (const y of [-50, 0, 100, 400, 700, 900]) {
        const selection = { x, y, width: 80, height: 50 };
        const result = positionSelectionToolbar(selection, TOOLBAR, VIEWPORT);
        expect(result.x).toBeGreaterThanOrEqual(0);
        expect(result.y).toBeGreaterThanOrEqual(0);
        expect(result.x + TOOLBAR.width).toBeLessThanOrEqual(VIEWPORT.width);
        expect(result.y + TOOLBAR.height).toBeLessThanOrEqual(VIEWPORT.height);
      }
    }
  });

  it("falls back to centering when the toolbar is wider than the viewport minus margins", () => {
    const hugeToolbar = { width: 5000, height: 30 };
    const selection = { x: 500, y: 300, width: 100, height: 60 };
    const result = positionSelectionToolbar(selection, hugeToolbar, VIEWPORT);
    expect(result.x).toBe((VIEWPORT.width - hugeToolbar.width) / 2);
  });

  it("is deterministic for identical inputs", () => {
    const selection = { x: 234, y: 456, width: 77, height: 33 };
    const a = positionSelectionToolbar(selection, TOOLBAR, VIEWPORT);
    const b = positionSelectionToolbar(selection, TOOLBAR, VIEWPORT);
    expect(a).toEqual(b);
  });
});
