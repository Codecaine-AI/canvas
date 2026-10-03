// Runs in a fresh process (see test/helpers.ts) and prints, as one JSON line, what
// text-measure does in that environment: which backend is active, whether the
// binding left globalThis.OffscreenCanvas as it found it, and sample results per
// backend. TM_SENTINEL=1 installs a stand-in OffscreenCanvas first, like a browser's.

const g = globalThis as unknown as Record<string, unknown>;
if (process.env.TM_SENTINEL === "1") {
  g.OffscreenCanvas = class SentinelOffscreenCanvas {
    getContext(): null {
      return null;
    }
  };
}
const original = g.OffscreenCanvas;
const env = {
  document: typeof (g.document as unknown) !== "undefined",
  offscreenCanvas: typeof original,
  navigator: typeof navigator === "undefined" ? null : navigator.userAgent,
};

const core = await import("../../src/index.ts");
const { pretextBindingState } = await import("../../src/pretext-binding.ts");
const font = { family: "Inter", size: 14 };
const samples = ["Hamburgefonstiv", "ASCII arrows -> => <- <=> -->", "Static export is read-only by construction", "Ship it 🚀", "春天到了"];
const run = () =>
  samples.map((text) => {
    const wrap = core.wrapText(text, font, { maxWidth: 120, lineHeight: 21 });
    return { width: core.measureWidth(text, font), lines: wrap.lines.map((line) => line.text), verdict: core.fitText(text, font, { width: 120, lineHeight: 21, maxLines: 1 }).verdict };
  });

const initial = core.activeBackend();
const table = run();
const restoredAfterBind = g.OffscreenCanvas === original;
const bound = pretextBindingState().bound;

const { useHarfBuzz } = await import("../../src/headless.ts");
await useHarfBuzz();
const afterHarfBuzz = core.activeBackend();
const harfbuzz = run();

const { useBrowserFonts } = await import("../../src/browser.ts");
const browserFonts = await useBrowserFonts({ timeoutMs: 2000 });
const afterBrowserFonts = core.activeBackend();

console.log(
  JSON.stringify({
    env,
    initial,
    bound,
    restoredAfterBind,
    restoredAtEnd: g.OffscreenCanvas === original,
    table,
    afterHarfBuzz,
    harfbuzz,
    browserFonts,
    afterBrowserFonts,
  }),
);

export {};
