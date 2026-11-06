import { describe, expect, test } from "bun:test";

import { rule as boardTooLarge, BOARD_MAX_EDGE_PX } from "../../board/lints/rules/board-too-large";
import { FINISHING_RULES, LAYOUT_RULES } from "../../board/lints";
import { boardCameraAtWorldScale } from "../../render/views";
import { box, makeDocument } from "./synthetic";

/**
 * The whole board, as the judged render frames it at 1:1 (painted extents,
 * view padding, title chips), keeps its long edge within 2576px. Past it the
 * judge view shrinks the board, so the finishing pass errors.
 */

function boardWithPage(width: number, height: number) {
  return makeDocument([
    box("page", 0, 0, width, height, "section"),
    { ...box("a", 40, 40, 280, 100, "process"), parentId: "page" },
  ]);
}

describe("board-too-large lint", () => {
  test("runs in no product registry: board size is the eval harness's report", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).not.toContain("board-too-large");
    expect(FINISHING_RULES.map((rule) => rule.id)).not.toContain("board-too-large");
  });

  test("a wide board over the cap errors with its size, the cap and the layout fix", () => {
    const document = boardWithPage(4000, 1200);
    const camera = boardCameraAtWorldScale(document);
    const [finding] = boardTooLarge.check(document, {});
    expect(finding?.severity).toBe("error");
    expect(finding?.at).toEqual(["page"]);
    expect(finding?.message).toContain(`board is ${Math.round(camera.width)}×${Math.round(camera.height)}px`);
    expect(finding?.message).toContain(`cap is ${BOARD_MAX_EDGE_PX}px`);
    expect(finding?.suggestion).toContain("stack a long row of sections into 2 rows");
    expect(finding?.suggestion).toContain("never shrink nodes or cut label text");
  });

  test("a tall board over the cap errors too", () => {
    expect(boardTooLarge.check(boardWithPage(1200, 4000), {})).toHaveLength(1);
  });

  test("a board whose padded extent fits the cap is quiet", () => {
    const document = boardWithPage(2400, 2400);
    expect(Math.max(boardCameraAtWorldScale(document).width, boardCameraAtWorldScale(document).height))
      .toBeLessThanOrEqual(BOARD_MAX_EDGE_PX);
    expect(boardTooLarge.check(document, {})).toEqual([]);
  });

  test("the view padding counts: a page frame exactly at the cap is over it", () => {
    expect(boardTooLarge.check(boardWithPage(BOARD_MAX_EDGE_PX, 1200), {})).toHaveLength(1);
  });

  test("a board reopened past the cap still errors", () => {
    const document = boardWithPage(4000, 1200);
    expect(boardTooLarge.check(document, { baseline: document })).toHaveLength(1);
  });
});
