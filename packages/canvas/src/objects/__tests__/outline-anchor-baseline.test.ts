/**
 * outline-anchor-baseline — the P3 byte-identical gate for connection
 * geometry (OBJECT-DEF-OVERHAUL.md §6-P3, D4): outline polygons, connection
 * anchors, and the connection cascade must not drift while the
 * outlineShapeFor() switch moves into the defs.
 *
 * The fixture was captured against the pre-refactor code (see
 * outline-anchor-corpus.ts for the capture command) and is kept afterwards
 * as a permanent regression corpus. Fresh values are JSON-round-tripped
 * before comparison so the assertion is exactly "the JSON serialization is
 * identical" — full float precision, no epsilon.
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildOutlineAnchorBaseline, type OutlineAnchorBaseline } from "./outline-anchor-corpus";

const fixturePath = fileURLToPath(
  new URL("./__fixtures__/outline-anchor-baseline.json", import.meta.url),
);

if (!existsSync(fixturePath)) {
  describe("outline-anchor-baseline", () => {
    it.skip(
      `fixture missing at ${fixturePath} — capture it first: bun packages/canvas/src/objects/__tests__/outline-anchor-corpus.ts ${fixturePath}`,
      () => {},
    );
  });
} else {
  describe("outline-anchor-baseline", () => {
    const baseline = JSON.parse(readFileSync(fixturePath, "utf8")) as OutlineAnchorBaseline;
    // JSON round-trip the fresh capture so -0/undefined normalization matches
    // what the fixture file could physically contain.
    const fresh = JSON.parse(JSON.stringify(buildOutlineAnchorBaseline())) as OutlineAnchorBaseline;

    it("covers the same outline/anchor variant keys as the fixture", () => {
      expect(Object.keys(fresh.outlines).sort()).toEqual(Object.keys(baseline.outlines).sort());
    });

    it("matches every recorded outline polygon and anchor set exactly", () => {
      const mismatches: string[] = [];
      for (const [key, expected] of Object.entries(baseline.outlines)) {
        const actual = fresh.outlines[key];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) mismatches.push(key);
      }
      expect(mismatches).toEqual([]);
    });

    it("matches every recorded connection-cascade result exactly", () => {
      const mismatches: string[] = [];
      for (const [type, perZoom] of Object.entries(baseline.cascade)) {
        for (const [zoom, results] of Object.entries(perZoom)) {
          for (const [probe, expected] of Object.entries(results)) {
            const actual = fresh.cascade[type]?.[zoom]?.[probe];
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
              mismatches.push(`${type}/${zoom}/${probe}`);
            }
          }
        }
      }
      expect(mismatches).toEqual([]);
    });
  });
}
