/**
 * Round-trip promotion of the lab's dev assertions (SketchView's DEV block and
 * scratchpad/verify-v3-grammar.ts):
 *  - corpus fixture programs re-serialize byte-exactly after a parse;
 *  - fitting every real board round-trips fit → serialize → parse to a
 *    deep-equal sketch whose re-serialization is the exact same text.
 */
import { describe, expect, test } from "bun:test";

import { fitSketch, parseSketch, serializeSketch } from "../src/pipeline";
import { loadCanvasBoards, loadFixtures } from "./helpers";

describe("corpus fixture programs", () => {
  for (const fixture of loadFixtures()) {
    test(`${fixture.file} parse → serialize is byte-exact`, () => {
      const parsed = parseSketch(fixture.text);
      expect(serializeSketch(parsed)).toBe(fixture.text);
    });
  }
});

describe("board fixtures", () => {
  for (const { file, document } of loadCanvasBoards()) {
    test(`${file} fit → serialize → parse round-trips`, () => {
      const fitted = fitSketch(document);
      const text = serializeSketch(fitted);
      const parsed = parseSketch(text);
      // Deep equality of the sketch model (the lab's JSON.stringify check).
      expect(JSON.stringify(parsed)).toBe(JSON.stringify(fitted));
      // Exact re-serialized text (verify-v3-grammar's exact-text check).
      expect(serializeSketch(parsed)).toBe(text);
    });
  }
});
