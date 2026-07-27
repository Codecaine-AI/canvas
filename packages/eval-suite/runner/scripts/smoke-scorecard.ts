import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assembleScorecard } from "../src/scorecard/assemble.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(scriptDir, "fixtures", "scorecard");
const temporaryDir = await mkdtemp(join(tmpdir(), "canvas-scorecard-smoke-"));
const runsDir = join(temporaryDir, "runs");
const runId = "2026-07-23-system-scorecard-smoke";

try {
  await cp(join(fixtureDir, "runs"), runsDir, { recursive: true });
  const scorecard = await assembleScorecard({
    runId,
    runsDir,
    axesDir: resolve(scriptDir, "../../axes-system"),
  });

  const expectedPath = join(fixtureDir, "expected-scorecard.md");
  const [expected, actual] = await Promise.all([
    readFile(expectedPath),
    readFile(scorecard.markdownPath),
  ]);
  if (!expected.equals(actual)) {
    const diff = spawnSync("diff", ["-u", expectedPath, scorecard.markdownPath], {
      encoding: "utf8",
    });
    process.stderr.write(diff.stdout || diff.stderr || "scorecard bytes differ\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("scorecard smoke: ok\n");
  }
} finally {
  await rm(temporaryDir, { recursive: true, force: true });
}
