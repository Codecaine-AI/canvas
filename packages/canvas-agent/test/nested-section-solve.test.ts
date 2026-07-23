import { describe, expect, test } from "bun:test";

import {
  expandSketch,
  fitScope,
  parseSketch,
  type ExpandedSketchObject,
} from "../src/pipeline";
import { loadCanvasBoards } from "./helpers";

// Verbatim from the failing kernel trace. In particular, keep the non-linear
// declaration ordinals (10 before 7): they preserve the existing legend ids
// while introducing one new section.
const WRECKED_LAYOUT_PROGRAM = [
  'section 1 text=one-state-two-readers label="One state, two readers"',
  '  section 2 text=canonical-state label="Canonical document state — stable, validated, addressable"',
  "    row 3|2|3",
  '      section 3 text=human-surface label="Human surface"',
  "        col 1|1",
  "          item 4 text=human-manipulation type=process size=S at=C",
  "          item 5 text=human-detail type=sticky size=L at=C",
  "      col 1|1",
  "        item 6 text=shared-contract type=pill size=M at=C",
  '        section 10 text=new-section label="New section"',
  "          group",
  '      section 7 text=agent-surface label="Agent surface"',
  "        col 1|1",
  "          item 8 text=agent-render type=document size=S at=C",
  "          item 9 text=agent-detail type=sticky size=L at=C",
  "",
  "arrows",
].join("\n");

function expectSectionContainsWithTrim(
  byId: ReadonlyMap<string, ExpandedSketchObject>,
  sectionId: string,
  childIds: readonly string[],
): void {
  const section = byId.get(sectionId)!.geometry;
  const children = childIds.map((id) => byId.get(id)!.geometry);
  const left = Math.min(...children.map((child) => child.x));
  const top = Math.min(...children.map((child) => child.y));
  const right = Math.max(...children.map((child) => child.x + child.width));
  const bottom = Math.max(...children.map((child) => child.y + child.height));

  // Section trim is the 64px label strip plus 48px content padding. The
  // one-pixel tolerance only absorbs integer rounding at solved boundaries.
  expect(left - section.x).toBeGreaterThanOrEqual(47);
  expect(top - section.y).toBeGreaterThanOrEqual(111);
  expect(section.x + section.width - right).toBeGreaterThanOrEqual(47);
  expect(section.y + section.height - bottom).toBeGreaterThanOrEqual(47);
}

describe("nested-section natural-size solve regression", () => {
  test("whole-board scoped solve grows instead of crushing nested sections", () => {
    const board = loadCanvasBoards()
      .find(({ file }) => file === "interaction-surfaces.canvas.json")!;
    const fit = fitScope(board.document, ["one-state-two-readers"]);

    // This is the captured board's whole-board frame and declaration legend.
    expect(fit.frame).toEqual({
      x: 835.9534374999998,
      y: 439.39937499999996,
      width: 1120,
      height: 560,
    });
    expect(fit.legend.items.map(({ ordinal, id }) => ({ ordinal, id }))).toEqual([
      { ordinal: 1, id: "one-state-two-readers" },
      { ordinal: 2, id: "human-surface" },
      { ordinal: 3, id: "human-detail" },
      { ordinal: 4, id: "canonical-state" },
      { ordinal: 5, id: "shared-contract" },
      { ordinal: 6, id: "agent-surface" },
      { ordinal: 7, id: "agent-detail" },
    ]);

    const expanded = expandSketch(parseSketch(WRECKED_LAYOUT_PROGRAM), {
      width: fit.frame.width,
      height: fit.frame.height,
    });
    const byId = new Map(expanded.objects.map((object) => [object.id, object]));

    // A too-small scope is a request to make room, never to miniaturize. This
    // program's natural footprint exceeds both dimensions of the live frame.
    expect(expanded.bounds.width).toBeGreaterThan(fit.frame.width);
    expect(expanded.bounds.height).toBeGreaterThan(fit.frame.height);
    expect(byId.get("one-state-two-readers")!.geometry).toEqual(expanded.bounds);

    // Size classes are minimum dimensions. Sticky uses the pipeline's
    // corpus-mined 384x288 base; all other bases are canvas type defaults.
    const itemMinimums: Record<string, readonly [number, number]> = {
      "human-manipulation": [132, 69], // process S: 184x96 * .72
      "human-detail": [518, 389], // sticky L: 384x288 * 1.35
      "shared-contract": [200, 64], // pill M
      "agent-render": [115, 86], // document S: 160x120 * .72
      "agent-detail": [518, 389], // sticky L
    };
    for (const [id, [minimumWidth, minimumHeight]] of Object.entries(itemMinimums)) {
      const geometry = byId.get(id)!.geometry;
      expect(geometry.width).toBeGreaterThanOrEqual(minimumWidth);
      expect(geometry.height).toBeGreaterThanOrEqual(minimumHeight);
    }

    // Every non-empty section owns the content bounds plus its complete label
    // strip and padding, at every nesting level.
    expectSectionContainsWithTrim(byId, "human-surface", [
      "human-manipulation",
      "human-detail",
    ]);
    expectSectionContainsWithTrim(byId, "agent-surface", [
      "agent-render",
      "agent-detail",
    ]);
    expectSectionContainsWithTrim(byId, "canonical-state", [
      "human-surface",
      "shared-contract",
      "new-section",
      "agent-surface",
    ]);
    expectSectionContainsWithTrim(byId, "one-state-two-readers", [
      "canonical-state",
    ]);

    // The empty group keeps a compact placeholder instead of inheriting a
    // large weighted band or collapsing to an illegible sliver.
    expect(byId.get("new-section")!.geometry.width).toBeGreaterThanOrEqual(112);
    expect(byId.get("new-section")!.geometry.height).toBeGreaterThanOrEqual(96);
  });
});
