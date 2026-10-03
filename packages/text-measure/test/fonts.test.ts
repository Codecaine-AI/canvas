import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compareBuild } from "../scripts/font-files.ts";
import { BUNDLED_FACES } from "../src/faces.ts";
import { FACE_TABLES } from "../src/generated/tables.ts";
import { useHarfBuzz } from "../src/headless.ts";
import { measureWidth, uncoveredChars, useTableBackend } from "../src/index.ts";
import { corpus } from "./accuracy/evaluate.ts";

const FONTS_DIR = fileURLToPath(new URL("../fonts", import.meta.url));

describe("bundled fonts", () => {
  test("every woff2 (painted by browsers) is the same build as its TTF (shaped headless)", () => {
    for (const face of BUNDLED_FACES) {
      const comparison = compareBuild(FONTS_DIR, face.file);
      expect({ file: face.file, sameBuild: comparison.sameBuild, layout: comparison.layout }).toEqual({
        file: face.file,
        sameBuild: true,
        layout: expect.objectContaining({ cmap: true, hmtx: true, GPOS: true, GSUB: true }),
      });
      expect(comparison.version.woff2).toBe(comparison.version.ttf);
    }
  });

  test("the generated tables come from the bundled TTFs (regenerate after changing a font)", () => {
    for (const face of BUNDLED_FACES) {
      const sha256 = createHash("sha256").update(readFileSync(`${FONTS_DIR}/${face.file}.ttf`)).digest("hex");
      expect({ face: face.id, sha256 }).toEqual({ face: face.id, sha256: FACE_TABLES[face.id].sha256 });
    }
  });

  test("fonts.css declares every bundled face from fonts/", () => {
    const css = readFileSync(new URL("../fonts.css", import.meta.url), "utf8");
    const rules = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]!);
    expect(rules.length).toBe(BUNDLED_FACES.length);
    for (const face of BUNDLED_FACES) {
      const rule = rules.find((r) => r.includes(`./fonts/${face.file}.woff2`));
      expect(rule).toBeDefined();
      expect(rule).toContain(`font-family: "${face.family}"`);
      expect(rule).toContain(`font-weight: ${face.weight};`);
    }
  });

  test("the table backend matches HarfBuzz on plain ASCII (advances, kerning, arrow ligatures)", async () => {
    const ascii = corpus.map((e) => e.text).filter((t) => /^[\x20-\x7e]+$/.test(t));
    expect(ascii.length).toBeGreaterThan(150);
    const fonts = BUNDLED_FACES.map((face) => ({ family: face.family, size: 16, weight: face.weight }));
    const measureAll = () => fonts.flatMap((font) => ascii.map((text) => measureWidth(text, font)));
    useTableBackend();
    const table = measureAll();
    await useHarfBuzz();
    const harfbuzz = measureAll();
    const worst = Math.max(...table.map((w, i) => Math.abs(w - harfbuzz[i]!)));
    expect(worst).toBeLessThanOrEqual(1 / 64);
  });

  test("the corpus has both covered and uncovered strings", () => {
    const uncovered = corpus.filter((e) => uncoveredChars(e.text).length > 0).length;
    expect(uncovered).toBeGreaterThan(5);
    expect(corpus.length - uncovered).toBeGreaterThan(190);
  });
});
