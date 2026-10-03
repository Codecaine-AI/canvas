#!/usr/bin/env bun
/**
 * Records the Chromium ground truth that test/accuracy.test.ts compares the
 * package against: test/accuracy/chromium-truth.json (format in
 * test/accuracy/truth-format.ts).
 *
 * Headless Chromium (Playwright, the copy installed in the core checkout)
 * lays out every corpus string in the DOM with the bundled woff2 faces loaded
 * through fonts.css, over this grid:
 *   Inter          sizes 12 13.5 14 16 17.5 24 x weights 400 500 600 700, widths 120 200 320
 *   IBM Plex Mono  sizes 13 14 x weights 400 500 600, widths 120 320
 *   Inter spaced   14px x weights 400 700 x letter-spacing 0.5 1.5px, widths 120 200 320
 * plus, for every row, boxes at the natural width -1 -0.5 -0.25 -0.1 +0.1
 * +0.25 +0.5 +1 px (the edge sweep).
 *
 * Before measuring it checks that every face loaded and that each TTF (what
 * the headless backend shapes with) measures identically to its woff2 (what
 * the browser paints) on the whole corpus, so the two are the same build.
 *
 * Run after changing fonts, the corpus, or the Pretext version (about 20 s):
 *   bun canvas/packages/text-measure/scripts/truth-chromium.ts [--channel chrome]
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BUNDLED_FACES } from "../src/faces.ts";
import { encodeRow, type TruthFile, type TruthGrid } from "../test/accuracy/truth-format.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CORPUS_FILE = "test/accuracy/corpus.json";
const OUT_FILE = "test/accuracy/chromium-truth.json";
const ORIGIN = "http://text-measure.test";
const DELTAS = [-1, -0.5, -0.25, -0.1, 0.1, 0.25, 0.5, 1];

interface GridSpec {
  name: string;
  family: string;
  familyCss: string;
  sizes: number[];
  weights: number[];
  letterSpacings: number[];
  widths: number[];
}

const GRIDS: GridSpec[] = [
  { name: "inter", family: "Inter", familyCss: "Inter", sizes: [12, 13.5, 14, 16, 17.5, 24], weights: [400, 500, 600, 700], letterSpacings: [0], widths: [120, 200, 320] },
  { name: "plex-mono", family: "IBM Plex Mono", familyCss: '"IBM Plex Mono"', sizes: [13, 14], weights: [400, 500, 600], letterSpacings: [0], widths: [120, 320] },
  { name: "inter-letter-spacing", family: "Inter", familyCss: "Inter", sizes: [14], weights: [400, 700], letterSpacings: [0.5, 1.5], widths: [120, 200, 320] },
];

const channelArg = process.argv.indexOf("--channel");
const channel = channelArg > 0 ? process.argv[channelArg + 1] : undefined;

const corpusBytes = readFileSync(`${ROOT}${CORPUS_FILE}`);
const corpus = JSON.parse(corpusBytes.toString("utf8")) as Array<{ id: string; text: string }>;
const texts = corpus.map((entry) => entry.text);

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/fonts.css">
<style>body { margin: 0; } #host { position: absolute; left: 0; top: 0; width: 100000px; }</style>
</head><body><div id="host"></div></body></html>`;

const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
try {
  const page = await (await browser.newContext({ deviceScaleFactor: 1, locale: "en-US" })).newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/fonts.css") return route.fulfill({ status: 200, contentType: "text/css", body: readFileSync(`${ROOT}fonts.css`) });
    if (/^\/fonts\/[\w-]+\.(woff2|ttf)$/.test(path)) {
      return route.fulfill({ status: 200, contentType: path.endsWith(".woff2") ? "font/woff2" : "font/ttf", body: readFileSync(`${ROOT}${path.slice(1)}`) });
    }
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
  });
  await page.goto(`${ORIGIN}/index.html`);
  await page.addScriptTag({ content: readFileSync(`${ROOT}scripts/page-measure.js`, "utf8") });

  const faces = BUNDLED_FACES.map((face) => ({ family: face.family, weight: face.weight, file: face.file }));
  const fontCheck = await page.evaluate(async (faces) => {
    const css = (family: string) => (/\s/.test(family) ? `"${family}"` : family);
    const loaded: string[] = [];
    for (const face of faces) {
      const got = await document.fonts.load(`${face.weight} 16px ${css(face.family)}`);
      if (got.some((f) => f.status === "loaded")) loaded.push(`${face.family} ${face.weight}`);
      const ttf = new FontFace(`TM TTF ${face.family}`, `url(/fonts/${face.file}.ttf) format("truetype")`, { weight: String(face.weight) });
      document.fonts.add(ttf);
      await ttf.load();
    }
    await document.fonts.ready;
    const ctx = new OffscreenCanvas(1, 1).getContext("2d")!;
    const probe = (font: string) => {
      ctx.font = font;
      return ctx.measureText("Hamburgefonstiv").width;
    };
    return {
      ua: navigator.userAgent,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      loaded,
      probeInter400: probe("400 16px Inter"),
      probeInter700: probe("700 16px Inter"),
      probeFallback: probe("400 16px NoSuchFontAnywhere"),
    };
  }, faces);
  console.log("font check", JSON.stringify(fontCheck));
  if (fontCheck.loaded.length !== faces.length) throw new Error(`only ${fontCheck.loaded.length} of ${faces.length} faces loaded`);
  if (fontCheck.probeInter400 === fontCheck.probeFallback || fontCheck.probeInter400 === fontCheck.probeInter700) {
    throw new Error("Inter did not load: the probe measures like the fallback font or the weights collapse");
  }

  // Same build: TTF and woff2 must give identical advances on the corpus plus a character sweep.
  const sweep: string[] = [];
  for (const [start, end] of [[0x20, 0x7e], [0xa0, 0x24f], [0x370, 0x4ff], [0x2000, 0x22ff]] as const) {
    let line = "";
    for (let cp = start; cp <= end; cp++) line += String.fromCodePoint(cp);
    sweep.push(line);
  }
  const builds = (await page.evaluate(
    (args) => (globalThis as unknown as { compareBuilds: (a: unknown) => Promise<unknown> }).compareBuilds(args),
    {
      texts: [...texts, ...sweep],
      pairs: faces.map((face) => {
        const family = /\s/.test(face.family) ? `"${face.family}"` : face.family;
        return { woff2: `${face.weight} 100px ${family}`, ttf: `${face.weight} 100px "TM TTF ${face.family}"` };
      }),
    },
  )) as Array<{ woff2: string; ttf: string; maxDiff: number; worst: string }>;
  const buildMaxDiff = Math.max(...builds.map((b) => b.maxDiff));
  console.log("ttf vs woff2 max |diff| at 100px:", builds.map((b) => `${b.woff2}: ${b.maxDiff.toFixed(5)}`).join(", "));
  if (buildMaxDiff > 0.001) throw new Error(`a TTF and its woff2 measure differently (max ${buildMaxDiff}px at 100px): not the same build`);

  const grids: TruthGrid[] = [];
  let heightMismatches = 0;
  const t0 = performance.now();
  for (const spec of GRIDS) {
    const fonts = spec.sizes.flatMap((size) =>
      spec.weights.flatMap((weight) => spec.letterSpacings.map((letterSpacing) => ({ size, weight, letterSpacing, familyCss: spec.familyCss }))),
    );
    const measured = (await page.evaluate(
      (args) => (globalThis as unknown as { measureGrid: (a: unknown) => Promise<unknown> }).measureGrid(args),
      { texts, fonts, widths: spec.widths, deltas: DELTAS },
    )) as Array<{ size: number; weight: number; letterSpacing: number; lineHeight: number; rows: Array<{ natural: number; counts: number[]; edges: number[]; heightMismatch: boolean }> }>;
    grids.push({
      name: spec.name,
      family: spec.family,
      widths: spec.widths,
      fonts: measured.map((font) => {
        heightMismatches += font.rows.filter((row) => row.heightMismatch).length;
        return {
          size: font.size,
          weight: font.weight,
          letterSpacing: font.letterSpacing,
          lineHeight: font.lineHeight,
          rows: font.rows.map((row) => encodeRow(row)).join(";"),
        };
      }),
    });
  }
  const rowCount = grids.reduce((n, g) => n + g.fonts.length * texts.length, 0);
  console.log(`measured ${rowCount} rows in ${((performance.now() - t0) / 1000).toFixed(1)}s (rect-vs-height line count disagreements: ${heightMismatches})`);

  const truth: TruthFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    env: {
      ua: fontCheck.ua,
      browserVersion: browser.version(),
      channel: channel ?? "playwright chromium",
      platform: `${process.platform}-${process.arch}`,
      deviceScaleFactor: 1,
      fontProbe400: fontCheck.probeInter400,
      ttfVsWoff2MaxDiffAt100px: buildMaxDiff,
    },
    corpus: { file: CORPUS_FILE, sha256: createHash("sha256").update(corpusBytes).digest("hex"), count: texts.length },
    deltas: DELTAS,
    grids,
  };
  const json = `${JSON.stringify(truth, null, 1)}\n`;
  writeFileSync(`${ROOT}${OUT_FILE}`, json);
  console.log(`wrote ${OUT_FILE} (${json.length} bytes)`);
} finally {
  await browser.close();
}
