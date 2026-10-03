#!/usr/bin/env bun
/**
 * Exercises the browser entry in headless Chromium (Playwright): bundles
 * src/browser.ts, then on four pages checks useBrowserFonts():
 *   css       fonts.css linked: loads the declared faces, switches to "canvas"
 *   fontface  no fonts.css: loads fonts/*.woff2 next to the module as FontFace
 *   shadowed  the page maps "Inter" to another font: refuses, stays on "table"
 *   offline   the font files 404: resolves with a reason, stays on "table"
 * and that the native OffscreenCanvas survives the Pretext binding. On the
 * css page it then compares the canvas backend with the DOM over the accuracy
 * corpus (Inter 13.5/16px x 400/700, widths 120/200/320, edge sweep).
 *   bun canvas/packages/text-measure/scripts/check-browser.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ORIGIN = "http://text-measure.test";

const build = await Bun.build({ entrypoints: [`${ROOT}scripts/browser-entry.ts`], target: "browser", format: "esm", minify: false });
if (!build.success) throw new Error(build.logs.map(String).join("\n"));
const bundle = await build.outputs[0]!.text();
const corpus = JSON.parse(readFileSync(`${ROOT}test/accuracy/corpus.json`, "utf8")) as Array<{ text: string }>;

type Variant = "css" | "fontface" | "shadowed" | "offline" | "subset";

function html(variant: Variant): string {
  const head =
    variant === "css"
      ? '<link rel="stylesheet" href="/fonts.css">'
      : variant === "shadowed"
        ? '<style>@font-face { font-family: "Inter"; src: url("/fonts/IBMPlexMono-Regular.woff2") format("woff2"); font-weight: 100 900; }</style>'
        : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}
<style>body { margin: 0; } #host { position: absolute; left: 0; top: 0; width: 100000px; }</style></head>
<body><div id="host"></div><script type="module" src="/src/check.js"></script></body></html>`;
}

const fontRequests = new Map<Page, string[]>();

async function openPage(variant: Variant): Promise<Page> {
  const page = await context.newPage();
  const requested: string[] = [];
  fontRequests.set(page, requested);
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/fonts/")) requested.push(path);
  });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/src/check.js") return route.fulfill({ status: 200, contentType: "text/javascript", body: bundle });
    if (path === "/fonts.css") return route.fulfill({ status: 200, contentType: "text/css", body: readFileSync(`${ROOT}fonts.css`) });
    if (/^\/fonts\/[\w-]+\.woff2$/.test(path)) {
      if (variant === "offline") return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ status: 200, contentType: "font/woff2", body: readFileSync(`${ROOT}${path.slice(1)}`) });
    }
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html(variant) });
  });
  await page.goto(`${ORIGIN}/index.html`);
  await page.waitForFunction(() => "tm" in globalThis);
  return page;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ deviceScaleFactor: 1, locale: "en-US" });
let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

try {
  {
    // faces filter: only Inter is loaded; IBM Plex Mono stays on the table backend's widths and is not reliable.
    const page = await openPage("subset");
    const result = await page.evaluate(async () => {
      const tm = (globalThis as unknown as { tm: typeof import("../src/browser.ts") }).tm;
      const plex = { family: "IBM Plex Mono", size: 14 };
      const inter = { family: "Inter", size: 16 };
      const plexBefore = tm.measureWidth("const x = fetchUser();", plex);
      const outcome = await tm.useBrowserFonts({ timeoutMs: 5000, faces: ["Inter"] });
      const div = document.createElement("div");
      div.style.cssText = "font:400 16px Inter;white-space:nowrap;width:max-content";
      div.textContent = "Static export is read-only";
      document.body.appendChild(div);
      return {
        outcome,
        active: tm.activeBackend(),
        interWidth: tm.measureWidth("Static export is read-only", inter),
        interDom: Math.ceil(div.getBoundingClientRect().width * 64 - 1e-6) / 64,
        plexBefore,
        plexAfter: tm.measureWidth("const x = fetchUser();", plex),
        interReliable: tm.fitText("Static export", inter, { width: 300, lineHeight: 24 }).reliable,
        plexReasons: tm.fitText("const x", plex, { width: 300, lineHeight: 20 }).reasons,
      };
    });
    await page.waitForTimeout(200);
    const requested = fontRequests.get(page)!;
    console.log(`[subset] ${JSON.stringify(result)} fonts requested: ${JSON.stringify(requested)}`);
    check(result.outcome.backend === "canvas" && result.active.name === "canvas" && JSON.stringify(result.active.faces) === JSON.stringify(["inter-400", "inter-500", "inter-600", "inter-700"]), "[subset] canvas backend for the four Inter faces");
    check(requested.length > 0 && requested.every((path) => path.includes("Inter")), "[subset] no IBM Plex Mono file requested");
    check(result.interWidth === result.interDom, "[subset] Inter measures like the DOM");
    check(result.plexAfter === result.plexBefore, "[subset] IBM Plex Mono keeps the table backend's width");
    check(result.interReliable && JSON.stringify(result.plexReasons) === JSON.stringify(["approximate-backend"]), "[subset] Inter reliable, Plex flagged approximate-backend");
    await page.close();
  }
  for (const variant of ["css", "fontface", "shadowed", "offline"] as const) {
    const page = await openPage(variant);
    const result = await page.evaluate(async () => {
      const tm = (globalThis as unknown as { tm: typeof import("../src/browser.ts") }).tm;
      const native = globalThis.OffscreenCanvas;
      const font = { family: "Inter", size: 16 };
      const before = tm.activeBackend().name;
      const widthBefore = tm.measureWidth("Hamburgefonstiv", font);
      let changes = 0;
      tm.onBackendChange(() => changes++);
      const outcome = await tm.useBrowserFonts({ timeoutMs: 5000 });
      const ctx = new OffscreenCanvas(1, 1).getContext("2d");
      return {
        before,
        outcome,
        after: tm.activeBackend().name,
        changes,
        nativeKept: globalThis.OffscreenCanvas === native && typeof ctx?.measureText === "function",
        widthBefore,
        widthAfter: tm.measureWidth("Hamburgefonstiv", font),
        lines: tm.wrapText("Static export is read-only by construction", { family: "Inter", size: 12 }, { maxWidth: 120, lineHeight: 18 }).lines.map((l) => l.text),
      };
    });
    console.log(`[${variant}] ${JSON.stringify(result)}`);
    check(result.before === "table", `[${variant}] starts on the table backend`);
    check(result.nativeKept, `[${variant}] native OffscreenCanvas kept after binding`);
    if (variant === "css" || variant === "fontface") {
      check(result.outcome.backend === "canvas" && result.after === "canvas" && result.changes === 1, `[${variant}] switched to canvas once`);
      check(Math.abs(result.widthAfter - result.widthBefore) <= 1 / 64, `[${variant}] canvas and table agree on an ASCII probe`);
    } else {
      check(result.outcome.backend === "table" && typeof result.outcome.reason === "string" && result.after === "table", `[${variant}] stays on table with a reason: ${result.outcome.reason}`);
    }
    if (variant !== "css") await page.close();
    else {
      // Canvas backend vs the DOM on the corpus.
      const report = await page.evaluate(
        async ({ texts }) => {
          const tm = (globalThis as unknown as { tm: typeof import("../src/browser.ts") }).tm;
          const host = document.getElementById("host")!;
          const range = document.createRange();
          const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
          const covered = texts.map((t) => tm.uncoveredChars(t).length === 0);
          const domLines = (div: HTMLElement, text: string) => {
            let lines = 0;
            let top: number | null = null;
            for (const { segment, index } of graphemes.segment(text)) {
              range.setStart(div.firstChild!, index);
              range.setEnd(div.firstChild!, index + segment.length);
              const rects = range.getClientRects();
              if (rects.length === 0 || (rects[0]!.width === 0 && /^\s+$/.test(segment))) continue;
              const t = Math.round(rects[0]!.top);
              if (top === null || Math.abs(t - top) > 2) {
                lines++;
                top = t;
              }
            }
            return lines;
          };
          const out = { rows: 0, lineChecks: 0, lineMismatches: 0, edgeChecks: 0, edgeMisses: 0, edgeNotBorderline: 0, maxWidthError: 0, examples: [] as string[] };
          for (const size of [13.5, 16]) {
            for (const weight of [400, 700]) {
              const font = { family: "Inter", size, weight };
              const lineHeight = Math.round(size * 1.5);
              const style = `font:${weight} ${size}px Inter;line-height:${lineHeight}px;overflow-wrap:break-word;`;
              texts.forEach((text, i) => {
                if (!covered[i]) return;
                out.rows++;
                const natural = document.createElement("div");
                natural.style.cssText = style + "white-space:nowrap;width:max-content;";
                natural.textContent = text;
                host.appendChild(natural);
                range.selectNodeContents(natural.firstChild!);
                const domNatural = range.getBoundingClientRect().width;
                natural.remove();
                const ours = tm.measureWidth(text, font);
                if (Math.abs(ours - domNatural) > out.maxWidthError) out.maxWidthError = Math.abs(ours - domNatural);
                if (Math.abs(ours - domNatural) > 1 / 64 + 1e-9 && out.examples.length < 8) out.examples.push(`width ${weight} ${size}px: ours ${ours} dom ${domNatural} ${text.slice(0, 60)}`);
                for (const width of [120, 200, 320]) {
                  const div = document.createElement("div");
                  div.style.cssText = style + `width:${width}px;`;
                  div.textContent = text;
                  host.appendChild(div);
                  const dom = domLines(div, text);
                  div.remove();
                  out.lineChecks++;
                  const got = tm.wrapText(text, font, { maxWidth: width, lineHeight }).lineCount;
                  if (got !== dom) {
                    out.lineMismatches++;
                    if (out.examples.length < 8) out.examples.push(`${weight} ${size}px @${width}: ours ${got} dom ${dom} ${text.slice(0, 50)}`);
                  }
                }
                for (const d of [-1, -0.5, -0.25, -0.1, 0.1, 0.25, 0.5, 1]) {
                  const width = Math.max(1, domNatural + d);
                  const div = document.createElement("div");
                  div.style.cssText = style + `width:${width}px;`;
                  div.textContent = text;
                  host.appendChild(div);
                  const dom = domLines(div, text);
                  div.remove();
                  out.edgeChecks++;
                  const fit = tm.fitText(text, font, { width, lineHeight, maxLines: 1 });
                  if ((fit.lineCount <= 1) !== (dom <= 1)) {
                    out.edgeMisses++;
                    if (fit.verdict !== "borderline") {
                      out.edgeNotBorderline++;
                      if (out.examples.length < 8) out.examples.push(`edge ${weight} ${size}px d ${d}: ours ${fit.lineCount} dom ${dom} ${fit.verdict} ${text.slice(0, 50)}`);
                    }
                  }
                }
              });
            }
          }
          return out;
        },
        { texts: corpus.map((e) => e.text) },
      );
      console.log(`[css] canvas backend vs DOM: ${JSON.stringify(report)}`);
      check(report.lineMismatches === 0, `[css] canvas backend: ${report.lineMismatches}/${report.lineChecks} line-count mismatches on covered strings`);
      check(report.edgeNotBorderline === 0, `[css] canvas backend: ${report.edgeMisses}/${report.edgeChecks} edge disagreements, ${report.edgeNotBorderline} not borderline`);
      check(report.maxWidthError <= 1 / 64 + 1e-9, `[css] canvas backend: max single-line width error ${report.maxWidthError.toFixed(4)}px`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? "browser check passed" : `browser check: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
