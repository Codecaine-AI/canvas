import { describe, expect, test } from "bun:test";

import { rule as boardTooLarge } from "../../board/lints/rules/board-too-large";
import { FINISHING_RULES, LAYOUT_RULES } from "../../board/lints";
import { DEFAULT_CANVAS_STYLE } from "../../theme/canvas-style";
import { box, makeDocument } from "./synthetic";

/**
 * A board is read whole, fit to one 1600px view. With the default 14px
 * detail and wire-label text, a board whose longer edge passes 2488px prints
 * that text under 9px, and the finishing pass warns with the measured scale.
 */

function board(width: number, height: number) {
  return makeDocument([
    box("page", 0, 0, width, height, "section"),
    { ...box("api", 100, 100, 184, 96, "process"), parentId: "page" },
  ]);
}

const EMPTY_START = { baseline: makeDocument([]), canvasStyle: DEFAULT_CANVAS_STYLE };

describe("board-too-large lint", () => {
  test("runs only in the finishing pass", () => {
    expect(FINISHING_RULES.map((rule) => rule.id)).toContain("board-too-large");
    expect(LAYOUT_RULES.map((rule) => rule.id)).not.toContain("board-too-large");
  });

  test("a wide band warns with the printed text size and the cap", () => {
    const [finding] = boardTooLarge.check(board(4500, 1600), EMPTY_START);
    expect(finding?.severity).toBe("warning");
    expect(finding?.at).toEqual(["page"]);
    expect(finding?.message).toBe(
      "board is 4500×1600px; fit to a 1600px view it renders at 0.36×, "
      + "so 14px details and wire labels print at 5px — keep the longer edge ≤ 2488px",
    );
    expect(finding?.suggestion).toStartWith("cut 2012px from the width: stack sections in rows");
  });

  test("a tall stack is judged on its height", () => {
    const [finding] = boardTooLarge.check(board(1800, 3000), EMPTY_START);
    expect(finding?.suggestion).toStartWith("cut 512px from the height: set stacked sections side by side");
  });

  test("a board within the cap is quiet", () => {
    expect(boardTooLarge.check(board(2400, 2000), EMPTY_START)).toEqual([]);
  });

  test("a board that opened past the cap warns only when the session grows it", () => {
    const opened = { baseline: board(4000, 2000), canvasStyle: DEFAULT_CANVAS_STYLE };
    expect(boardTooLarge.check(board(4000, 2000), opened)).toEqual([]);
    expect(boardTooLarge.check(board(4200, 2000), opened)).toHaveLength(1);
  });
});
