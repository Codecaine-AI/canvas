// Cold, concurrent useHarfBuzz() calls in a fresh process share one load and one switch.
const core = await import("../../src/index.ts");
const { useHarfBuzz, harfBuzzStats } = await import("../../src/headless.ts");
let changes = 0;
core.onBackendChange(() => changes++);
const before = harfBuzzStats();
await Promise.all(Array.from({ length: 8 }, () => useHarfBuzz()));
await useHarfBuzz();
console.log(JSON.stringify({ before, after: harfBuzzStats(), changes, backend: core.activeBackend() }));

export {};
