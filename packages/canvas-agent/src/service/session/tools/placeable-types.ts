/**
 * The folded `type` vocabulary — the one place the document model's
 * `{ type: "icon", icon: glyph }` split is translated, in both directions.
 *
 * The model never sees that split
 * (docs/30-agent-layout/50-tool-surface/10-gestures §Place, "Icons are shape
 * types"): placing `"memory"` and placing `"decision"` are the same gesture
 * with a different pick. The NAMES come from the object-preference registry
 * (packages/canvas/src/objects/registry) — the single roster shared by the
 * picker, the agent's <vocabulary> listing, and the lints — so the model-facing
 * roster is
 *
 *     PLACEABLE_TYPES = the registry's names, shapes first, then glyphs
 *
 * and every crossing of the tool boundary goes through `toDocumentFields`
 * (inbound: place_shape / change_shape) or `fromDocumentFields` (outbound:
 * digest, delta, diff, capabilities). Nothing else should ever read or write
 * the `icon` field next to a `type`.
 *
 * A registry name is a glyph or a shape type, never both: the glyph and shape
 * rosters are audited disjoint at import time (a future overlap throws rather
 * than silently shadowing — rename one side, the registry cannot alias).
 *
 * ---------------------------------------------------------------------------
 * Two names in `SHAPE_OBJECT_TYPES` that are NOT placeable
 * ---------------------------------------------------------------------------
 *
 * `"icon"` — the document's carrier type — is deliberately absent from the
 * registry even though `SHAPE_OBJECT_TYPES` contains it. Placing a bare `icon`
 * produces an object the validator rejects outright (`validate.ts` — "Icon
 * requires a known glyph id"), and offering the carrier type would put the
 * exact split this module exists to hide back on the tool surface. Glyphs are
 * reached by their own names instead. (`section` and `sticky` are already out
 * of `SHAPE_OBJECT_TYPES`; they have their own place gestures.)
 */
import { CANVAS_ICON_GLYPHS } from "@codecaine-ai/canvas/schema";
import type { CanvasIconGlyph, InteractiveCanvasObjectType } from "@codecaine-ai/canvas/schema";
import { StringEnum } from "@mariozechner/pi-ai";

import { OBJECT_PREFERENCES } from "../../../../../canvas/src/objects/registry";
import { SHAPE_OBJECT_TYPES } from "../perception/op-surface";

/** The document type that carries a glyph — never a placeable name. */
const ICON_CARRIER: InteractiveCanvasObjectType = "icon";

// ---------------------------------------------------------------------------
// The folded roster — the registry's names, classified against the schema
// ---------------------------------------------------------------------------

/** Shape types the model may place: the object roster minus the carrier type. */
export type PlaceableShapeType = Exclude<
  InteractiveCanvasObjectType,
  "section" | "sticky" | "icon"
>;

/** Glyphs the model may place, each under its own name. */
export type PlaceableGlyphType = CanvasIconGlyph;

/** One entry of the model-facing `type` vocabulary. */
export type PlaceableTypeName = PlaceableShapeType | PlaceableGlyphType;

/**
 * Every folded name the mapping understands. With the glyph and shape rosters
 * disjoint there are no suffixed collision names left, so the folded
 * vocabulary IS the placeable one.
 */
export type FoldedTypeName = PlaceableTypeName;

/** The document fields a folded name lowers to. */
export interface DocumentTypeFields {
  readonly type: InteractiveCanvasObjectType;
  readonly icon?: CanvasIconGlyph;
}

const GLYPH_SET: ReadonlySet<string> = new Set<string>(CANVAS_ICON_GLYPHS);

/** Registry names that are shape types, in registry (roster) order. */
export const PLACEABLE_SHAPE_TYPES: readonly PlaceableShapeType[] = OBJECT_PREFERENCES
  .map((entry) => entry.name)
  .filter((name): name is PlaceableShapeType => !GLYPH_SET.has(name));

/** Registry names that are glyphs, in registry (roster) order. */
export const PLACEABLE_GLYPH_TYPES: readonly PlaceableGlyphType[] = OBJECT_PREFERENCES
  .map((entry) => entry.name)
  .filter((name): name is PlaceableGlyphType => GLYPH_SET.has(name));

/** The model-facing `type` roster: shapes first, then the glyphs. */
export const PLACEABLE_TYPES: readonly PlaceableTypeName[] = [
  ...PLACEABLE_SHAPE_TYPES,
  ...PLACEABLE_GLYPH_TYPES,
];

// ---------------------------------------------------------------------------
// The bidirectional map
// ---------------------------------------------------------------------------

const PLACEABLE_TYPE_SET: ReadonlySet<string> = new Set<string>(PLACEABLE_TYPES);

/** Whether `value` is a name the tool surface accepts. */
export function isPlaceableType(value: unknown): value is PlaceableTypeName {
  return typeof value === "string" && PLACEABLE_TYPE_SET.has(value);
}

/**
 * Lower a folded name onto the document fields it names. Accepts any name the
 * two schema rosters resolve (a `fromDocumentFields` result is always a legal
 * argument here, so an outbound name can always be re-lowered). Throws on a
 * name outside the mapping — the schema is the gate, this is the assertion.
 */
export function toDocumentFields(placeableType: FoldedTypeName): DocumentTypeFields {
  if (GLYPH_SET.has(placeableType)) {
    return { type: ICON_CARRIER, icon: placeableType as CanvasIconGlyph };
  }
  if (placeableType !== ICON_CARRIER && SHAPE_OBJECT_TYPES.has(placeableType)) {
    return { type: placeableType as InteractiveCanvasObjectType };
  }
  throw new Error(`Unknown placeable type: ${placeableType}`);
}

/**
 * Fold document fields back into one name. Total by construction:
 *
 * - `{ type: "icon", icon }` is the glyph's own name;
 * - a shape type is its own name;
 * - `section` / `sticky` pass through under their own names (they are not
 *   placeable via `place_shape`, but outbound renderers hand this function
 *   whatever a document holds);
 * - an icon object with a missing or unknown glyph degrades to `"icon"` —
 *   a document the validator rejects, kept resolvable rather than throwing so
 *   perception never dies on a malformed board.
 */
export function fromDocumentFields(
  fields: DocumentTypeFields | { type: InteractiveCanvasObjectType; icon?: string },
): FoldedTypeName | InteractiveCanvasObjectType {
  if (fields.type !== ICON_CARRIER) {
    return fields.type;
  }
  return fields.icon !== undefined && GLYPH_SET.has(fields.icon)
    ? (fields.icon as FoldedTypeName)
    : ICON_CARRIER;
}

/** The glyph a folded name draws, or `undefined` for a plain shape type. */
export function glyphForPlaceableType(placeableType: FoldedTypeName): CanvasIconGlyph | undefined {
  return toDocumentFields(placeableType).icon;
}

// ---------------------------------------------------------------------------
// Import-time audit — the registry and the schema rosters must agree
// ---------------------------------------------------------------------------

// Disjoint rosters: one string, one drawing. A glyph id that a shape type also
// owns would make a bare name mean two things, so it fails loudly here —
// rename the glyph or the shape before it ships.
const overlapping = CANVAS_ICON_GLYPHS.filter((glyph) => SHAPE_OBJECT_TYPES.has(glyph));
if (overlapping.length > 0) {
  throw new Error(
    `Glyph ids collide with shape types: [${overlapping.join(", ")}]. The rosters must be `
      + "disjoint — one string names one drawing. Rename one side.",
  );
}

// Every registry name resolves to exactly one document lowering.
const unresolved = OBJECT_PREFERENCES
  .map((entry) => entry.name)
  .filter(
    (name) => name === ICON_CARRIER || (!GLYPH_SET.has(name) && !SHAPE_OBJECT_TYPES.has(name)),
  );
if (unresolved.length > 0) {
  throw new Error(
    `object-preferences.json names outside both schema rosters: [${unresolved.join(", ")}]. `
      + "Every registry name must be a glyph id or a placeable shape type.",
  );
}

// Every glyph is placeable — a glyph missing from the registry would render in
// documents but be unreachable and undocumented on the tool surface.
const unregistered = CANVAS_ICON_GLYPHS.filter((glyph) => !PLACEABLE_TYPE_SET.has(glyph));
if (unregistered.length > 0) {
  throw new Error(
    `Glyphs missing from object-preferences.json: [${unregistered.join(", ")}]. Every glyph `
      + "needs a registry entry (meaning, scenarios, color).",
  );
}

// And so is every shape type the schema still carries (minus the carrier and
// the kinds with their own gestures) — the schema roster and the registry move
// together.
const unlisted = [...SHAPE_OBJECT_TYPES].filter(
  (type) => type !== ICON_CARRIER && !PLACEABLE_TYPE_SET.has(type),
);
if (unlisted.length > 0) {
  throw new Error(
    `Shape types missing from object-preferences.json: [${unlisted.join(", ")}]. Every `
      + "placeable shape needs a registry entry (meaning, scenarios, color).",
  );
}

if (PLACEABLE_TYPE_SET.size !== PLACEABLE_TYPES.length) {
  throw new Error("The folded type roster contains duplicates.");
}

// ---------------------------------------------------------------------------
// Tool schema
// ---------------------------------------------------------------------------

/**
 * The `type` enum every place/swap gesture declares. Lives here rather than in
 * schemas.ts so the roster and the enum that publishes it cannot drift apart.
 */
export const PlaceableType = StringEnum([...PLACEABLE_TYPES], {
  description: "The shape or icon to draw. Icons are types: pick the glyph name.",
});
