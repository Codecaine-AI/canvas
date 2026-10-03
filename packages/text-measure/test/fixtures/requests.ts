// Backend requests race while HarfBuzz loads cold (fresh process, see test/helpers.ts):
// the last request wins whatever order the loads finish in. Prints one JSON line.
//   TM_RACE=table    useHarfBuzz(), then useTableBackend() before the load finishes
//   TM_RACE=browser  useHarfBuzz(), then useBrowserFonts(), which fails (no DOM in Bun)

const core = await import("../../src/index.ts");
const { harfBuzzStats, useHarfBuzz } = await import("../../src/headless.ts");
let changes = 0;
core.onBackendChange(() => changes++);
const state = () => ({ backend: core.activeBackend().name, changes, loaded: harfBuzzStats().loaded });

if (process.env.TM_RACE === "browser") {
  const { useBrowserFonts } = await import("../../src/browser.ts");
  const harfBuzz = useHarfBuzz();
  const browser = await useBrowserFonts({ timeoutMs: 500 });
  const afterBrowserFailed = state();
  await harfBuzz;
  console.log(JSON.stringify({ browser, afterBrowserFailed, afterHarfBuzz: state() }));
} else {
  const harfBuzz = useHarfBuzz();
  core.useTableBackend();
  await harfBuzz;
  const afterRace = state();
  await useHarfBuzz();
  console.log(JSON.stringify({ afterRace, afterRetry: state() }));
}

export {};
