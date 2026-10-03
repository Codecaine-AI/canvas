import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import type { HarfBuzzStats } from "../src/headless.ts";
import { runFixture } from "./helpers.ts";

interface Backend {
  name: string;
  exact: boolean;
}
interface Line {
  text: string;
  width: number;
}
interface TwoCopies {
  sharedPretext: boolean | null;
  afterHarfBuzz: {
    other: Backend;
    otherChanges: number;
    widths: { other: number; src: number; table: number };
    lines: { other: Line[]; src: Line[] };
  };
  afterOtherTable: { src: Backend; otherChanges: number; srcWidth: number; srcLines: Line[] };
  afterSrcTable: { otherChanges: number };
}
interface RaceState {
  backend: string;
  changes: number;
  loaded: boolean;
}

describe("one backend per process, shared by every copy of the package", () => {
  test.each([
    ["a bundled core entry with its own Pretext, loaded first", "bundle", null],
    ["a copied source tree sharing this Pretext, loaded second", "tree", true],
  ] as const)("%s", (_name, mode, sharedPretext) => {
    const r = runFixture<TwoCopies>("two-copies.ts", { env: { TM_COPY: mode } });
    expect(r.sharedPretext).toBe(sharedPretext);
    // useHarfBuzz() in src/ switches the other copy too: one notification, the same results.
    expect(r.afterHarfBuzz.other).toEqual({ name: "harfbuzz", exact: true });
    expect(r.afterHarfBuzz.otherChanges).toBe(1);
    expect(r.afterHarfBuzz.widths.other).toBe(r.afterHarfBuzz.widths.src);
    expect(Math.abs(r.afterHarfBuzz.widths.src - r.afterHarfBuzz.widths.table)).toBeGreaterThan(0.2);
    // The other copy's Pretext held table widths for these segments: the switch flushed them.
    expect(r.afterHarfBuzz.lines.other).toEqual(r.afterHarfBuzz.lines.src);
    // useTableBackend() in the other copy switches src/ back and flushes src/'s Pretext.
    expect(r.afterOtherTable.src).toEqual({ name: "table", exact: false });
    expect(r.afterOtherTable.otherChanges).toBe(2);
    expect(r.afterOtherTable.srcWidth).toBe(r.afterHarfBuzz.widths.table);
    expect(r.afterOtherTable.srcLines.length).not.toBe(r.afterHarfBuzz.lines.src.length);
    // Every copy switches to one table backend, so table -> table across copies is no switch.
    expect(r.afterSrcTable.otherChanges).toBe(2);
  });
});

describe("backend requests: the last request wins", () => {
  test("cold: useTableBackend() made while useHarfBuzz() loads wins; a later useHarfBuzz() switches back", () => {
    const r = runFixture<{ afterRace: RaceState; afterRetry: RaceState }>("requests.ts", { env: { TM_RACE: "table" } });
    expect(r.afterRace).toEqual({ backend: "table", changes: 0, loaded: true });
    expect(r.afterRetry).toEqual({ backend: "harfbuzz", changes: 1, loaded: true });
  });

  test("a newer request that fails (useBrowserFonts without a DOM) lets the pending useHarfBuzz() win once it loads", () => {
    const r = runFixture<{ browser: { backend: string; reason?: string }; afterBrowserFailed: RaceState; afterHarfBuzz: RaceState }>("requests.ts", {
      env: { TM_RACE: "browser" },
    });
    expect(r.browser.backend).toBe("table");
    expect(r.browser.reason).toBeString();
    expect(r.afterBrowserFailed).toEqual({ backend: "table", changes: 0, loaded: false });
    expect(r.afterHarfBuzz).toEqual({ backend: "harfbuzz", changes: 1, loaded: true });
  });
});

describe("listener errors", () => {
  test("a throwing onBackendChange listener or switch hook is reported on stderr; the switch and the other listeners go on", () => {
    // Spawned directly rather than with runFixture: the assertions need stderr.
    const result = Bun.spawnSync({
      cmd: [process.execPath, fileURLToPath(new URL("./fixtures/listener-error.ts", import.meta.url))],
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = result.stderr.toString();
    expect({ exitCode: result.exitCode, stderr }).toMatchObject({ exitCode: 0 });
    expect(JSON.parse(result.stdout.toString().trim().split("\n").at(-1)!)).toEqual({ calls: 1, backend: "harfbuzz" });
    expect(stderr).toContain("text-measure: an onBackendChange listener threw");
    expect(stderr).toContain("listener failure");
    expect(stderr).toContain("text-measure: a backend switch hook threw");
    expect(stderr).toContain("hook failure");
  });
});

describe("process memory", () => {
  test("a 1 MiB run is neither shaped nor cached whole by HarfBuzz, so memory stays bounded", () => {
    const r = runFixture<{ width: number; rssGrowthMiB: number; stats: HarfBuzzStats }>("huge-input.ts");
    expect(r.stats.largestShapedUnits).toBe(16_384);
    // Only the warm-up label is cached: runs over 4,096 units never are.
    expect(r.stats.cacheUnits).toBeLessThan(4_096);
    expect(r.stats.cacheUnits).toBeLessThanOrEqual(r.stats.cacheUnitLimit);
    expect(r.width).toBeGreaterThan(0);
    // Shaped whole, this run grew RSS by ~220 MiB for good (WASM memory never shrinks); chunked, by ~50.
    expect(r.rssGrowthMiB).toBeLessThan(120);
  });
});
