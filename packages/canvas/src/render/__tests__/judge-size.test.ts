import { describe, expect, test } from "bun:test";

import { judgePngSize, renderAtJudgeSize } from "../judge-size";

describe("judged board PNG size", () => {
  test.each([
    [{ width: 5152, height: 5152 }, { width: 2576, height: 2576, scale: 0.5 }],
    [{ width: 10304, height: 3000 }, { width: 2576, height: 750, scale: 0.25 }],
    [{ width: 1500, height: 5152 }, { width: 750, height: 2576, scale: 0.5 }],
    [{ width: 1840.4, height: 1210.6 }, { width: 1840, height: 1211, scale: 1 }],
  ])("caps the longer edge at 2576 px keeping aspect, and never upscales: %p", (board, expected) => {
    expect(judgePngSize(board)).toEqual(expected);
  });
});

describe("renderAtJudgeSize", () => {
  test("re-renders until the width matches the judged width of its own camera", () => {
    // A camera that grows as the width drops, as zoom-scaled title chips make it.
    const widths: number[] = [];
    const view = (width: number) => {
      widths.push(width);
      const world = 3000 + 10000 / width;
      return { camera: { width: world, height: world / 2 } };
    };
    const { width, rendered } = renderAtJudgeSize(view, 1600);
    expect(width).toBe(2576);
    expect(judgePngSize(rendered.camera).width).toBe(width);
    expect(widths).toEqual([1600, 2576]);

    // A board under 2576 px settles at its own 1:1 width.
    const small = renderAtJudgeSize(() => ({ camera: { width: 1840, height: 1200 } }), 1600);
    expect(small.width).toBe(1840);
  });
});
