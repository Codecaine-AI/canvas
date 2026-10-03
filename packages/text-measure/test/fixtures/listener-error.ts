// A throwing onBackendChange listener (and a throwing internal switch hook) must not
// crash the host or stop the other listeners. Fresh process; the test reads stderr.

const core = await import("../../src/index.ts");
const { onBackendSwitchInternal } = await import("../../src/backend.ts");
const { useHarfBuzz } = await import("../../src/headless.ts");

onBackendSwitchInternal(() => {
  throw new Error("hook failure");
});
core.onBackendChange(() => {
  throw new Error("listener failure");
});
let calls = 0;
core.onBackendChange(() => calls++);
await useHarfBuzz();
await new Promise((resolve) => setTimeout(resolve, 20));
console.log(JSON.stringify({ calls, backend: core.activeBackend().name }));

export {};
