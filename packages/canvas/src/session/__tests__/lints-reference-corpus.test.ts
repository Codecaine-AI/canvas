/** Reference boards calibrate lint changes; they are not exempt from real defects.
 * The one lint left is covered-content (box on box, section on section).
 * Count ceilings catch unexpected expansion, not correctness of each finding.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "../../state/schema";

import { LAYOUT_RULES } from "../../board/lints";

const CORPUS_DIR = join(import.meta.dir, "..", "..", "..", "..", "..", "canvases");

/**
 * Measured ceilings; inspect individual findings before changing these.
 * Re-measured when the lints were cut to overlap only (covered-content):
 * no reference board has a box on a box or a section on a section.
 */
const CEILING: Record<string, number> = {
  "agent-flows-2": 0,
  "bubba-voice": 0,
  "claude-code-researcher": 0,
  "gc-decomp-harness": 0,
  "ink-diagrams": 0,
  "intent-classification-1": 0,
  "intent-classification-2": 0,
  "v2-flow": 0,
};

const TOTAL_CEILING = 0;

function corpus(): { name: string; document: InteractiveCanvasDocument }[] {
  return readdirSync(CORPUS_DIR)
    .filter((file) => file.endsWith(".canvas.json"))
    .map((file) => ({
      name: file.replace(".canvas.json", ""),
      document: JSON.parse(readFileSync(join(CORPUS_DIR, file), "utf8")) as InteractiveCanvasDocument,
    }));
}

function findings(document: InteractiveCanvasDocument) {
  return LAYOUT_RULES.flatMap((rule) => rule.check(document));
}

function findingCount(document: InteractiveCanvasDocument): number {
  return findings(document).filter((finding) => finding.severity !== "note").length;
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
});
