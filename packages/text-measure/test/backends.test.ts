import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as Pretext from "@chenglou/pretext";
import { isExactFor, measureRunPx, setBackend, type MeasureBackend } from "../src/backend.ts";
import { useBrowserFonts } from "../src/browser.ts";
import { faceById } from "../src/faces.ts";
import { resolveFont } from "../src/font.ts";
import { harfBuzzStats, useHarfBuzz } from "../src/headless.ts";
import { activeBackend, measureWidth, onBackendChange, useTableBackend, wrapText } from "../src/index.ts";
import { pretext, pretextBindingState } from "../src/pretext-binding.ts";
import { hasNode, runFixture } from "./helpers.ts";

interface Report {
  env: { document: boolean; offscreenCanvas: string };
  initial: { name: string; exact: boolean };
  bound: boolean;
  restoredAfterBind: boolean;
  restoredAtEnd: boolean;
  table: Array<{ width: number; lines: string[]; verdict: string }>;
  afterHarfBuzz: { name: string };
  harfbuzz: Array<{ width: number; lines: string[]; verdict: string }>;
  browserFonts: { backend: string; reason?: string };
  afterBrowserFonts: { name: string };
}

describe("Pretext binding", () => {
  test("binds on first use and restores a missing OffscreenCanvas (plain Bun)", () => {
    const report = runFixture<Report>("report.ts");
    expect(report.env).toMatchObject({ document: false, offscreenCanvas: "undefined" });
    expect(report.bound).toBe(true);
    expect(report.restoredAfterBind).toBe(true);
    expect(report.restoredAtEnd).toBe(true);
  });

  test("restores a pre-existing OffscreenCanvas, as a browser's native one", () => {
    const report = runFixture<Report>("report.ts", { env: { TM_SENTINEL: "1" } });
    expect(report.env.offscreenCanvas).toBe("function");
    expect(report.restoredAfterBind).toBe(true);
    expect(report.restoredAtEnd).toBe(true);
  });

  test("refuses to run when Pretext already holds someone else's context", () => {
    const result = runFixture<{ threw: boolean; message?: string }>("foreign-context.ts");
    expect(result.threw).toBe(true);
    expect(result.message).toContain("before text-measure could bind it");
  });

  test("Pretext measures through the active backend, and switching changes its results", async () => {
    useTableBackend();
    wrapText("bind", { family: "Inter", size: 16 }, { maxWidth: 100, lineHeight: 20 });
    expect(pretextBindingState().bound).toBe(true);
    const font = { family: "Inter", size: 16 };
    const key = resolveFont(font).key;
    // Greek has no kerning in the table backend; HarfBuzz kerns it.
    const text = "Ελληνικά κείμενο για μέτρηση";
    const pretextNatural = () => Pretext.measureNaturalWidth(Pretext.prepareWithSegments(text, key));

    const viaTable = pretextNatural();
    expect(Math.abs(viaTable - measureWidth(text, font))).toBeLessThanOrEqual(1 / 64);
    await useHarfBuzz();
    const viaHarfBuzz = pretextNatural();
    expect(Math.abs(viaHarfBuzz - measureWidth(text, font))).toBeLessThanOrEqual(1 / 64);
    expect(Math.abs(viaHarfBuzz - viaTable)).toBeGreaterThan(0.2);

    // A box between the two widths: one line by HarfBuzz, two by the table.
    const box = { maxWidth: (viaTable + viaHarfBuzz) / 2, lineHeight: 20 };
    const narrower = Math.min(viaTable, viaHarfBuzz) === viaHarfBuzz ? "harfbuzz" : "table";
    const hbLines = wrapText(text, font, box).lineCount;
    useTableBackend();
    const tableLines = wrapText(text, font, box).lineCount;
    expect(narrower === "harfbuzz" ? [hbLines, tableLines] : [tableLines, hbLines]).toEqual([1, 2]);
    await useHarfBuzz();
  });

  test("Pretext's caches are flushed once the segments measured since the last flush pass 4,000,000 UTF-16 units", async () => {
    useTableBackend();
    try {
      const P = pretext();
      const key = resolveFont({ family: "Inter", size: 16 }).key;
      // In pre-wrap a run of spaces is one segment: one measurement of n units.
      const prepareSpaces = (n: number) => P.prepare(" ".repeat(n), key, { whiteSpace: "pre-wrap" });
      const calls = () => pretextBindingState().measureCalls;
      prepareSpaces(7);
      let before = calls();
      prepareSpaces(7);
      expect(calls()).toBe(before);
      for (let i = 0; i < 4; i++) prepareSpaces(1_050_000 + i);
      pretext(); // the next API call checks the budget
      before = calls();
      prepareSpaces(7);
      expect(calls()).toBeGreaterThan(before);
    } finally {
      await useHarfBuzz();
    }
  });
});

describe("backends", () => {
  test("the default backend is the table, in plain Bun and under happy-dom", () => {
    for (const happyDom of [false, true]) {
      const report = runFixture<Report>("report.ts", { happyDom });
      expect(report.initial).toEqual({ name: "table", exact: false });
      expect(report.afterHarfBuzz.name).toBe("harfbuzz");
    }
  });

  test("happy-dom's browser-ish globals change nothing: same backends, same results", () => {
    const plain = runFixture<Report>("report.ts");
    const dom = runFixture<Report>("report.ts", { happyDom: true });
    expect(dom.env).toMatchObject({ document: true, offscreenCanvas: "function" });
    expect(dom.restoredAfterBind).toBe(true);
    expect(dom.restoredAtEnd).toBe(true);
    expect(dom.table).toEqual(plain.table);
    expect(dom.harfbuzz).toEqual(plain.harfbuzz);
    // useBrowserFonts cannot load fonts in happy-dom (no FontFace / document.fonts): it keeps HarfBuzz.
    for (const report of [plain, dom]) {
      expect(report.browserFonts.backend).toBe("harfbuzz");
      expect(report.browserFonts.reason).toBeString();
      expect(report.afterBrowserFonts.name).toBe("harfbuzz");
    }
  });

  test("onBackendChange fires once per switch and unsubscribes", async () => {
    useTableBackend();
    let calls = 0;
    const off = onBackendChange(() => calls++);
    await useHarfBuzz();
    await useHarfBuzz();
    expect(calls).toBe(1);
    useTableBackend();
    useTableBackend();
    expect(calls).toBe(2);
    off();
    await useHarfBuzz();
    expect(calls).toBe(2);
    expect(activeBackend()).toEqual({ name: "harfbuzz", exact: true });
  });

  test("cold concurrent useHarfBuzz calls share one load and one switch", () => {
    const result = runFixture<{ before: { loads: number; loaded: boolean }; after: { loads: number; loaded: boolean }; changes: number; backend: { name: string } }>(
      "concurrent-load.ts",
    );
    expect(result.before).toMatchObject({ loads: 0, loaded: false });
    expect(result.after).toMatchObject({ loads: 1, loaded: true });
    expect(result.changes).toBe(1);
    expect(result.backend.name).toBe("harfbuzz");
  });

  test("useHarfBuzz is idempotent under concurrent calls", async () => {
    useTableBackend();
    let calls = 0;
    const off = onBackendChange(() => calls++);
    await Promise.all([useHarfBuzz(), useHarfBuzz(), useHarfBuzz(), useHarfBuzz()]);
    off();
    expect(calls).toBe(1);
    expect(harfBuzzStats().loads).toBe(1);
    expect(harfBuzzStats().loaded).toBe(true);
    expect(activeBackend().name).toBe("harfbuzz");
  });

  test("a switch made while useHarfBuzz is pending wins", async () => {
    await useHarfBuzz();
    const pending = useHarfBuzz();
    useTableBackend();
    await pending;
    expect(activeBackend().name).toBe("table");
    await useHarfBuzz();
    expect(activeBackend().name).toBe("harfbuzz");
  });

  test("the HarfBuzz shaping cache is bounded", async () => {
    await useHarfBuzz({ cacheEntries: 50 });
    try {
      const font = { family: "Inter", size: 15 };
      for (let i = 0; i < 400; i++) measureWidth(`distinct label number ${i} for the cache bound`, font);
      const stats = harfBuzzStats();
      expect(stats.cacheLimit).toBe(50);
      expect(stats.cacheEntries).toBeLessThanOrEqual(50);
      expect(stats.cacheEntries).toBeGreaterThan(0);
      // Shrinking keeps the bound immediately.
      await useHarfBuzz({ cacheEntries: 10 });
      expect(harfBuzzStats().cacheEntries).toBeLessThanOrEqual(10);
    } finally {
      await useHarfBuzz({ cacheEntries: 20_000 });
    }
    await expect(useHarfBuzz({ cacheEntries: 0 })).rejects.toThrow(TypeError);
  });

  test("useBrowserFonts outside a browser resolves with a reason and keeps the backend", async () => {
    await useHarfBuzz();
    const result = await useBrowserFonts({ timeoutMs: 500 });
    expect(result.backend).toBe("harfbuzz");
    expect(result.reason).toBeString();
    expect(activeBackend().name).toBe("harfbuzz");
    await expect(useBrowserFonts({ timeoutMs: 500, throwOnFailure: true })).rejects.toThrow(/text-measure/);
    // `faces` takes face ids and family names; anything else is a TypeError, even outside a browser.
    expect((await useBrowserFonts({ faces: ["Inter", "plex-mono-400"], timeoutMs: 500 })).reason).toBeString();
    await expect(useBrowserFonts({ faces: ["Comic Sans" as "Inter"] })).rejects.toThrow(TypeError);
    await expect(useBrowserFonts({ faces: [] })).rejects.toThrow(TypeError);
    expect(activeBackend().name).toBe("harfbuzz");
  });

  test("a backend exact for some faces only: activeBackend lists them, and only they get fallback text", async () => {
    const received: string[] = [];
    const partial: MeasureBackend = {
      name: "canvas",
      exact: true,
      exactFaces: new Set(["inter-400"]),
      measuresFallback: true,
      measureRun(text, face, size) {
        received.push(`${face.id} ${text}`);
        return text.length * size * 0.5;
      },
    };
    setBackend(partial);
    try {
      expect(activeBackend()).toEqual({ name: "canvas", exact: true, faces: ["inter-400"] });
      expect([isExactFor(faceById("inter-400")), isExactFor(faceById("inter-700")), isExactFor(faceById("plex-mono-400"))]).toEqual([true, false, false]);
      // 春 is not in the bundled faces: the loaded face measures it natively (with the browser's
      // fallback font), any other face estimates it and measures only its covered runs.
      measureWidth("x春y", { family: "Inter", size: 10 });
      measureWidth("x春y", { family: "IBM Plex Mono", size: 10 });
      expect(received).toEqual(["inter-400 x春y", "plex-mono-400 x", "plex-mono-400 y"]);
    } finally {
      await useHarfBuzz();
    }
    expect(isExactFor(faceById("plex-mono-400"))).toBe(true);
    useTableBackend();
    expect(isExactFor(faceById("inter-400"))).toBe(false);
    await useHarfBuzz();
  });

  test.skipIf(!hasNode())("works from a Node ESM host (package exports + type stripping)", async () => {
    const node = runFixture<{ backend: { name: string }; results: Array<{ width: number; lines: string[]; verdict: string }> }>("node-smoke.mjs", { runtime: "node" });
    expect(node.backend.name).toBe("harfbuzz");
    await useHarfBuzz();
    const font = { family: "Inter", size: 14 };
    const texts = ["Hamburgefonstiv", "ASCII arrows -> => <- <=> -->", "Static export is read-only by construction"];
    expect(node.results.map((r) => r.width)).toEqual(texts.map((t) => measureWidth(t, font)));
    expect(node.results.map((r) => r.lines)).toEqual(texts.map((t) => wrapText(t, font, { maxWidth: 120, lineHeight: 21 }).lines.map((l) => l.text)));
  });
});

describe("huge inputs (HarfBuzz)", () => {
  const inter = faceById("inter-400");

  /** Width in px of `text` shaped by a single hb.shape call in Inter Regular: the whole-run reference. */
  async function shapedOnce(text: string, size: number): Promise<number> {
    const hb = await import("harfbuzzjs");
    const bytes = readFileSync(new URL("../fonts/Inter-Regular.ttf", import.meta.url));
    const face = new hb.Face(new hb.Blob(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer), 0);
    const font = new hb.Font(face);
    font.setScale(face.upem, face.upem);
    const buffer = new hb.Buffer();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    hb.shape(font, buffer);
    let units = 0;
    for (const position of buffer.getGlyphPositions()) units += position.xAdvance;
    return (units * size) / face.upem;
  }

  test("runs up to 16,384 UTF-16 units are shaped whole, exactly like one hb.shape call", async () => {
    await useHarfBuzz();
    // Every adjacent pair kerns (AV, VA): splitting the run anywhere would change its width.
    for (const text of ["AV".repeat(8_000), "AV".repeat(8_192)]) {
      expect(measureRunPx(text, inter, 16, true)).toBe(await shapedOnce(text, 16));
    }
    expect(harfBuzzStats().largestShapedUnits).toBeLessThanOrEqual(16_384);
  });

  test("longer runs are shaped in chunks of at most 16,384 units, never inside a surrogate pair", async () => {
    await useHarfBuzz();
    const words = "Lorem ipsum dolor sit amet, AVATAR Wave To. ".repeat(500).slice(0, 20_000);
    const halves = measureRunPx(words.slice(0, 10_000), inter, 16, true) + measureRunPx(words.slice(10_000), inter, 16, true);
    expect(Math.abs(measureRunPx(words, inter, 16, true) - halves)).toBeLessThan(0.5);
    // U+1F130 (in Inter, not an emoji) after one ASCII letter puts a surrogate pair across the
    // 16,384-unit mark; split there, its halves would shape as two U+FFFD.
    const squared = "a" + "\u{1F130}".repeat(10_000);
    const parts = measureRunPx(squared.slice(0, 10_001), inter, 16, true) + measureRunPx(squared.slice(10_001), inter, 16, true);
    expect(Math.abs(measureRunPx(squared, inter, 16, true) - parts)).toBeLessThan(0.01);
    expect(harfBuzzStats().largestShapedUnits).toBeLessThanOrEqual(16_384);
  });
  // The 1 MiB memory check runs in a fresh process: test/registry.test.ts ("process memory").
});
