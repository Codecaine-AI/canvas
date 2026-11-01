/**
 * The canvas skill generator against the committed `skills/canvas` folder and
 * the `canvas_guidance` tool: one manifest feeds both snapshot ids.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canvasGuidanceSources, guidanceSnapshot } from "@codecaine-ai/canvas/authoring";

import { SKILL_DIR, guidanceCommand } from "./guidance";
import { createCanvasService } from "./service";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "canvas-skill-test-"));
  temps.push(dir);
  return dir;
};
const quiet = { log: () => {} };

/** Every file under `dir`, path → bytes as hex. */
function folderBytes(dir: string): Record<string, string> {
  return Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const path = join(entry.parentPath, entry.name);
      return [path.slice(dir.length + 1), readFileSync(path).toString("hex")];
    })
    .sort(([a], [b]) => a!.localeCompare(b!)));
}

/** The source list with one line of the layout-editor prompt changed. */
function withEditedPrompt() {
  return canvasGuidanceSources().map(source => {
    if (source.id !== "prompt") return source;
    const lines = source.text.split("\n");
    const index = lines.findIndex(line => line.includes("visual argument"));
    expect(index).toBeGreaterThanOrEqual(0);
    lines[index] = lines[index]!.replace("visual argument", "visual essay");
    return { ...source, text: lines.join("\n") };
  });
}

describe("canvas skill generator", () => {
  test("a second guidance --write changes nothing, and the committed folder is current", async () => {
    const dir = tempDir();
    expect(await guidanceCommand(["--write", "--skill-dir", dir], quiet)).toBe(0);
    const first = folderBytes(dir);
    expect(Object.keys(first)).toEqual([
      "assets/contact-sheet.png",
      "references/colors.md",
      "references/conventions.md",
      "references/diagram-design.md",
      "references/operating-context.md",
      "references/visual-patterns.md",
      "references/vocabulary.md",
      "SKILL.md",
      "snapshot.json",
    ]);
    expect(await guidanceCommand(["--write", "--skill-dir", dir], quiet)).toBe(0);
    expect(folderBytes(dir)).toEqual(first);

    expect(await guidanceCommand(["--check"], quiet)).toBe(0);
  });

  test("a one-line prompt edit changes the prompt hash and the snapshot id, and --check exits 1", async () => {
    const before = guidanceSnapshot(canvasGuidanceSources());
    const after = guidanceSnapshot(withEditedPrompt());

    const changed = after.sources.filter((source, index) => source.sha256 !== before.sources[index]!.sha256);
    expect(changed.map(source => source.id)).toEqual(["prompt"]);
    expect(after.snapshotId).not.toBe(before.snapshotId);

    const lines: string[] = [];
    expect(await guidanceCommand(["--check"], { sources: withEditedPrompt(), log: line => lines.push(line) })).toBe(1);
    expect(lines.join("\n")).toContain("references/operating-context.md");
    expect(lines.join("\n")).toContain("snapshot.json");
  });

  test("a deleted SKILL.md makes --check exit 1", async () => {
    const dir = tempDir();
    expect(await guidanceCommand(["--write", "--skill-dir", dir], quiet)).toBe(0);
    rmSync(join(dir, "SKILL.md"));

    const lines: string[] = [];
    expect(await guidanceCommand(["--check", "--skill-dir", dir], { log: line => lines.push(line) })).toBe(1);
    expect(lines.join("\n")).toContain("SKILL.md");
  });

  test("--write clears every file --check reports, and --check ignores files outside the generated entries", async () => {
    const dir = tempDir();
    expect(await guidanceCommand(["--write", "--skill-dir", dir], quiet)).toBe(0);
    writeFileSync(join(dir, "notes.md"), "Kept by hand.\n");
    writeFileSync(join(dir, ".DS_Store"), "");
    expect(await guidanceCommand(["--check", "--skill-dir", dir], quiet)).toBe(0);

    writeFileSync(join(dir, "references", "stray.md"), "Not generated.\n");
    const lines: string[] = [];
    expect(await guidanceCommand(["--check", "--skill-dir", dir], { log: line => lines.push(line) })).toBe(1);
    expect(lines.join("\n")).toContain("references/stray.md");
    expect(await guidanceCommand(["--write", "--skill-dir", dir], quiet)).toBe(0);
    expect(await guidanceCommand(["--check", "--skill-dir", dir], quiet)).toBe(0);
    expect(readFileSync(join(dir, "notes.md"), "utf8")).toBe("Kept by hand.\n");
  });

  test("a one-character edit to the generated SKILL.md makes --check exit 1", async () => {
    const dir = tempDir();
    expect(await guidanceCommand(["--write", "--skill-dir", dir], quiet)).toBe(0);
    const path = join(dir, "SKILL.md");
    const text = readFileSync(path, "utf8");
    writeFileSync(path, `${text.slice(0, -1)}${text.endsWith("x") ? "y" : "x"}`);

    const lines: string[] = [];
    expect(await guidanceCommand(["--check", "--skill-dir", dir], { log: line => lines.push(line) })).toBe(1);
    expect(lines.join("\n")).toContain("SKILL.md");
  });

  test("snapshot.json carries the snapshot id canvas_guidance returns from the same sources", async () => {
    const committed = JSON.parse(readFileSync(join(SKILL_DIR, "snapshot.json"), "utf8")) as {
      snapshotId: string;
      sources: { id: string }[];
    };
    expect(committed.sources.map(source => source.id)).toEqual(canvasGuidanceSources().map(source => source.id));

    const service = createCanvasService({ workspace: tempDir() });
    const listed = await service.call("canvas_guidance", {});
    const served = listed.content.map(block => block.type === "text" ? block.text : "").join("\n").match(/^GUIDANCE · \d+ topics · (sha256:[0-9a-f]{64})$/m);
    expect(served?.[1]).toBe(committed.snapshotId);
  });
});
