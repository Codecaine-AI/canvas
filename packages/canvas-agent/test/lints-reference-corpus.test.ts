/** Reference boards calibrate lint changes; they are not exempt from real defects.
 * Same-hue regions are judged visually. Crowding checks visible box separation;
 * rendered wire and label obstructions retain their dedicated checks.
 * Count ceilings catch unexpected expansion, not correctness of each finding.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { LAYOUT_RULES } from "../src/board/lints";

const CORPUS_DIR = join(import.meta.dir, "..", "..", "..", "canvases");

/** Measured ceilings; inspect individual findings before changing these. */
const CEILING: Record<string, number> = {
  "agent-flows-2": 2,
  "bubba-voice": 1,
  "claude-code-researcher": 0,
  "gc-decomp-harness": 13,
  "ink-diagrams": 17,
  "intent-classification-1": 1,
  "intent-classification-2": 0,
  "v2-flow": 1,
};

const TOTAL_CEILING = 35;

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

  test("crowding findings describe near-touching boxes on either axis", () => {
    for (const { document } of corpus()) {
      for (const rule of LAYOUT_RULES.filter(rule => rule.id === "crowding")) {
        for (const finding of rule.check(document)) {
          const gap = Number(/(\d+)px apart/.exec(finding.message)?.[1]);
          expect(gap).toBeLessThan(16);
        }
      }
    }
  });
});
