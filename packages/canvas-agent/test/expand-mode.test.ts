import { describe, expect, test } from "bun:test";

import { expandSketch, parseSketch } from "../src/pipeline";

const PROGRAM = [
  'section 1 text=frame label="Frame"',
  "  item 2 text=task type=predefined-process size=M at=C",
  "",
  "arrows",
].join("\n");

const FRAME = { width: 352, height: 160 } as const;

describe("expand solve modes", () => {
  test("fit scales into the frame while natural grows it", () => {
    const sketch = parseSketch(PROGRAM);
    const fit = expandSketch(sketch, { ...FRAME, mode: "fit" });
    const natural = expandSketch(sketch, { ...FRAME, mode: "natural" });

    expect(fit.bounds).toEqual({ x: 0, y: 0, ...FRAME });
    expect(fit.objects.find((object) => object.id === "task")?.geometry).toEqual({
      x: 92,
      y: 51,
      width: 169,
      height: 84,
    });
    expect(natural.bounds).toEqual({ x: 0, y: 0, width: 352, height: 304 });
    expect(natural.objects.find((object) => object.id === "task")?.geometry).toEqual({
      x: 76,
      y: 134,
      width: 200,
      height: 100,
    });
  });

  test("expand defaults to natural mode", () => {
    const sketch = parseSketch(PROGRAM);
    expect(expandSketch(sketch, FRAME)).toEqual(
      expandSketch(sketch, { ...FRAME, mode: "natural" }),
    );
  });
});
