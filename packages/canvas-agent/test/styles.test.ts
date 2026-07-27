/**
 * Style registry and craft-target gate: every topic file is exported through
 * STYLE_TOPICS in the documented order, with a usable id/title/prose. Topics
 * are prose-only — no check(), no diagnostics. Every craft-target dimension
 * sits above the lint floor on its matching axis and stays internally coherent.
 */
import { describe, expect, test } from "bun:test";

import { CRAFT_TARGETS, STYLE_TOPICS } from "../src/agent/catalog/layout-editor/context/style-guide";

const EXPECTED_TOPIC_IDS = [
  "aesthetic",
];

describe("style registry (catalog/layout-editor/context/style-guide)", () => {
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
      expect(lines.length, `${topic.id} has ${lines.length} lines`).toBeLessThanOrEqual(36);
    }
  });
});

describe("craft targets", () => {
  // Hard clearance floors live in src/board/lints/rules/crowding.ts
  // and src/board/lints/rules/containment.ts.
  const LINT_FLOORS = {
    nodeGapRow: 80,
    nodeGapColumn: 48,
    arrowCorridor: 80,
    framePadding: 16,
  } as const;

  test("every clearance target sits strictly above its matching lint floor", () => {
    expect(CRAFT_TARGETS.nodeGapRow).toBeGreaterThan(LINT_FLOORS.nodeGapRow);
    expect(CRAFT_TARGETS.nodeGapColumn).toBeGreaterThan(LINT_FLOORS.nodeGapColumn);
    expect(CRAFT_TARGETS.arrowCorridor).toBeGreaterThan(LINT_FLOORS.arrowCorridor);
    expect(CRAFT_TARGETS.framePadding).toBeGreaterThan(LINT_FLOORS.framePadding);
  });

  test("clearance targets do not collide with their applicable lint floor", () => {
    expect(CRAFT_TARGETS.nodeGapRow).not.toBe(LINT_FLOORS.nodeGapRow);
    expect(CRAFT_TARGETS.nodeGapColumn).not.toBe(LINT_FLOORS.nodeGapColumn);
    expect(CRAFT_TARGETS.arrowCorridor).not.toBe(LINT_FLOORS.arrowCorridor);
    expect(CRAFT_TARGETS.framePadding).not.toBe(LINT_FLOORS.framePadding);
  });

  test("dimensions, gutters, section load, and board density stay coherent", () => {
    expect(CRAFT_TARGETS.nodeMinWidth).toBeLessThan(CRAFT_TARGETS.nodeWidth);
    expect(CRAFT_TARGETS.sectionGutterSideBySide).toBeGreaterThanOrEqual(
      CRAFT_TARGETS.nodeGapRow,
    );
    expect(CRAFT_TARGETS.sectionGutterStacked).toBeGreaterThan(
      CRAFT_TARGETS.sectionGutterSideBySide,
    );
    expect(CRAFT_TARGETS.nodesPerSectionMin).toBeLessThan(
      CRAFT_TARGETS.nodesPerSectionMax,
    );
    expect(CRAFT_TARGETS.boardAreaMultiple).toBeGreaterThan(1);
    expect(CRAFT_TARGETS.inkShare).toBeGreaterThan(0);
    expect(CRAFT_TARGETS.inkShare).toBeLessThan(1);
  });

  test("every numeric field is positive and finite", () => {
    for (const [field, value] of Object.entries(CRAFT_TARGETS)) {
      expect(Number.isFinite(value), field).toBe(true);
      expect(value, field).toBeGreaterThan(0);
    }
  });
});
