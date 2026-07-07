/**
 * One-shot migration: flatten legacy "container" objects into plain
 * "rectangle" shapes.
 *
 * For each canvas document:
 *   1. Every object with type "container" becomes type "rectangle"; all other
 *      fields (id, label, geometry, ...) are preserved verbatim.
 *   2. Every object whose parentId references one of those ex-container ids
 *      gets parentId: null (sections are now the only legal parent type).
 *      parentId values referencing sections are left untouched.
 *   3. Connections are never modified — they reference objects by objectId +
 *      anchor, and ex-container ids keep their ids, so they still resolve.
 *
 * Run: bun tools/migrations/flatten-containers.ts [files...]
 * With no arguments it scans every canvases/*.canvas.json.
 *
 * Formatting preservation: the canvas files are exactly
 * JSON.stringify(doc, null, 2) + "\n" with source key order, so a parse →
 * mutate → stringify round-trip is byte-identical outside the edited values.
 * Each file is verified against that invariant before writing (and files with
 * zero containers are never rewritten at all).
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const CANVASES_DIR = resolve(REPO_ROOT, "canvases");

type CanvasObject = {
  id: string;
  type: string;
  parentId?: string | null;
  [key: string]: unknown;
};

type CanvasConnection = {
  id: string;
  from: { objectId: string; [key: string]: unknown };
  to: { objectId: string; [key: string]: unknown };
  [key: string]: unknown;
};

type CanvasDocument = {
  objects?: CanvasObject[];
  connections?: CanvasConnection[];
  [key: string]: unknown;
};

function targetFiles(): string[] {
  const args = process.argv.slice(2);
  if (args.length > 0) return args.map((a) => resolve(a));
  return readdirSync(CANVASES_DIR)
    .filter((name) => name.endsWith(".canvas.json"))
    .sort()
    .map((name) => resolve(CANVASES_DIR, name));
}

function serialize(doc: CanvasDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function migrateFile(path: string): void {
  const raw = readFileSync(path, "utf8");
  const doc = JSON.parse(raw) as CanvasDocument;

  // Guard the formatting invariant before mutating anything.
  if (serialize(doc) !== raw) {
    console.error(`${path}: not in canonical 2-space JSON form; refusing to rewrite`);
    process.exitCode = 1;
    return;
  }

  const objects = doc.objects ?? [];
  const containerIds = new Set(
    objects.filter((o) => o.type === "container").map((o) => o.id),
  );
  const attachedConnections = (doc.connections ?? []).filter(
    (c) => containerIds.has(c.from.objectId) || containerIds.has(c.to.objectId),
  ).length;

  if (containerIds.size === 0) {
    console.log(`${path}: 0 containers, untouched`);
    return;
  }

  let parentIdsCleared = 0;
  for (const object of objects) {
    if (object.type === "container") object.type = "rectangle";
    if (object.parentId != null && containerIds.has(object.parentId)) {
      object.parentId = null;
      parentIdsCleared++;
    }
  }

  writeFileSync(path, serialize(doc), "utf8");
  console.log(
    `${path}: ${containerIds.size} container(s) → rectangle, ` +
      `${parentIdsCleared} parentId(s) cleared, ` +
      `${attachedConnections} attached connection(s) preserved verbatim`,
  );
}

for (const file of targetFiles()) migrateFile(file);
