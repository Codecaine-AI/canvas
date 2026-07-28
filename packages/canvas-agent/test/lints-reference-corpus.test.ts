/**
 * Lint calibration gate against the reference corpus.
 *
 * `canvases/*.canvas.json` are the hand-authored boards this system exists to
 * emulate. A diagnostic firing on one of them is, by definition, the rule
 * disagreeing with the standard rather than the board being wrong — so these
 * counts are a ratchet. They may fall freely; a rule change that raises one is
 * the rule drifting from catching defects toward enforcing taste, which is the
 * failure this file exists to catch.
 *
 * Preferred spacing is not a lint's business. The composition targets — node
 * size, sibling gaps, section gutters, padding, decomposition — live in the
 * system prompt, where they read as targets rather than as warnings.
 *
 * What still fires here is genuine: of the crowding findings, the largest
 * group is boxes sitting 0px apart, which is a real defect that
 * covered-content also owns. The rest are 28–64px gaps, below the clearance a
 * routed wire and its chip physically need.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { LAYOUT_RULES } from "../src/board/lints";

const CORPUS_DIR = join(import.meta.dir, "..", "..", "..", "canvases");

/** Ceilings, not expectations: measured, and only ever revised downward. */
const CEILING: Record<string, number> = {
  "agent-flows-2": 3,
  "bubba-voice": 6,
  "claude-code-researcher": 0,
  "gc-decomp-harness": 19,
  "ink-diagrams": 17,
  "intent-classification-1": 2,
  "intent-classification-2": 7,
  "v2-flow": 5,
};

const TOTAL_CEILING = 59;

function corpus(): { name: string; document: InteractiveCanvasDocument }[] {
  return readdirSync(CORPUS_DIR)
    .filter((file) => file.endsWith(".canvas.json"))
    .map((file) => ({
      name: file.replace(".canvas.json", ""),
      document: JSON.parse(readFileSync(join(CORPUS_DIR, file), "utf8")) as InteractiveCanvasDocument,
    }));
}

function findingCount(document: InteractiveCanvasDocument): number {
  return LAYOUT_RULES.reduce((total, rule) => total + rule.check(document).length, 0);
}

describe("lint calibration against the reference corpus", () => {
  test("covers every board in the corpus", () => {
    expect(corpus().map((entry) => entry.name).sort()).toEqual(Object.keys(CEILING).sort());
  });

  test("no reference board exceeds its ceiling", () => {
    for (const { name, document } of corpus()) {
      expect(findingCount(document), name).toBeLessThanOrEqual(CEILING[name]!);
    }
  });

  test("the corpus total stays within its ceiling", () => {
    const total = corpus().reduce((sum, entry) => sum + findingCount(entry.document), 0);
    expect(total).toBeLessThanOrEqual(TOTAL_CEILING);
  });

  test("the vertical clearance floor sits below the horizontal one", () => {
    // Stacked peers are usually the pair a wire connects, so it runs along the
    // gap rather than across it, and deliberate pairings sit close on purpose.
    // A vertical floor at or above the horizontal one flags ordinary stacking.
    const stacked = corpus().flatMap(({ document }) =>
      LAYOUT_RULES.filter((rule) => rule.id === "crowding")
        .flatMap((rule) => rule.check(document))
        .filter((finding) => !/side by side/.test(finding.message)),
    );
    const gaps = stacked
      .map((finding) => Number(/(\d+)px apart/.exec(finding.message)?.[1]))
      .filter((gap) => Number.isFinite(gap) && gap > 0);
    // Everything still flagged vertically is tighter than the horizontal floor.
    expect(Math.max(...gaps)).toBeLessThan(80);
  });
});
