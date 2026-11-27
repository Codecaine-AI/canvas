import { describe, expect, test } from "bun:test";

import { judgePngSize, renderAtJudgeSize } from "../judge-size";

describe("judged board PNG size", () => {
  test("caps a square board larger than 2576 px at 2576 on both edges", () => {
    expect(judgePngSize({ width: 5152, height: 5152 })).toEqual({ width: 2576, height: 2576, scale: 0.5 });
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
  });
});
