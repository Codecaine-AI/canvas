/**
 * The folded `type` vocabulary — the one place the document model's
 * `{ type: "icon", icon: glyph }` split is translated, in both directions.
 *
 * The model never sees that split
 * (docs/30-agent-layout/50-tool-surface/10-gestures §Place, "Icons are shape
 * types"): placing `"database"` and placing `"cloud"` are the same
 * gesture with a different pick. So the model-facing roster is
 *
 *     PLACEABLE_TYPES = icon glyphs ∪ (shape types − collisions)
 *
 * and every crossing of the tool boundary goes through `toDocumentFields`
 * (inbound: place_shape / change_shape) or `fromDocumentFields` (outbound:
 * digest, delta, diff, capabilities). Nothing else should ever read or write
 * the `icon` field next to a `type`.
 *
 * ---------------------------------------------------------------------------
 * Collision table — who keeps the bare name
 * ---------------------------------------------------------------------------
 *
 * | glyph      | shape it collides with | bare name goes to | the loser reads as |
 * |------------|------------------------|-------------------|--------------------|
 * | `database` | `database`             | the GLYPH         | `database-shape`   |
 *
 * `database` is the ONLY id shared by the two rosters (audited at import time
 * below — a future overlap throws rather than silently shadowing). The spec
 * settles it by example: "placing `"database"` places that icon the same way
 * placing `"diamond"` places a diamond". So the bare name is the glyph's, and
 * the flowchart shape — the filled cylinder in
 * objects/shapes/flowchart/database.tsx — keeps only a READ-ONLY outbound name,
 * `database-shape`. Boards that already hold one (drawn in the UI, or made
 * before this rule) still digest and diff losslessly, and `fromDocumentFields`
 * stays total; but the shape is not in `PLACEABLE_TYPES`, so `place_shape` and
 * `change_shape` will not accept it.
 *
 * The mirror decision exists too, and a future collision may want it: a glyph
 * whose shape twin is genuinely a different drawing keeps the shape on the bare
 * name and reaches the glyph as `<glyph>-icon`. Whichever way a collision goes,
 * exactly one of the pair is placeable and the other is read-only, so no name
 * ever means two things.
 *
 * ---------------------------------------------------------------------------
 * Two names in `SHAPE_OBJECT_TYPES` that are NOT placeable
 * ---------------------------------------------------------------------------
 *
 * `"icon"` — the document's carrier type — is deliberately dropped from the
 * roster even though `SHAPE_OBJECT_TYPES` contains it. Placing a bare `icon`
 * produces an object the validator rejects outright (`validate.ts` — "Icon
 * requires a known glyph id"), and offering the carrier type would put the
 * exact split this module exists to hide back on the tool surface. Glyphs are
 * reached by their own names instead. (`section` and `sticky` are already out
 * of `SHAPE_OBJECT_TYPES`; they have their own place gestures.)
 */
import { CANVAS_ICON_GLYPHS } from "@codecaine-ai/canvas/schema";
import type { CanvasIconGlyph, InteractiveCanvasObjectType } from "@codecaine-ai/canvas/schema";
import { StringEnum } from "@mariozechner/pi-ai";

import { SHAPE_OBJECT_TYPES } from "../perception/op-surface";

/** The document type that carries a glyph — never a placeable name. */
const ICON_CARRIER: InteractiveCanvasObjectType = "icon";

/** Suffix a glyph wears when the shape it collides with keeps the bare name. */
const GLYPH_SUFFIX = "-icon";

/** Suffix a shape wears when the glyph it collides with takes the bare name. */
const SHAPE_SUFFIX = "-shape";

// ---------------------------------------------------------------------------
// The audited collision table
// ---------------------------------------------------------------------------

/**
 * Which roster keeps the bare name when a glyph id and a shape type are the
 * same word:
 *
 * - `"glyph-wins"` — the bare name places the ICON. The shape is not placeable
 *   and travels outbound only, as `<type>-shape`.
 * - `"shape-wins"` — the bare name places the SHAPE. The glyph stays placeable
 *   under `<glyph>-icon`.
 */
type CollisionDecision = "glyph-wins" | "shape-wins";

interface GlyphCollision {
  readonly glyph: CanvasIconGlyph;
  readonly decision: CollisionDecision;
  /** Why the decision went that way — the audit, in code. */
  readonly reason: string;
}

/** Every glyph id that a shape type also owns, with its recorded decision. */
export const GLYPH_COLLISIONS = [
  {
    glyph: "database",
    decision: "glyph-wins",
    reason:
      "A glyph is placed by its own bare name, so where a glyph and a shape type collide the glyph keeps the bare name and the icon owns \"database\" (docs/30-agent-layout/50-tool-surface/10-gestures §Place); the flowchart cylinder is the same pictogram drawn as a filled node, and it stays readable as database-shape.",
  },
] as const satisfies readonly GlyphCollision[];

/** Glyphs that yielded the bare name and are reached under `-icon`. */
type SuffixedGlyph = Extract<(typeof GLYPH_COLLISIONS)[number], { decision: "shape-wins" }>["glyph"];
/** Shape types that yielded the bare name to a glyph and are read-only. */
type YieldedShape = Extract<(typeof GLYPH_COLLISIONS)[number], { decision: "glyph-wins" }>["glyph"];

// ---------------------------------------------------------------------------
// The folded roster
// ---------------------------------------------------------------------------

/**
 * Shape types the model may place: the object roster minus the carrier type and
 * minus any type whose name a glyph took.
 */
export type PlaceableShapeType = Exclude<
  InteractiveCanvasObjectType,
  "section" | "sticky" | "icon" | YieldedShape
>;

/** Glyphs the model may place, under their own name or a suffixed one. */
export type PlaceableGlyphType =
  | Exclude<CanvasIconGlyph, SuffixedGlyph>
  | `${SuffixedGlyph}${typeof GLYPH_SUFFIX}`;

/** One entry of the model-facing `type` vocabulary. */
export type PlaceableTypeName = PlaceableShapeType | PlaceableGlyphType;

/** A folded name that only ever travels outbound (a shape a glyph outranked). */
export type ReadOnlyTypeName = `${YieldedShape}${typeof SHAPE_SUFFIX}`;

/** Every folded name the mapping understands, placeable or read-only. */
export type FoldedTypeName = PlaceableTypeName | ReadOnlyTypeName;

/** The document fields a folded name lowers to. */
export interface DocumentTypeFields {
  readonly type: InteractiveCanvasObjectType;
  readonly icon?: CanvasIconGlyph;
}

const COLLISION_BY_NAME = new Map<string, CollisionDecision>(
  GLYPH_COLLISIONS.map((entry) => [entry.glyph, entry.decision]),
);

/** The folded name a glyph wears — suffixed only where the shape kept the id. */
function foldedGlyphName(glyph: CanvasIconGlyph): FoldedTypeName {
  return (
    COLLISION_BY_NAME.get(glyph) === "shape-wins" ? `${glyph}${GLYPH_SUFFIX}` : glyph
  ) as FoldedTypeName;
}

/** The folded name a shape type wears — suffixed only where a glyph took the id. */
function foldedShapeName(type: InteractiveCanvasObjectType): FoldedTypeName {
  return (
    COLLISION_BY_NAME.get(type) === "glyph-wins" ? `${type}${SHAPE_SUFFIX}` : type
  ) as FoldedTypeName;
}

/** Shape types, in the defaults table's order, minus the carrier and the yielded ids. */
export const PLACEABLE_SHAPE_TYPES: readonly PlaceableShapeType[] = [...SHAPE_OBJECT_TYPES].filter(
  (type): type is PlaceableShapeType =>
    type !== ICON_CARRIER && COLLISION_BY_NAME.get(type) !== "glyph-wins",
);

/** Glyph names the model may place, in glyph-roster order. */
export const PLACEABLE_GLYPH_TYPES: readonly PlaceableGlyphType[] = CANVAS_ICON_GLYPHS.map(
  (glyph) => foldedGlyphName(glyph) as PlaceableGlyphType,
);

/** The model-facing `type` roster: shapes with the glyph roster folded in. */
export const PLACEABLE_TYPES: readonly PlaceableTypeName[] = [
  ...PLACEABLE_SHAPE_TYPES,
  ...PLACEABLE_GLYPH_TYPES,
];

/** Folded names the mapping resolves but the tool surface never offers. */
export const READ_ONLY_TYPE_NAMES: readonly ReadOnlyTypeName[] = GLYPH_COLLISIONS.filter(
  (entry) => entry.decision === "glyph-wins",
).map((entry) => `${entry.glyph}${SHAPE_SUFFIX}` as ReadOnlyTypeName);

// ---------------------------------------------------------------------------
// The bidirectional map
// ---------------------------------------------------------------------------

/** Every shape type the mapping resolves inbound: the placeable ones plus the read-only names. */
const SHAPE_NAME_ENTRIES: ReadonlyArray<readonly [string, DocumentTypeFields]> = [
  ...SHAPE_OBJECT_TYPES,
]
  .filter((type) => type !== ICON_CARRIER)
  .map((type) => [
    foldedShapeName(type as InteractiveCanvasObjectType),
    { type: type as InteractiveCanvasObjectType },
  ] as const);

const TO_DOCUMENT = new Map<string, DocumentTypeFields>([
  ...SHAPE_NAME_ENTRIES,
  ...CANVAS_ICON_GLYPHS.map(
    (glyph) => [foldedGlyphName(glyph), { type: ICON_CARRIER, icon: glyph }] as const,
  ),
]);

const FROM_GLYPH = new Map<string, FoldedTypeName>(
  CANVAS_ICON_GLYPHS.map((glyph) => [glyph, foldedGlyphName(glyph)]),
);

/** Document types whose outbound name is not the type itself. */
const FROM_SHAPE = new Map<string, FoldedTypeName>(
  GLYPH_COLLISIONS.filter((entry) => entry.decision === "glyph-wins").map((entry) => [
    entry.glyph,
    `${entry.glyph}${SHAPE_SUFFIX}` as FoldedTypeName,
  ]),
);

const PLACEABLE_TYPE_SET: ReadonlySet<string> = new Set<string>(PLACEABLE_TYPES);

/** Whether `value` is a name the tool surface accepts. */
export function isPlaceableType(value: unknown): value is PlaceableTypeName {
  return typeof value === "string" && PLACEABLE_TYPE_SET.has(value);
}

/**
 * Lower a folded name onto the document fields it names. Accepts the
 * read-only names too, so an outbound name can always be re-lowered (a
 * `fromDocumentFields` result is always a legal argument here). Throws on a
 * name outside the mapping — the schema is the gate, this is the assertion.
 */
export function toDocumentFields(placeableType: FoldedTypeName): DocumentTypeFields {
  const fields = TO_DOCUMENT.get(placeableType);
  if (fields === undefined) {
    throw new Error(`Unknown placeable type: ${placeableType}`);
  }
  return fields;
}

/**
 * Fold document fields back into one name. Total by construction:
 *
 * - `{ type: "icon", icon }` is the glyph's folded name;
 * - a shape type is its own name, unless a glyph took that name — then it is
 *   the read-only `<type>-shape` (see the collision table);
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
    return FROM_SHAPE.get(fields.type) ?? fields.type;
  }
  const folded = fields.icon === undefined ? undefined : FROM_GLYPH.get(fields.icon);
  return folded ?? ICON_CARRIER;
}

/** The glyph a folded name draws, or `undefined` for a plain shape type. */
export function glyphForPlaceableType(placeableType: FoldedTypeName): CanvasIconGlyph | undefined {
  return toDocumentFields(placeableType).icon;
}

// ---------------------------------------------------------------------------
// Import-time audit — the collision table must match the rosters it describes
// ---------------------------------------------------------------------------

const auditedCollisions = CANVAS_ICON_GLYPHS.filter((glyph) => SHAPE_OBJECT_TYPES.has(glyph));
const recordedCollisions = GLYPH_COLLISIONS.map((entry) => entry.glyph);
if ([...auditedCollisions].sort().join(",") !== [...recordedCollisions].sort().join(",")) {
  throw new Error(
    "Glyph/shape collision table is stale: the rosters collide on " +
      `[${auditedCollisions.join(", ")}] but placeable-types.ts records ` +
      `[${recordedCollisions.join(", ")}]. Audit the new collision and record which ` +
      "roster keeps the bare name.",
  );
}

if (PLACEABLE_TYPE_SET.size !== PLACEABLE_TYPES.length) {
  throw new Error("The folded type roster contains duplicates.");
}

// A suffixed name that some other roster member already answers to would let
// one string mean two drawings, which is the whole thing this module prevents.
if (TO_DOCUMENT.size !== SHAPE_NAME_ENTRIES.length + CANVAS_ICON_GLYPHS.length) {
  throw new Error(
    "A folded name resolves to two different document types — a suffixed "
      + "collision name shadows a real roster id. Rename the suffix or the type.",
  );
}

// ---------------------------------------------------------------------------
// Tool schema
// ---------------------------------------------------------------------------

/**
 * The `type` enum every place/swap gesture declares. Lives here rather than in
 * schemas.ts so the roster and the enum that publishes it cannot drift apart.
 * Read-only names are absent by construction: a model may only ask for what it
 * can place.
 */
export const PlaceableType = StringEnum([...PLACEABLE_TYPES], {
  description: "The shape or icon to draw. Icons are types: pick the glyph name.",
});
