/**
 * The canvas skill generator: owns the whole `skills/canvas` folder. It copies
 * the hand-written `src/skill/SKILL.md` and writes six of the ten served topics
 * into the references (`canvasGuidanceTopics`). Every reference is the same
 * text `canvas_guidance` serves, and snapshot.json carries the same snapshot id
 * `canvas_guidance` returns, so the skill's compare step can tell a stale
 * install from a current one. snapshot.json also hashes SKILL.md, which is not
 * a `canvas_guidance` source and so stays out of the snapshot id.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  canvasGuidanceSources,
  canvasGuidanceTopics,
  guidanceSnapshot,
  vocabularyContactSheet,
  type GuidanceSource,
} from "@codecaine-ai/canvas/authoring";

export const SKILL_DIR = resolve(import.meta.dir, "../skills/canvas");
/** The hand-written SKILL.md. The generator copies it into the folder unchanged. */
const SKILL_SOURCE = resolve(import.meta.dir, "skill/SKILL.md");
const SKILL_SOURCE_PATH = "packages/canvas-mcp/src/skill/SKILL.md";
const REGENERATE = "bun packages/canvas-mcp/src/cli.ts guidance --write";

/** `canvas_guidance` topic id → reference file. Each file is the topic exactly as `canvas_guidance` serves it. */
const TOPIC_FILES: Record<string, string> = {
  operating_context: "references/operating-context.md",
  visual_patterns: "references/visual-patterns.md",
  diagram_design: "references/diagram-design.md",
  visual_vocabulary: "references/vocabulary.md",
  color_palette: "references/colors.md",
  canvas_conventions: "references/conventions.md",
};

function stamp(sources: readonly { path: string; sha256: string }[]): string {
  const from = sources.map(source => `${source.path} (sha256 ${source.sha256})`).join(", ");
  return `<!-- Generated from ${from}. Do not edit. Regenerate with \`${REGENERATE}\`. -->\n\n`;
}

/** Every generated file, keyed by its path under the skill folder. Deterministic. */
export function renderCanvasSkill(sources: readonly GuidanceSource[] = canvasGuidanceSources()): Map<string, string | Uint8Array> {
  const snapshot = guidanceSnapshot(sources);
  const hashOf = (ids: readonly string[]) => ids.map(id => snapshot.sources.find(source => source.id === id)!);
  const topics = canvasGuidanceTopics(sources);
  const sheet = vocabularyContactSheet();
  if (!sheet) throw new Error("vocabularyContactSheet could not render the default-style contact sheet");

  const skill = readFileSync(SKILL_SOURCE, "utf8");
  const skillHash = { path: SKILL_SOURCE_PATH, sha256: createHash("sha256").update(skill, "utf8").digest("hex") };

  const files = new Map<string, string | Uint8Array>();
  files.set("SKILL.md", skill);
  files.set("snapshot.json", `${JSON.stringify({ schemaVersion: 1, snapshotId: snapshot.snapshotId, sources: snapshot.sources, skill: skillHash }, null, 2)}\n`);
  for (const [id, file] of Object.entries(TOPIC_FILES)) {
    const topic = topics.find(entry => entry.id === id)!;
    // The same heading and text `canvas_guidance { topic }` returns.
    files.set(file, `${stamp(hashOf(topic.sources))}# ${topic.title}\n\n${topic.text}\n`);
  }
  files.set("assets/contact-sheet.png", new Uint8Array(sheet));
  return files;
}

/** The top-level entries of the skill folder the generator owns: `--write` replaces them, `--check` compares only them. */
const OWNED_ENTRIES = ["SKILL.md", "references", "assets", "snapshot.json"];

/** Replace every generated entry of `dir`, SKILL.md included. */
export async function writeCanvasSkill(dir: string, files: Map<string, string | Uint8Array>): Promise<void> {
  await Promise.all(OWNED_ENTRIES.map(entry => rm(join(dir, entry), { recursive: true, force: true })));
  for (const [path, content] of files) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)))
    .filter(path => OWNED_ENTRIES.includes(path.split(sep)[0]!))
    .sort();
}

/** The paths that differ between two skill folders. */
export async function diffSkillFolders(expected: string, actual: string): Promise<string[]> {
  const [left, right] = await Promise.all([listFiles(expected), listFiles(actual)]);
  const paths = [...new Set([...left, ...right])].sort();
  const differs = await Promise.all(paths.map(async path => {
    const [a, b] = await Promise.all([readFile(join(expected, path)).catch(() => null), readFile(join(actual, path)).catch(() => null)]);
    return !a || !b || !a.equals(b);
  }));
  return paths.filter((_, index) => differs[index]);
}

/** Regenerate into a temp folder and list what differs from `dir`. */
export async function checkCanvasSkill(dir: string, sources?: readonly GuidanceSource[]): Promise<string[]> {
  const temp = await mkdtemp(join(tmpdir(), "canvas-skill-"));
  try {
    await writeCanvasSkill(temp, renderCanvasSkill(sources));
    return await diffSkillFolders(temp, dir);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

/**
 * `guidance [--write | --check] [--skill-dir DIR]`. Prints the snapshot and
 * returns the exit code: `--check` returns 1 when the folder is stale.
 */
export async function guidanceCommand(
  args: readonly string[],
  options: { sources?: readonly GuidanceSource[]; log?: (line: string) => void } = {},
): Promise<number> {
  const log = options.log ?? ((line: string) => console.log(line));
  const index = args.indexOf("--skill-dir");
  const dir = index >= 0 && args[index + 1] ? resolve(args[index + 1]!) : SKILL_DIR;
  const sources = options.sources ?? canvasGuidanceSources();
  const snapshot = guidanceSnapshot(sources);
  if (args.includes("--check")) {
    const stale = await checkCanvasSkill(dir, sources);
    if (stale.length > 0) {
      log(`canvas skill is stale (${snapshot.snapshotId}): ${stale.join(", ")}. Run \`${REGENERATE}\`.`);
      return 1;
    }
    log(`canvas skill is current · ${snapshot.snapshotId}`);
    return 0;
  }
  if (args.includes("--write")) {
    await writeCanvasSkill(dir, renderCanvasSkill(sources));
    log(`wrote ${relative(process.cwd(), dir) || dir} · ${snapshot.snapshotId}`);
    return 0;
  }
  log(JSON.stringify(snapshot, null, 2));
  return 0;
}
