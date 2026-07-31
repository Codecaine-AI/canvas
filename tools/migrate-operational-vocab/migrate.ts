#!/usr/bin/env bun
/**
 * Operational-maps vocabulary migration (idempotent, in-place).
 *
 * The shape surface shrinks from 30 placeable types to 11 (rectangle, process,
 * decision, predefined-process, triangle, ellipse, arrow-shape, octagon, plus
 * section / sticky / icon), the icon roster is renamed to the 30-glyph
 * operational corpus, and connections lose the `role` field. Stored boards
 * carry all three vocabularies, so this script rewrites them.
 *
 * Four passes, applied in order to every object:
 *
 *  1. RETIRED TYPES → replacements. Identity, text, geometry, parentId, and
 *     color are preserved; only `type`, `style.shape`, and (for glyph targets)
 *     `icon` change. `direction` is dropped, since only arrow-shape and
 *     triangle still carry one.
 *
 *       pentagon | hexagon | parallelogram | trapezoid → process (rounded-rect)
 *       pill                                           → rectangle (rounded-rect)
 *       page-corner | document                         → icon "document"
 *       document-stack                                 → icon "documents"
 *       cylinder-horizontal                            → icon "queue"
 *       database                                       → icon "memory"
 *
 *  2. GLYPH RENAMES on objects that are already icons: person→human,
 *     cpu→model, chat→message, shield→guardrail. `terminal` keeps its id (the
 *     art swapped, not the name).
 *
 *  3. JUDGMENT UPGRADES — the per-board review pass, table-driven so the
 *     script stays the single re-runnable source of truth. The mechanical
 *     default cannot read a label: "Tool A" wants the `tool` glyph, not a
 *     rounded rectangle. Every entry is keyed by board file name and object
 *     id, and each is justified in ICON_UPGRADES below.
 *
 *  4. GEOMETRY for glyph targets: kept as-is unless a side is under the
 *     96px glyph minimum, in which case that side grows to 96 about the
 *     original centre so the object does not move.
 *
 * Connections: `role` is deleted outright. Nothing else is touched.
 *
 * Idempotent by construction — every rule keys off a value the rule itself
 * removes, so a second run reports no changes.
 *
 * Deliberately standalone: it imports nothing from packages/canvas, because
 * the schema it migrates *to* is being edited in parallel and a type-level
 * dependency would make the migration unrunnable mid-flight.
 *
 * Usage:
 *   bun tools/migrate-operational-vocab/migrate.ts [dir-or-files...]
 * Defaults to the repo's canvases/ store (top level only — canvases/evals/ is
 * generated eval output and is not a migration target). Writes in place.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Pass 1 — retired types.
// ---------------------------------------------------------------------------

/** The render shape shared by `rectangle` and `process`. */
const ROUNDED_RECT = "rounded-rect";

type Replacement = {
  /** The surviving object type. */
  readonly type: string;
  /** The `style.shape` the replacement renders through. */
  readonly shape: string;
  /** Set for glyph targets; the object becomes a parameterized icon. */
  readonly icon?: string;
};

const RETIRED_TYPES: Record<string, Replacement> = {
  // Decorative flowchart bodies with no surviving distinction: all four were
  // "a step" drawn with a different silhouette.
  pentagon: { type: "process", shape: ROUNDED_RECT },
  hexagon: { type: "process", shape: ROUNDED_RECT },
  parallelogram: { type: "process", shape: ROUNDED_RECT },
  trapezoid: { type: "process", shape: ROUNDED_RECT },
  // The pill look survives only as the connector label chip.
  pill: { type: "rectangle", shape: ROUNDED_RECT },
  // Paper silhouettes fold into the document glyphs.
  "page-corner": { type: "icon", shape: "icon", icon: "document" },
  document: { type: "icon", shape: "icon", icon: "document" },
  "document-stack": { type: "icon", shape: "icon", icon: "documents" },
  // Storage silhouettes fold into the operational glyphs that own those jobs.
  "cylinder-horizontal": { type: "icon", shape: "icon", icon: "queue" },
  database: { type: "icon", shape: "icon", icon: "memory" },
};

// ---------------------------------------------------------------------------
// Pass 2 — glyph renames.
// ---------------------------------------------------------------------------

const GLYPH_RENAMES: Record<string, string> = {
  person: "human",
  cpu: "model",
  chat: "message",
  shield: "guardrail",
};

// ---------------------------------------------------------------------------
// Pass 3 — judgment upgrades.
// ---------------------------------------------------------------------------

/**
 * Board-reviewed glyph assignments, keyed by canvas file name → object id.
 *
 * The bar for an entry: the object's own label names the glyph, describing
 * what the object *is* rather than what it contains. "Knowledge graph" is the
 * knowledge glyph; "Past Messages in Chain" is a context document that happens
 * to hold messages, so it keeps the mechanical `document`.
 */
const ICON_UPGRADES: Record<string, Record<string, string>> = {
  "agent-flows-2.canvas.json": {
    // Three pills inside the agent's "Tools" section.
    "pill-tool-a": "tool",
    "pill-tool-b": "tool",
    "pill-tool-c": "tool",
  },
  "gc-decomp-harness.canvas.json": {
    // "Pi provider config" — the config glyph, not a bare rectangle.
    "pill-pi-provider": "config",
    // "Secrets (local.env)" — credentials are the key glyph.
    "pill-secrets": "key",
    // "Knowledge graph (graph.sqlite)" — the knowledge glyph outranks the
    // mechanical database→memory default.
    "db-knowledge-graph": "knowledge",
  },
  "ink-diagrams.canvas.json": {
    // Four parallelograms, every label beginning "Send ...". The parallelogram
    // carried the I/O meaning that process would drop; `send` restores it.
    "send-input-1-message-a": "send",
    "send-input-1-message-b": "send",
    "send-ink-api-response-1": "send",
    "send-expected-response-1": "send",
  },
};

// ---------------------------------------------------------------------------
// Pass 4 — glyph geometry floor.
// ---------------------------------------------------------------------------

/** The smallest side an icon object renders legibly at. */
const GLYPH_MIN_SIDE = 96;

/**
 * Grows any side under the glyph minimum to that minimum, about the original
 * centre so the object stays where the author put it. A no-op once applied.
 */
function floorGlyphGeometry(geometry: unknown): { geometry: JsonObject; grew: boolean } | null {
  if (!isRecord(geometry)) return null;
  const { x, y, width, height } = geometry;
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (width >= GLYPH_MIN_SIDE && height >= GLYPH_MIN_SIDE) return null;

  const next: JsonObject = { ...geometry };
  if (width < GLYPH_MIN_SIDE) {
    next.width = GLYPH_MIN_SIDE;
    if (typeof x === "number") next.x = x - (GLYPH_MIN_SIDE - width) / 2;
  }
  if (height < GLYPH_MIN_SIDE) {
    next.height = GLYPH_MIN_SIDE;
    if (typeof y === "number") next.y = y - (GLYPH_MIN_SIDE - height) / 2;
  }
  return { geometry: next, grew: true };
}

// ---------------------------------------------------------------------------
// Object transform.
// ---------------------------------------------------------------------------

export type ObjectCounts = {
  /** Retired type → replacement, counted per source type. */
  readonly converted: Record<string, number>;
  /** Icon glyph renames, counted per `from→to`. */
  readonly renamed: Record<string, number>;
  /** Judgment upgrades, counted per target glyph. */
  readonly upgraded: Record<string, number>;
  /** Glyph objects whose geometry hit the 96px floor. */
  grown: number;
};

function bump(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

/**
 * The object's `style` minus `direction`. Only arrow-shape and triangle still
 * carry a direction, and neither is a migration target, so every replacement
 * drops it — from `style` here and from the object itself at the call site.
 */
function styleWithoutDirection(style: unknown): JsonObject {
  if (!isRecord(style)) return {};
  const { direction: _direction, ...rest } = style;
  return rest;
}

/**
 * Rewrites one object to a glyph: type/shape/icon set, `direction` dropped,
 * geometry floored. Key order matches a hand-authored icon object (id, type,
 * text, color, parentId, geometry, style, icon).
 */
function toGlyph(object: JsonObject, glyph: string, counts: ObjectCounts): JsonObject {
  const { direction: _direction, style, icon: _icon, ...rest } = object;
  const styleRest = styleWithoutDirection(style);
  const floored = floorGlyphGeometry(rest.geometry);
  if (floored) {
    rest.geometry = floored.geometry;
    counts.grown += 1;
  }
  return { ...rest, type: "icon", style: { ...styleRest, shape: "icon" }, icon: glyph };
}

export function migrateObject(
  object: JsonObject,
  upgrades: Record<string, string>,
  counts: ObjectCounts,
): JsonObject | null {
  let current = object;
  let changed = false;

  // Pass 1 — retired type → replacement.
  const replacement = typeof current.type === "string" ? RETIRED_TYPES[current.type] : undefined;
  if (replacement) {
    bump(counts.converted, `${current.type}→${replacement.icon ?? replacement.type}`);
    if (replacement.icon) {
      current = toGlyph(current, replacement.icon, counts);
    } else {
      const { direction: _direction, style, ...rest } = current;
      const styleRest = styleWithoutDirection(style);
      current = { ...rest, type: replacement.type, style: { ...styleRest, shape: replacement.shape } };
    }
    changed = true;
  }

  // Pass 2 — glyph rename on an icon object.
  if (current.type === "icon" && typeof current.icon === "string") {
    const renamed = GLYPH_RENAMES[current.icon];
    if (renamed) {
      bump(counts.renamed, `${current.icon}→${renamed}`);
      current = { ...current, icon: renamed };
      changed = true;
    }
  }

  // Pass 3 — reviewed upgrade. Runs after conversion so it can override the
  // mechanical default (database→memory becomes knowledge, pill→rectangle
  // becomes tool).
  const upgrade = typeof current.id === "string" ? upgrades[current.id] : undefined;
  if (upgrade && !(current.type === "icon" && current.icon === upgrade)) {
    bump(counts.upgraded, upgrade);
    current = toGlyph(current, upgrade, counts);
    changed = true;
  }

  return changed ? current : null;
}

// ---------------------------------------------------------------------------
// Connection transform — role deletion.
// ---------------------------------------------------------------------------

export function migrateConnection(connection: JsonObject): JsonObject | null {
  if (!("role" in connection)) return null;
  const { role: _role, ...rest } = connection;
  return rest;
}

// ---------------------------------------------------------------------------
// Document / file plumbing.
// ---------------------------------------------------------------------------

export type DocumentReport = {
  readonly counts: ObjectCounts;
  /** Connections that carried a `role`. */
  readonly rolesStripped: number;
  /** Objects rewritten by any pass. */
  readonly objectsTouched: number;
};

export function migrateDocument(
  doc: JsonObject,
  upgrades: Record<string, string> = {},
): { doc: JsonObject; report: DocumentReport } {
  const counts: ObjectCounts = { converted: {}, renamed: {}, upgraded: {}, grown: 0 };
  let objectsTouched = 0;
  let rolesStripped = 0;
  let next = doc;

  if (Array.isArray(doc.objects)) {
    const objects = doc.objects.map((object) => {
      if (!isRecord(object)) return object;
      const migrated = migrateObject(object, upgrades, counts);
      if (!migrated) return object;
      objectsTouched += 1;
      return migrated;
    });
    if (objectsTouched > 0) next = { ...next, objects };
  }

  if (Array.isArray(doc.connections)) {
    const connections = doc.connections.map((connection) => {
      if (!isRecord(connection)) return connection;
      const migrated = migrateConnection(connection);
      if (!migrated) return connection;
      rolesStripped += 1;
      return migrated;
    });
    if (rolesStripped > 0) next = { ...next, connections };
  }

  return { doc: next, report: { counts, rolesStripped, objectsTouched } };
}

/**
 * Resolves targets to canvas files. Directories are scanned one level deep
 * only: canvases/evals/ holds regenerated eval output and is never a target.
 */
function collectFiles(args: string[]): string[] {
  const targets = args.length > 0 ? args : [join(import.meta.dir, "../../canvases")];
  const files: string[] = [];
  for (const target of targets) {
    const path = resolve(target);
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".canvas.json")) files.push(join(path, entry.name));
      }
    } else {
      files.push(path);
    }
  }
  return files.sort();
}

function formatCounts(bucket: Record<string, number>): string {
  const entries = Object.entries(bucket).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "none";
  return entries.map(([key, count]) => `${key} ×${count}`).join(", ");
}

if (import.meta.main) {
  let docsTouched = 0;
  let docsSkipped = 0;
  for (const file of collectFiles(process.argv.slice(2))) {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      console.warn(`skip (not an object): ${file}`);
      continue;
    }
    const upgrades = ICON_UPGRADES[basename(file)] ?? {};
    const { doc, report } = migrateDocument(parsed, upgrades);
    const { counts, rolesStripped, objectsTouched } = report;
    if (objectsTouched === 0 && rolesStripped === 0) {
      docsSkipped += 1;
      console.log(`already migrated: ${basename(file)}`);
      continue;
    }
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    docsTouched += 1;
    console.log(
      [
        `migrated ${basename(file)}`,
        `  objects touched: ${objectsTouched}`,
        `  converted:       ${formatCounts(counts.converted)}`,
        `  glyph renames:   ${formatCounts(counts.renamed)}`,
        `  upgrades:        ${formatCounts(counts.upgraded)}`,
        `  geometry grown:  ${counts.grown}`,
        `  roles stripped:  ${rolesStripped}`,
      ].join("\n"),
    );
  }
  console.log(`done — ${docsTouched} document(s) migrated, ${docsSkipped} already current.`);
}
