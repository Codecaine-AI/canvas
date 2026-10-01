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

/**
 * Measured ceilings; inspect individual findings before changing these.
 * The text-convention rules (label-is-prose, detail-too-long) judge only text
 * an agent wrote in its session, and these boards are people's own work read
 * with no session, so those rules never contribute here.
 */
const CEILING: Record<string, number> = {
  "agent-flows-2": 2,
  // 1 → 2 with the schematic 17.5px names: rect-prompt-code's 34-line XML
  // prompt no longer fits its 800×640 box (29 lines of 21px) — a real clip.
  "bubba-voice": 2,
  "claude-code-researcher": 0,
  "gc-decomp-harness": 13,
  "ink-diagrams": 17,
  "intent-classification-1": 1,
  "intent-classification-2": 0,
  // 1 → 2 with the schematic 56px icon-tile cap: chip-generate-transition-response's
  // left anchor moved onto its (now centered, smaller) tile, which pulls the router's
  // mid-elbow leg to 3.7px from `section`'s left border for 447px — a real
  // border-hugging route, not a measurement artifact.
  "v2-flow": 2,
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
