/** Regenerate every derived prompt snapshot in this package's agent catalog. */
import { writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import {
  buildRegistry,
  renderedPromptSnapshot,
} from "@agent-kernel/kernel";

const packageRoot = resolve(import.meta.dir, "..");
const catalogRoot = join(packageRoot, "src", "agent", "catalog");

async function main(): Promise<void> {
  const registry = await buildRegistry({ roots: [catalogRoot] });

  for (const agent of registry.list()) {
    const snapshotFile = join(dirname(agent.promptFile), "prompt.rendered.md");
    writeFileSync(
      snapshotFile,
      renderedPromptSnapshot(agent.parsed.body),
      "utf8",
    );
    console.log(
      `wrote ${relative(packageRoot, snapshotFile)} (${agent.promptHash})`,
    );
  }
}

if (import.meta.main) await main();
