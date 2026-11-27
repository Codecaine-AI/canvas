import { describe, expect, it } from "bun:test";
import { positionFlyoutCenteredOnTrigger, positionSelectionToolbar } from "../position";

const VIEWPORT = { width: 1200, height: 800 };
const TOOLBAR = { width: 300, height: 30 };

describe("positionSelectionToolbar", () => {
  // Gap between selection and toolbar is 40px; viewport margin is 8px.
  it.each([
    // selection center x = 550; toolbar centered => x = 550 - 150 = 400;
    // y = selection.y - 40 - toolbar.height = 300 - 40 - 30 = 230
    ["common case", { x: 500, y: 300, width: 100, height: 60 }, TOOLBAR, { x: 400, y: 230, placement: "above" }],
    // naive center x = 20 - 150 < 0; clamp to the 8px margin
    ["left edge clamp", { x: 0, y: 300, width: 40, height: 40 }, TOOLBAR, { x: 8, y: 230, placement: "above" }],
    // naive center x = 1170 - 150 = 1020; clamp to 1200 - 300 - 8 = 892
    ["right edge clamp", { x: 1150, y: 300, width: 40, height: 40 }, TOOLBAR, { x: 892, y: 230, placement: "above" }],
    // above y = 10 - 70 < 8, so flip below: y = 10 + 40 + 40 = 90
    ["flip below near the top", { x: 500, y: 10, width: 100, height: 40 }, TOOLBAR, { x: 400, y: 90, placement: "below" }],
    // selection runs past the bottom; above y = 780 - 70 = 710 stays inside [8, 762]
    ["bottom vertical clamp", { x: 500, y: 780, width: 100, height: 400 }, TOOLBAR, { x: 400, y: 710, placement: "above" }],
    // toolbar wider than viewport minus margins: center fallback (1200 - 5000) / 2
    ["oversized toolbar", { x: 500, y: 300, width: 100, height: 60 }, { width: 5000, height: 30 }, { x: -1900, y: 230, placement: "above" }],
  ] as const)(
    "centers the toolbar horizontally on the selection and clears anchor dots above it, in the common case, and clamps or flips it at the viewport edges (%s)",
    (_label, selection, toolbar, expected) => {
      expect(positionSelectionToolbar(selection, toolbar, VIEWPORT)).toEqual(expected);
    },
  );

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
  const viewportWidth = 1200;

  // Returned offset is relative to toolbar x=400; viewport margin is 8px.
  it.each([
    // trigger center x = 520; flyout centered => x = 520 - 60 = 460 => offset 60
    ["common case", { x: 500, y: 304, width: 40, height: 36 }, 120, 60],
    // center x = 18 - 60 < 8 => clamp to 8 => offset 8 - 400
    ["left edge clamp", { x: 2, y: 304, width: 32, height: 36 }, 120, -392],
    // center x = 1196 - 60 = 1136 => clamp to 1200 - 120 - 8 = 1072 => offset 672
    ["right edge clamp", { x: 1180, y: 304, width: 32, height: 36 }, 120, 672],
    // flyout wider than viewport minus margins: (1200 - 5000) / 2 - 400
    ["oversized flyout", { x: 500, y: 304, width: 40, height: 36 }, 5000, -2300],
  ] as const)(
    "centers the flyout horizontally on the trigger in the common case, clamped to the viewport (%s)",
    (_label, trigger, flyoutWidth, expectedOffset) => {
      expect(positionFlyoutCenteredOnTrigger(trigger, flyoutWidth, toolbar, viewportWidth)).toBe(expectedOffset);
    },
  );
});
