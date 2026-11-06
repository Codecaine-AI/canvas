import { describe, expect, test } from "bun:test";

import { JUDGE_PNG_MAX_EDGE } from "../../../../canvas/src/render/judge-size.ts";
import { boardExtent } from "./render.ts";

describe("climb render board extent", () => {
  test("reports the long edge and flags a board past the judge cap", () => {
    expect(boardExtent({ width: 3000.4, height: 1200 })).toEqual({ longEdge: 3000, overJudgeCap: true });
    expect(boardExtent({ width: 1200, height: JUDGE_PNG_MAX_EDGE })).toEqual({ longEdge: JUDGE_PNG_MAX_EDGE, overJudgeCap: false });
  });
});
