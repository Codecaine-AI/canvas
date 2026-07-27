/**
 * Regenerate every derived prompt snapshot in this package's agent catalog.
 *
 * `prompt.json` is the source of truth; the markdown beside it is generated so
 * the prompt stays readable and diffable in the form the model receives. Where
 * it lands follows the bundle form (agent-kernel registry/bundle-layout.ts):
 * `prompt/prompt.json` → `prompt/system.md`, and a flat `prompt.json` →
 * `prompt.rendered.md`. The kernel owns both the render and the path rule, so
 * this script only points it at the catalog root.
 */
import { join, relative, resolve } from "node:path";

import { refreshCatalogPromptSnapshots } from "@agent-kernel/kernel";

const packageRoot = resolve(import.meta.dir, "..");
const catalogRoot = join(packageRoot, "src", "agent", "catalog");

function main(): void {
  for (const result of refreshCatalogPromptSnapshots([catalogRoot])) {
    const status = result.changed ? "wrote" : "unchanged";
    console.log(
      `${status} ${relative(packageRoot, result.renderedFile)} (${result.hash})`,
    );
  }
}

if (import.meta.main) main();
