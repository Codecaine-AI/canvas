// Memory of a 1 MiB run measured with HarfBuzz (fresh process, see test/helpers.ts):
// HarfBuzz's WASM buffers grow to the longest text shaped at once and never shrink,
// so long runs are shaped in chunks and are never cached. Prints one JSON line.

const { harfBuzzStats, measureWidth, useHarfBuzz } = await import("../../src/headless.ts");
await useHarfBuzz();
const font = { family: "Inter", size: 16 };
measureWidth("warm up the shaper", font);

const MiB = 1024 * 1024;
const rss = () => process.memoryUsage().rss / MiB;
// No break opportunity at all, so no shortcut through line breaking either.
const text = "W".repeat(MiB);
Bun.gc(true);
const before = rss();
const start = performance.now();
const width = measureWidth(text, font);
const ms = performance.now() - start;
Bun.gc(true);
console.log(JSON.stringify({ width, rssGrowthMiB: Math.round(rss() - before), ms: Math.round(ms), stats: harfBuzzStats() }));

export {};
