#!/usr/bin/env bun
/**
 * One-shot canvas-document migration (idempotent, in-place) for:
 *
 *  P2 — text unification (OBJECT-DEF-OVERHAUL.md D3/D11/O3): collapses the
 *  legacy per-object `label` / `body` / `title` fields into the single
 *  required `text` field.
 *
 *  P1 — hard color cutover (OBJECT-DEF-OVERHAUL.md D1/D7/D10/§3.2): replaces
 *  the four legacy color vocabularies with the single `color: CanvasColor`
 *  swatch id:
 *    - explicit `style.fill` / `style.stroke` hex → nearest swatch
 *      (hue-distance against the 10-pick ink/fill/wash palette; fill wins
 *      over stroke when both are present)
 *    - `style.paletteToken` → nearest swatch (sticky-aware: tokens on
 *      stickies previously resolved to the exact classic sticky hexes, so
 *      they map to those swatches — note→yellow, hot→red, memory→pink,
 *      process→blue)
 *    - `style.tone` → nearest swatch (default-sticky "warning" maps to the
 *      classic default yellow)
 *    - section `tint` name → the same-hue swatch (green→green, …,
 *      gray→gray, white→white, teal→teal)
 *    - connection `color` hex → nearest swatch id
 *    - already-migrated legacy `"<hue>-soft"` ids → `"<hue>"`
 *  The legacy fields are DELETED (no legacy read path, D10).
 *
 * Text mapping (D11):
 *   - section              → text = title ?? label
 *   - sticky / code-block  → text = body ("" when absent; the label was never
 *                            rendered on these kinds and is dropped)
 *   - everything else      → text = label, with a non-empty body appended on
 *                            a new line so no content is lost
 *
 * `author` (sticky), `language` (code-block), `icon`, `direction`, and
 * connection `label`s are untouched.
 *
 * Idempotent: objects/connections that carry none of the legacy fields are
 * skipped, so re-running over a migrated store is a no-op.
 *
 * Usage:
 *   bun tools/migrate-canvas-docs/migrate.ts [dir-or-files...]
 * Defaults to the repo's canvases/ store. Writes in place.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CANVAS_PALETTE } from "../../packages/canvas/src/palette";
import { reconcileSectionMembership } from "../../packages/canvas/src/state/section-membership";
import type { InteractiveCanvasDocument } from "../../packages/canvas/src/state/schema";
import type { CanvasColor, CanvasHue } from "../../packages/canvas/src/state/schema/colors";
import { isCanvasColor } from "../../packages/canvas/src/state/schema/colors";

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeCanvasColor(value: unknown): CanvasColor | undefined {
  if (isCanvasColor(value)) return value;
  if (typeof value !== "string" || !value.endsWith("-soft")) return undefined;
  const hue = value.slice(0, -"-soft".length);
  return isCanvasColor(hue) ? hue : undefined;
}

// ---------------------------------------------------------------------------
// Nearest-swatch matching (adapted from the deleted objects/palette.ts
// nearestPaletteToken, extended per the P1 brief: match against the 10 palette
// ink swatches. Hue distance picks the hue family; achromatic values ladder to
// white or gray by lightness.
// ---------------------------------------------------------------------------

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  if ([r, g, b].some((value) => Number.isNaN(value))) return null;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** The 8 chromatic hue families (gray/white are matched by lightness instead). */
const CHROMATIC_HUES: readonly CanvasHue[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
];

/** Per-hue anchor angles, derived from the palette table itself. */
const HUE_ANCHORS = CHROMATIC_HUES.map((hue) => {
  const swatch = hexToHsl(CANVAS_PALETTE[hue].swatch);
  if (!swatch) throw new Error(`palette swatch for "${hue}" is not a parsable hex`);
  return { hue, angle: swatch.h };
});

/**
 * Hex → nearest CanvasColor id: achromatic hexes ladder onto the neutral
 * column (white / gray by lightness); chromatic hexes pick the closest hue
 * family by hue angle. Unparsable input falls back to neutral "gray".
 */
export function nearestCanvasColor(hex: string): CanvasColor {
  const hsl = hexToHsl(hex.trim());
  if (!hsl) return "gray";
  if (hsl.s < 0.08) {
    return hsl.l >= 0.96 ? "white" : "gray";
  }
  let best = HUE_ANCHORS[0];
  let bestDistance = Infinity;
  for (const anchor of HUE_ANCHORS) {
    const distance = hueDistance(hsl.h, anchor.angle);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = anchor;
    }
  }
  return best.hue;
}

// ---------------------------------------------------------------------------
// Legacy-vocabulary tables (§3.2).
// ---------------------------------------------------------------------------

/** Section tint name → same-hue swatch (§3.2; legacy "purple" is the "violet" hue). */
const TINT_TO_COLOR: Record<string, CanvasColor> = {
  green: "green",
  purple: "violet",
  orange: "orange",
  yellow: "yellow",
  gray: "gray",
  white: "white",
  pink: "pink",
  red: "red",
  blue: "blue",
  teal: "teal",
};

/**
 * paletteToken → nearest swatch. Non-sticky objects rendered tokens as
 * washed theme-mix fills with saturated borders. Stickies resolved tokens to
 * the exact classic sticky hexes (theme.ts's old STICKY_TOKEN_FILL), which now
 * live in the sticky fill cells.
 */
const TOKEN_TO_COLOR: Record<string, CanvasColor> = {
  process: "blue",
  input: "green",
  hot: "orange",
  memory: "violet",
  note: "yellow",
};

const STICKY_TOKEN_TO_COLOR: Record<string, CanvasColor> = {
  process: "blue", // classic blue sticky #80CAFF
  input: "green",
  hot: "red", // classic salmon sticky #FFAFA3
  memory: "pink", // classic pink sticky #FFA8DB
  note: "yellow", // classic yellow sticky #FFE299
};

/** tone → nearest swatch (D1's mapping spirit: memory→violet, process→blue, …). */
const TONE_TO_COLOR: Record<string, CanvasColor> = {
  neutral: "gray",
  input: "green",
  process: "blue",
  decision: "yellow",
  memory: "violet",
  agent: "blue",
  warning: "red",
  annotation: "blue",
};

/**
 * tone → swatch for stickies: `warning` was the stamped DEFAULT tone of
 * every placed sticky (not a deliberate red pick), so it maps to the classic
 * default yellow; deliberate hue tones map onto the classic sticky hues.
 */
const STICKY_TONE_TO_COLOR: Record<string, CanvasColor> = {
  neutral: "gray",
  input: "green",
  process: "blue",
  decision: "yellow",
  memory: "pink",
  agent: "blue",
  warning: "yellow",
  annotation: "blue",
};

function isSticky(object: JsonObject): boolean {
  if (object.type === "sticky") return true;
  return isRecord(object.style) && object.style.shape === "note";
}

// ---------------------------------------------------------------------------
// P2 — text transform.
// ---------------------------------------------------------------------------

/** Returns the text-migrated object (key order: id, type, text, rest) or null when already migrated. */
export function migrateObjectText(object: JsonObject): JsonObject | null {
  const alreadyMigrated =
    typeof object.text === "string" &&
    !("label" in object) &&
    !("body" in object) &&
    !("title" in object);
  if (alreadyMigrated) return null;

  const label = typeof object.label === "string" ? object.label : "";
  const body = typeof object.body === "string" ? object.body : "";
  const title = typeof object.title === "string" ? object.title : undefined;

  let text: string;
  if (object.type === "section") {
    text = title ?? label;
  } else if (object.type === "sticky" || object.type === "code-block") {
    text = body;
  } else {
    text = body !== "" ? `${label}\n${body}` : label;
  }

  const { label: _label, body: _body, title: _title, ...rest } = object;
  // Stable, readable key order: id, type, text, then everything else as-is.
  const { id, type, ...others } = rest;
  return { id, type, text, ...others };
}

// ---------------------------------------------------------------------------
// P1 — color transform.
// ---------------------------------------------------------------------------

const LEGACY_STYLE_COLOR_KEYS = ["tone", "paletteToken", "fill", "stroke"] as const;

function hasLegacyObjectColor(object: JsonObject): boolean {
  if (typeof object.color === "string") {
    const normalized = normalizeCanvasColor(object.color);
    if (normalized && normalized !== object.color) return true;
  }
  if ("tint" in object) return true;
  if (!isRecord(object.style)) return false;
  return LEGACY_STYLE_COLOR_KEYS.some((key) => key in (object.style as JsonObject));
}

/**
 * Resolves the CanvasColor a legacy-colored object migrates to, per the §3.2
 * precedence: explicit fill hex → explicit stroke hex → section tint name →
 * paletteToken → tone (sticky-aware token/tone tables). Returns undefined
 * when every legacy field is present-but-unusable (e.g. empty strings) —
 * the object then keeps no color and renders the per-kind first-use default.
 */
export function legacyObjectColor(object: JsonObject): CanvasColor | undefined {
  const style = isRecord(object.style) ? object.style : {};
  if (typeof style.fill === "string" && style.fill.trim() !== "") {
    return nearestCanvasColor(style.fill);
  }
  if (typeof style.stroke === "string" && style.stroke.trim() !== "") {
    return nearestCanvasColor(style.stroke);
  }
  if (typeof object.tint === "string" && TINT_TO_COLOR[object.tint]) {
    return TINT_TO_COLOR[object.tint];
  }
  const sticky = isSticky(object);
  if (typeof style.paletteToken === "string") {
    const mapped = (sticky ? STICKY_TOKEN_TO_COLOR : TOKEN_TO_COLOR)[style.paletteToken];
    if (mapped) return mapped;
  }
  if (typeof style.tone === "string") {
    const mapped = (sticky ? STICKY_TONE_TO_COLOR : TONE_TO_COLOR)[style.tone];
    if (mapped) return mapped;
  }
  return undefined;
}

/** Returns the color-migrated object (color inserted after text) or null when already migrated. */
export function migrateObjectColor(object: JsonObject): JsonObject | null {
  if (!hasLegacyObjectColor(object)) return null;

  const storedColor = typeof object.color === "string" ? normalizeCanvasColor(object.color) : undefined;
  const color = legacyObjectColor(object) ?? storedColor;

  const { tint: _tint, ...rest } = object;
  let style: JsonObject | undefined;
  if (isRecord(rest.style)) {
    const { tone: _tone, paletteToken: _token, fill: _fill, stroke: _stroke, ...styleRest } = rest.style;
    style = Object.keys(styleRest).length > 0 ? styleRest : undefined;
  }
  const { style: _style, ...objectRest } = rest;
  // Stable, readable key order: id, type, text, color, then the rest as-is.
  const { id, type, text, color: _existingColor, ...others } = objectRest;
  return {
    id,
    type,
    ...(text !== undefined ? { text } : {}),
    ...(color !== undefined ? { color } : {}),
    ...others,
    ...(style !== undefined ? { style } : {}),
  };
}

/** Returns the color-migrated connection (hex → swatch id) or null when already migrated. */
export function migrateConnectionColor(connection: JsonObject): JsonObject | null {
  const color = connection.color;
  if (typeof color !== "string") return null;
  if (isCanvasColor(color)) return null;
  const normalized = normalizeCanvasColor(color);
  if (normalized) return { ...connection, color: normalized };
  return { ...connection, color: nearestCanvasColor(color) };
}

// ---------------------------------------------------------------------------
// D1 — section membership transform.
// ---------------------------------------------------------------------------

export function migrateSectionMembership(doc: JsonObject): { doc: JsonObject; migrated: number } {
  if (!Array.isArray(doc.objects)) return { doc, migrated: 0 };

  const reconciled = reconcileSectionMembership(doc as unknown as InteractiveCanvasDocument);
  if (reconciled === (doc as unknown as InteractiveCanvasDocument)) return { doc, migrated: 0 };

  const beforeById = new Map<string, { hasParentId: boolean; parentId: string | null }>();
  for (const object of doc.objects) {
    if (isRecord(object) && typeof object.id === "string") {
      beforeById.set(object.id, {
        hasParentId: "parentId" in object,
        parentId: typeof object.parentId === "string" ? object.parentId : null,
      });
    }
  }

  let migrated = 0;
  for (const object of reconciled.objects) {
    const before = beforeById.get(object.id);
    const afterParentId = object.parentId ?? null;
    const afterHasParentId = "parentId" in object;
    if (!before || before.parentId !== afterParentId || before.hasParentId !== afterHasParentId) migrated += 1;
  }

  return { doc: reconciled as unknown as JsonObject, migrated };
}

// ---------------------------------------------------------------------------
// Document / file plumbing.
// ---------------------------------------------------------------------------

export function migrateDocument(doc: JsonObject): { doc: JsonObject; migrated: number } {
  let migrated = 0;
  let next = doc;
  if (Array.isArray(doc.objects)) {
    const objects = doc.objects.map((object) => {
      if (!isRecord(object)) return object;
      let current = object;
      const textMigrated = migrateObjectText(current);
      if (textMigrated) current = textMigrated;
      const colorMigrated = migrateObjectColor(current);
      if (colorMigrated) current = colorMigrated;
      if (current !== object) migrated += 1;
      return current;
    });
    next = { ...next, objects };
  }
  if (Array.isArray(doc.connections)) {
    let connectionsChanged = false;
    const connections = doc.connections.map((connection) => {
      if (!isRecord(connection)) return connection;
      const colorMigrated = migrateConnectionColor(connection);
      if (colorMigrated) {
        migrated += 1;
        connectionsChanged = true;
        return colorMigrated;
      }
      return connection;
    });
    if (connectionsChanged) next = { ...next, connections };
  }
  const sectionMembershipMigrated = migrateSectionMembership(next);
  if (sectionMembershipMigrated.migrated > 0) {
    migrated += sectionMembershipMigrated.migrated;
    next = sectionMembershipMigrated.doc;
  }
  return { doc: next, migrated };
}

function collectFiles(args: string[]): string[] {
  const targets = args.length > 0 ? args : [join(import.meta.dir, "../../canvases")];
  const files: string[] = [];
  for (const target of targets) {
    const path = resolve(target);
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (entry.endsWith(".json")) files.push(join(path, entry));
      }
    } else {
      files.push(path);
    }
  }
  return files;
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
    const { doc, migrated } = migrateDocument(parsed);
    if (migrated === 0) {
      docsSkipped += 1;
      console.log(`already migrated: ${file}`);
      continue;
    }
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    docsTouched += 1;
    console.log(`migrated ${migrated} object(s)/connection(s): ${file}`);
  }
  console.log(`done — ${docsTouched} document(s) migrated, ${docsSkipped} already current.`);
}
