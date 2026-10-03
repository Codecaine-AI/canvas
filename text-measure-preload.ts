/**
 * Test preload: switch @codecaine-ai/text-measure to its exact HarfBuzz
 * backend before any test measures text, so tests lint, wrap and render the
 * way the hosts do (the MCP server, the agent harness, the renderers).
 *
 * Bun awaits this top-level await before it loads the test files. The
 * beforeEach puts HarfBuzz back if a test switched backends (text-measure's
 * own backend tests do) and did not switch back.
 */
import { beforeEach } from "bun:test";
import { activeBackend, useHarfBuzz } from "@codecaine-ai/text-measure/headless";

await useHarfBuzz();
if (!activeBackend().exact) throw new Error("text-measure-preload: HarfBuzz did not become the active backend");

beforeEach(async () => {
  if (activeBackend().name !== "harfbuzz") await useHarfBuzz();
});
