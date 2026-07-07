/**
 * Reusable migration: reconcile persisted membership (parentId) with visual
 * nesting (geometry).
 *
 * W6 made sections the only legal parent, with membership persisted as
 * parentId. Legacy documents can carry stale flat parentIds (e.g. everything
 * parented to the outermost section while visually nested several levels
 * deep). This tool recomputes each object's parent from geometry:
 *
 *   - Candidate parents for an object are the sections (other than the object
 *     itself) whose rect contains the object's bounds-center (cx = x + w/2,
 *     cy = y + h/2; containment is inclusive, >= and <=).
 *   - When the object is itself a section, a candidate must additionally have
 *     STRICTLY greater area than the object. This prevents a large section
 *     from being adopted into a small geometric "child" whose bounds happen
 *     to contain the large section's center.
 *   - The proposed parent is the candidate with the smallest area (the most
 *     specific container = the deepest nesting level), or null if there is
 *     no candidate.
 *
 * Safety checks (hard error, exit 1, nothing written on violation):
 *   1. Every proposed parent exists and is a section.
 *   2. The proposed parent graph is acyclic.
 *   3. The final document passes validateInteractiveCanvasDocument.
 *
 * Run: bun tools/migrations/reconcile-membership.ts <path/to/file.canvas.json> [--write]
 * Default is a dry-run that prints the change table; --write saves the file.
 *
 * Formatting preservation: the canvas files are exactly
 * JSON.stringify(doc, null, 2) + "\n" with source key order, so a parse →
 * mutate → stringify round-trip is byte-identical outside the edited values.
 * The file is verified against that invariant before anything else happens.
 * Objects whose parentId already matches the proposal are never touched (an
 * absent parentId is treated as null but stays absent).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateInteractiveCanvasDocument } from "../../packages/canvas/src/state/schema.ts";

type CanvasGeometry = { x: number; y: number; width: number; height: number };

type CanvasObject = {
  id: string;
  type: string;
  parentId?: string | null;
  geometry: CanvasGeometry;
  [key: string]: unknown;
};

type CanvasDocument = {
  objects?: CanvasObject[];
  [key: string]: unknown;
};

function serialize(doc: CanvasDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function area(g: CanvasGeometry): number {
  return g.width * g.height;
}

function containsPoint(g: CanvasGeometry, x: number, y: number): boolean {
  return x >= g.x && x <= g.x + g.width && y >= g.y && y <= g.y + g.height;
}

/** Deepest (smallest-area) section whose rect contains the object's bounds-center. */
function proposeParent(object: CanvasObject, sections: CanvasObject[]): string | null {
  const cx = object.geometry.x + object.geometry.width / 2;
  const cy = object.geometry.y + object.geometry.height / 2;
  const objectIsSection = object.type === "section";
  const objectArea = area(object.geometry);

  let best: CanvasObject | null = null;
  for (const section of sections) {
    if (section.id === object.id) continue;
    if (!containsPoint(section.geometry, cx, cy)) continue;
    // A section can only be adopted by a strictly larger section; otherwise a
    // big section whose center falls inside a small geometric "child" would
    // be re-parented into it, inverting the hierarchy.
    if (objectIsSection && area(section.geometry) <= objectArea) continue;
    if (best === null || area(section.geometry) < area(best.geometry)) best = section;
  }
  return best?.id ?? null;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function main(): void {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const files = args.filter((a) => a !== "--write");
  if (files.length !== 1) {
    console.error("usage: bun tools/migrations/reconcile-membership.ts <path/to/file.canvas.json> [--write]");
    process.exit(1);
  }
  const path = resolve(files[0]!);

  const raw = readFileSync(path, "utf8");
  const doc = JSON.parse(raw) as CanvasDocument;

  // Guard the formatting invariant before mutating anything.
  if (serialize(doc) !== raw) {
    fail(`${path}: not in canonical 2-space JSON form; refusing to rewrite`);
  }

  const objects = doc.objects ?? [];
  const sections = objects.filter((o) => o.type === "section");
  const sectionIds = new Set(sections.map((s) => s.id));
  const objectIds = new Set(objects.map((o) => o.id));

  // Compute proposals for every object.
  const proposed = new Map<string, string | null>();
  for (const object of objects) {
    if (objectIds.size !== objects.length) fail(`${path}: duplicate object ids`);
    proposed.set(object.id, proposeParent(object, sections));
  }

  // Safety check 1: every proposed parent exists and is a section.
  for (const [id, parentId] of proposed) {
    if (parentId === null) continue;
    if (!objectIds.has(parentId)) fail(`proposed parent "${parentId}" of "${id}" does not exist`);
    if (!sectionIds.has(parentId)) fail(`proposed parent "${parentId}" of "${id}" is not a section`);
  }

  // Safety check 2: the proposed parent graph is acyclic.
  for (const id of proposed.keys()) {
    const seen = new Set<string>([id]);
    let current = proposed.get(id) ?? null;
    while (current !== null) {
      if (seen.has(current)) fail(`proposed parent graph has a cycle through "${current}"`);
      seen.add(current);
      current = proposed.get(current) ?? null;
    }
  }

  // Apply proposals in memory, leaving already-matching objects untouched
  // (absent parentId is treated as null but stays absent).
  let changed = 0;
  const rows: string[] = [];
  for (const object of objects) {
    const oldParent = object.parentId ?? null;
    const newParent = proposed.get(object.id) ?? null;
    if (oldParent === newParent) continue;
    rows.push(`  ${object.id}: ${oldParent ?? "(none)"} -> ${newParent ?? "(none)"}`);
    object.parentId = newParent;
    changed++;
  }

  // Safety check 3: the final document validates.
  const validation = validateInteractiveCanvasDocument(doc);
  if (!validation.ok) {
    for (const issue of validation.issues) console.error(`  ${issue.path}: ${issue.message}`);
    fail(`${path}: document fails validation after reconcile; nothing written`);
  }
  for (const warning of validation.warnings ?? []) {
    console.warn(`warning: ${warning.path}: ${warning.message}`);
  }

  if (rows.length > 0) {
    console.log(`${write ? "Applying" : "Proposed"} parentId changes:`);
    for (const row of rows) console.log(row);
  }
  console.log(
    `${path}: ${changed} changed, ${objects.length - changed} unchanged, ${objects.length} total` +
      (write ? "" : " (dry-run; pass --write to save)"),
  );

  if (write && changed > 0) {
    writeFileSync(path, serialize(doc), "utf8");
    console.log(`${path}: written`);
  } else if (write) {
    console.log(`${path}: no changes, untouched`);
  }
}

main();
