/**
 * No-crossing promotion of the lab's dev assertion (SketchView's DEV block)
 * and the docs-board generator's hard gate: corridor routing must never send
 * a connector through a non-endpoint box.
 */
import { describe, expect, test } from "bun:test";

import {
  countPathBoxViolations,
  expandSketch,
  fitSketch,
  parseSketch,
  routeSketchEdges,
  serializeSketch,
} from "../src/pipeline";
import { dimensionFor, loadCanvasBoards, loadFixtures } from "./helpers";

describe("corpus fixture programs", () => {
  for (const fixture of loadFixtures()) {
    test(`${fixture.file} routes with zero box violations`, () => {
      const expanded = expandSketch(parseSketch(fixture.text), {
        width: fixture.width,
        height: fixture.height,
      });
      const routed = routeSketchEdges(expanded, "corridors");
      expect(countPathBoxViolations(routed, expanded.objects)).toBe(0);
    });
  }
});

describe("board fixtures", () => {
  for (const { file, document } of loadCanvasBoards()) {
    test(`${file} fitted round-trip routes with zero box violations`, () => {
      const roundTripped = parseSketch(serializeSketch(fitSketch(document)));
      const expanded = expandSketch(roundTripped, dimensionFor(document));
      const routed = routeSketchEdges(expanded, "corridors");
      expect(countPathBoxViolations(routed, expanded.objects)).toBe(0);
    });
  }
});
