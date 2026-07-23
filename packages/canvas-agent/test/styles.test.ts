/**
 * Style registry gate: every topic file is exported through STYLE_TOPICS,
 * in the documented order, with a usable id/title/prose. Style topics are
 * prose-only — no check(), no diagnostics — so this is the whole contract.
 */
import { describe, expect, test } from "bun:test";

import { STYLE_TOPICS } from "../src/agent/styles";

const EXPECTED_TOPIC_IDS = [
  "spacing-and-corridors",
  "grid-discipline",
  "section-framing",
  "registers-and-rhythm",
  "fan-composition",
  "color-semantics",
  "connectors-and-labels",
  "tree-edge-entry",
  "lanes-and-corridors",
];

describe("style registry (src/agent/styles)", () => {
  test("every topic is exported, in registry order", () => {
    expect(STYLE_TOPICS.map((topic) => topic.id)).toEqual(EXPECTED_TOPIC_IDS);
  });

  test("ids are unique", () => {
    const ids = STYLE_TOPICS.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every topic carries a non-empty title and prose", () => {
    for (const topic of STYLE_TOPICS) {
      expect(topic.title.trim().length, topic.id).toBeGreaterThan(0);
      expect(topic.prose.trim().length, topic.id).toBeGreaterThan(0);
    }
  });

  test("prose stays in the 6-18 line craft-guidance band", () => {
    for (const topic of STYLE_TOPICS) {
      const lines = topic.prose.split("\n").filter((line) => line.trim().length > 0);
      expect(lines.length, `${topic.id} has ${lines.length} lines`).toBeGreaterThanOrEqual(6);
      expect(lines.length, `${topic.id} has ${lines.length} lines`).toBeLessThanOrEqual(18);
    }
  });
});
