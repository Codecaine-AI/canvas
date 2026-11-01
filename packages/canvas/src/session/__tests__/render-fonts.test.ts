/**
 * The agent camera's faces: Inter at every weight the themes set, and the mono face. render.ts hands resvg every TTF in
 * @codecaine-ai/text-measure's fonts/ directory, so `font-family="IBM Plex Mono"` — the schematic theme's
 * metadata font (canvas theme/fonts.ts) — must resolve to the bundled IBM
 * Plex Mono faces at each weight the theme sets, and those faces must advance
 * exactly what text-measure measures (the widths the static renderer and
 * text-fit lay text out with).
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";
import { Resvg } from "@resvg/resvg-js";
import { BUNDLED_FACES, measureWidth } from "@codecaine-ai/text-measure";

import { rasterizeSvgToPng } from "../src/service/render";

const FONTS_DIR = dirname(fileURLToPath(import.meta.resolve("@codecaine-ai/text-measure/fonts/Inter-Regular.ttf")));
const TTF_FILES = readdirSync(FONTS_DIR).filter((file) => /\.ttf$/i.test(file));
const PLEX_MONO_FILES = TTF_FILES
  .filter((file) => /^IBMPlexMono-.+\.ttf$/.test(file))
  .map((file) => join(FONTS_DIR, file));
/** Regular (section-header detail), Medium (detail lines, edge labels), SemiBold (section titles). */
const WEIGHTS = [400, 500, 600] as const;
const DETAIL = "db.t3.micro:5432";

/** Whether an sfnt file has an `fvar` table, i.e. is a variable font. */
function isVariableFont(path: string): boolean {
  const bytes = readFileSync(path);
  const tables = bytes.readUInt16BE(4);
  for (let index = 0; index < tables; index += 1) {
    if (bytes.toString("latin1", 12 + index * 16, 16 + index * 16) === "fvar") return true;
  }
  return false;
}

describe("the camera's font source", () => {
  test("is exactly the static faces text-measure measures with — no variable font", () => {
    // resvg does not instance variable fonts: a variable face would paint every weight as Regular.
    expect(TTF_FILES.sort()).toEqual(BUNDLED_FACES.map((face) => `${face.file}.ttf`).sort());
    for (const file of TTF_FILES) expect(isVariableFont(join(FONTS_DIR, file))).toBe(false);
  });
});

function monoSvg(weight: number, text: string, sizePx = 16, letterSpacingEm = 0): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx * 12}" height="${sizePx * 2}">` +
    `<text x="0" y="${sizePx * 1.5}" font-family="IBM Plex Mono" font-weight="${weight}" ` +
    `font-size="${sizePx}" letter-spacing="${letterSpacingEm}em">${text}</text></svg>`
  );
}

/** resvg that sees ONLY the bundled Plex Mono faces — no system fonts. */
function plexOnly(svg: string): Resvg {
  return new Resvg(svg, { font: { fontFiles: PLEX_MONO_FILES, loadSystemFonts: false } });
}

function plexOnlyPng(svg: string): Buffer {
  return Buffer.from(plexOnly(svg).render().asPng());
}

describe("bundled IBM Plex Mono (agent camera)", () => {
  test("the rasterizer sets IBM Plex Mono text in the bundled face at each weight", () => {
    expect(PLEX_MONO_FILES).toHaveLength(WEIGHTS.length);

    const pngs = WEIGHTS.map((weight) => rasterizeSvgToPng(monoSvg(weight, DETAIL)).png);
    // Byte-identical to a renderer that can see only the bundled faces: the
    // camera discovered them, and no system font shadows them.
    for (const [index, weight] of WEIGHTS.entries()) {
      expect(pngs[index]).toEqual(plexOnlyPng(monoSvg(weight, DETAIL)));
    }
    // Non-blank, and one face per weight: a face missing from the family (or
    // filed under another family name) collapses its weight onto a
    // neighbour's, and text that paints nothing equals the empty render.
    const blank = plexOnlyPng(monoSvg(400, ""));
    const distinct = new Set([blank, ...pngs].map((png) => png.toString("base64")));
    expect(distinct.size).toBe(1 + WEIGHTS.length);
  });

  test("the bundled faces advance exactly what text-measure measures, letter spacing included", () => {
    const rightEdge = (weight: number, text: string, letterSpacingEm: number): number => {
      const bbox = plexOnly(monoSvg(weight, text, 100, letterSpacingEm)).getBBox();
      return bbox!.x + bbox!.width;
    };
    for (const weight of WEIGHTS) {
      for (const letterSpacingEm of [0, 0.08]) {
        // A trailing W sits exactly the run's measured width further right.
        const advance =
          rightEdge(weight, `${DETAIL}W`, letterSpacingEm) -
          rightEdge(weight, "W", letterSpacingEm);
        const measured = measureWidth(DETAIL, {
          family: "IBM Plex Mono",
          size: 100,
          weight,
          letterSpacing: letterSpacingEm * 100,
        });
        expect(advance).toBeCloseTo(measured, 2);
      }
    }
  });
});

/** The static Inter 3.19 instances. */
const INTER_STATIC_FILES = TTF_FILES
  .filter((file) => /^Inter-(Regular|Medium|SemiBold|Bold)\.ttf$/.test(file))
  .map((file) => join(FONTS_DIR, file));
/** Detail/body (400), 500, schematic names (600), figjam names (700). */
const INTER_WEIGHTS = [400, 500, 600, 700] as const;

function interSvg(weight: number, text: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="40">` +
    `<text x="0" y="28" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-weight="${weight}" ` +
    `font-size="17.5">${text}</text></svg>`
  );
}

function interOnlyPng(svg: string): Buffer {
  const resvg = new Resvg(svg, { font: { fontFiles: INTER_STATIC_FILES, loadSystemFonts: false } });
  return Buffer.from(resvg.render().asPng());
}

describe("bundled Inter (agent camera)", () => {
  test("the rasterizer sets Inter text in the static face for each weight — never all at 400", () => {
    expect(INTER_STATIC_FILES).toHaveLength(INTER_WEIGHTS.length);

    const pngs = INTER_WEIGHTS.map((weight) => rasterizeSvgToPng(interSvg(weight, "Worker pool")).png);
    for (const [index, weight] of INTER_WEIGHTS.entries()) {
      expect(pngs[index]).toEqual(interOnlyPng(interSvg(weight, "Worker pool")));
    }
    // One distinct face per weight: a variable font (which resvg does not
    // instance) or a missing static face would paint weights identically.
    const distinct = new Set(pngs.map((png) => png.toString("base64")));
    expect(distinct.size).toBe(INTER_WEIGHTS.length);
  });
});
