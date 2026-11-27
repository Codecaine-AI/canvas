import { describe, expect, it } from "bun:test";
import { positionFlyoutCenteredOnTrigger, positionSelectionToolbar } from "../position";

const VIEWPORT = { width: 1200, height: 800 };
const TOOLBAR = { width: 300, height: 30 };

describe("positionSelectionToolbar", () => {
  it("centers the toolbar horizontally on the selection and clears anchor dots above it, in the common case", () => {
    const selection = { x: 500, y: 300, width: 100, height: 60 };
    const result = positionSelectionToolbar(selection, TOOLBAR, VIEWPORT);
    expect(result.placement).toBe("above");
    // selection center x = 550; toolbar centered => x = 550 - 150 = 400
    expect(result.x).toBe(400);
    // y = selection.y - 40 - toolbar.height = 300 - 40 - 30 = 230
    expect(result.y).toBe(230);
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
});

describe("positionFlyoutCenteredOnTrigger", () => {
  const toolbar = { x: 400, y: 300, width: 300, height: 48 };
  const flyoutWidth = 120;
  const viewportWidth = 1200;

  it("centers the flyout horizontally on the trigger in the common case", () => {
    const trigger = { x: 500, y: 304, width: 40, height: 36 };
    const result = positionFlyoutCenteredOnTrigger(trigger, flyoutWidth, toolbar, viewportWidth);
    // trigger center x = 520; flyout centered in viewport => x = 520 - 60 = 460
    // returned offset is relative to toolbar x=400
    expect(result).toBe(60);
  });
});
