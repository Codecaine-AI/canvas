import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readFingerprint } from "./assemble.ts";

const temporaryDir = await mkdtemp(join(tmpdir(), "canvas-fingerprint-test-"));

afterAll(async () => {
  await rm(temporaryDir, { recursive: true, force: true });
});

async function fingerprintFile(name: string, lines: string[]): Promise<string> {
  const path = join(temporaryDir, name);
  await writeFile(path, `${lines.join("\n")}\n`);
  return path;
}

const baseLines = [
  "# Eval-suite fingerprint — 2026-07-28-system-fixture",
  "",
  "- run id: `2026-07-28-system-fixture`",
  "- tier: `system`",
  "- git: `abc1234`",
  "- SUT agent config: model `fixture-agent` @ `low` (agent.json `low`), max turns `300`",
  "- tool-call cap: 1 (--tool-call-cap)",
  "- prompt hash: `11111111`",
  "- lint hash: `22222222`",
  "- style hash: `33333333`",
];

describe("readFingerprint", () => {
  test("parses the surface hash when the bullet is present", async () => {
    const path = await fingerprintFile("with-surface.md", [
      ...baseLines,
      "- surface hash: `44444444`",
      "- judge client: model `fixture-judge`, effort `low`, base URL `fixture`",
    ]);

    const fingerprint = await readFingerprint(path);

    expect(fingerprint.prompt).toBe("11111111");
    expect(fingerprint.lints).toBe("22222222");
    expect(fingerprint.styles).toBe("33333333");
    expect(fingerprint.surface).toBe("44444444");
    expect(fingerprint.toolCallCap).toBe(1);
    expect(fingerprint.toolCallCapSource).toBe("--tool-call-cap");
    expect(fingerprint.line).toBe(
      "abc1234 · model fixture-agent @ low · prompt 11111111 · lints 22222222 · styles 33333333 · surface 44444444 · tool-call cap 1 (--tool-call-cap)",
    );
  });

  test("omits the surface hash for a fingerprint written before it existed", async () => {
    const path = await fingerprintFile("without-surface.md", [
      ...baseLines,
      "- judge client: model `fixture-judge`, effort `low`, base URL `fixture`",
    ]);

    const fingerprint = await readFingerprint(path);

    expect(fingerprint.surface).toBeUndefined();
    expect(fingerprint.line).toBe(
      "abc1234 · model fixture-agent @ low · prompt 11111111 · lints 22222222 · styles 33333333 · tool-call cap 1 (--tool-call-cap)",
    );
    expect(fingerprint.line).not.toContain("surface");
  });

  test("omits tool-call cap fields for a fingerprint written before they existed", async () => {
    const path = await fingerprintFile("without-tool-call-cap.md", [
      ...baseLines.filter((line) => !line.startsWith("- tool-call cap:")),
      "- surface hash: `44444444`",
    ]);

    const fingerprint = await readFingerprint(path);

    expect(fingerprint.toolCallCap).toBeUndefined();
    expect(fingerprint.toolCallCapSource).toBeUndefined();
    expect(fingerprint.line).not.toContain("tool-call cap");
  });

  test("prefers an exact SUT line over the reconstructed one", async () => {
    const path = await fingerprintFile("exact-line.md", [
      ...baseLines,
      "- surface hash: `44444444`",
      "",
      "SUT: pinned-line",
    ]);

    const fingerprint = await readFingerprint(path);

    expect(fingerprint.line).toBe("pinned-line");
    expect(fingerprint.surface).toBe("44444444");
  });
});
