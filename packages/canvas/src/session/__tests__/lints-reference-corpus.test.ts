/** Reference boards calibrate lint changes; they are not exempt from real defects.
 * Same-hue regions are judged visually; rendered wire and label obstructions
 * are covered-content's and broken-edges' checks.
 * Count ceilings catch unexpected expansion, not correctness of each finding.
 * They count the findings that block a finalize; notes (text within a pixel of
 * its box edge, characters the bundled fonts lack) never block and are pinned
 * separately.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "../../state/schema";

import { LAYOUT_RULES } from "../../board/lints";

const CORPUS_DIR = join(import.meta.dir, "..", "..", "..", "..", "..", "canvases");

/**
 * Measured ceilings; inspect individual findings before changing these.
 * Re-measured when the lints were cut to visible defects only (covered-content
 * overlaps, broken-edges, clipped-text, containment): every count left is a
 * real clip or a chip lying on another wire.
 */
const CEILING: Record<string, number> = {
  "agent-flows-2": 0,
  // rect-prompt-code's 34-line XML prompt does not fit its 800×640 box, and
  // sticky-alert-mechanism holds one row more than its note paints.
  "bubba-voice": 2,
  "claude-code-researcher": 0,
  // Three label chips lie on conn-epochs-to-scheduler or conn-scheduler-to-board.
  "gc-decomp-harness": 3,
  "ink-diagrams": 0,
  "intent-classification-1": 1,
  "intent-classification-2": 0,
  // sticky-overall-context's body holds 28 rows where the note paints 10.
  "v2-flow": 1,
};

const TOTAL_CEILING = 7;

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

  test("its notes only say what cannot be promised: estimated glyphs and edge-of-box fits", () => {
    const notes = corpus().flatMap((entry) =>
      findings(entry.document)
        .filter((finding) => finding.severity === "note")
        .map((finding) => ({ board: entry.name, rule: finding.rule, message: finding.message })),
    );
    // claude-code-researcher's directory tree draws └ ─ ├, which Inter lacks.
    expect(notes).toContainEqual(expect.objectContaining({ board: "claude-code-researcher", rule: "clipped-text" }));
    for (const note of notes) expect(note.message).toMatch(/estimated:|can't promise/);
  });

  test("the corpus total stays within its ceiling", () => {
    const total = corpus().reduce((sum, entry) => sum + findingCount(entry.document), 0);
    expect(total).toBeLessThanOrEqual(TOTAL_CEILING);
  });
});
