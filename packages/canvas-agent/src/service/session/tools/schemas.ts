/**
 * The JSON Schema contract for every model-facing operation parameter.
 *
 * Each operation tool declares its fields from the payloads and patches below,
 * so the model reads shape, enums, and id format off the tool surface itself
 * rather than out of prose. What a schema can state — presence, type, roster
 * membership, geometry completeness — is stated here exactly once; everything
 * state-dependent belongs to the operation's validator.
 *
 * WIRE CONSTRAINTS — these are hard, and every addition to this file keeps
 * them:
 *
 * 1. Enums are `StringEnum` ONLY. They must serialize as a single `enum`, not
 *    as a union of consts (`anyOf: [{const}, …]`), which is what a plain
 *    `Type.Union(Type.Literal(…))` emits.
 * 2. Everything is INLINED. Providers are free to rebuild a tool's schema
 *    keeping only `properties` and `required`, which drops anything parked at
 *    the root — so there are no `$ref`s and no shared `$defs`. Reusing a
 *    constant below (`Point`, `Size`, `Endpoint`, …) copies its shape into the
 *    tool's schema; it never emits a reference.
 * 3. `Seal` / `Patch` conventions hold: a payload rejects unknown keys, and a
 *    patch additionally demands at least one field.
 *
 * Each payload and patch is exported twice under one name — the TypeBox schema
 * for `fields`, and the `Static` type for the validators and mutators that
 * consume the parsed arguments.
 */
import { StringEnum, Type } from "@mariozechner/pi-ai";
import type { Static } from "@mariozechner/pi-ai";

import { CANVAS_COLORS, CANVAS_ICON_GLYPHS } from "@codecaine-ai/canvas/schema";

import { SHAPE_OBJECT_TYPES } from "../perception/op-surface";
import { PlaceableType } from "./placeable-types";

/** Sealed objects reject unknown keys outright, which is what keeps a payload
 * from carrying a `type` an operation already implies. */
const Seal = { additionalProperties: false } as const;

/** Patches are sealed and must carry at least one field, so an update always
 * asks for something. */
const Patch = { additionalProperties: false, minProperties: 1 } as const;

/** Board ids: the document's own id grammar, enforced at the tool boundary
 * rather than several layers below it. */
export const Id = Type.String({
  pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$",
  description: "A board id: letters, digits, and _ . : - after a leading alphanumeric.",
});

/** The closed color roster, read off the canvas package so the tool surface
 * cannot drift from the palette. */
export const Color = StringEnum([...CANVAS_COLORS], {
  description: "A color from the board's roster.",
});

/** Shape types: the object roster minus the kinds that have their own
 * operations. */
export const ShapeType = StringEnum([...SHAPE_OBJECT_TYPES], {
  description: "The shape's type.",
});

/** Glyph ids for `type: "icon"`. */
export const Glyph = StringEnum([...CANVAS_ICON_GLYPHS], {
  description: "The glyph an icon object draws.",
});

/** Facing for the shapes that have one; each type accepts its own subset. */
export const Direction = StringEnum(["left", "right", "up", "down"], {
  description: "Which way the shape points.",
});

/** The side of an object an edge meets. */
export const Anchor = StringEnum(["top", "right", "bottom", "left", "center"], {
  description: "The side an edge meets. Omit it and the router chooses.",
});

/** Connector line style: how the stroke itself is drawn. */
export const LineStyle = StringEnum(["solid", "dashed"], {
  description: "How the connector's line is drawn.",
});

/** Which ends of a connector carry an arrowhead. */
export const Arrow = StringEnum(["none", "forward", "back", "both"]);

/** Geometry always travels whole: a partial box has no meaning, and a patch
 * that carried one would leave the other side of the rectangle undefined. */
export const Geometry = Type.Object(
  {
    x: Type.Number(),
    y: Type.Number(),
    width: Type.Number(),
    height: Type.Number(),
  },
  { ...Seal, description: "The full box. All four numbers travel together." },
);
export type Geometry = Static<typeof Geometry>;

/** A waypoint, as an [x, y] pair. */
export const Point = Type.Tuple([Type.Number(), Type.Number()]);
export type Point = Static<typeof Point>;

/**
 * A box's dimensions with no position — what the gesture surface passes when
 * the position is already named separately (`place_section({ at, size })`) or
 * is not changing at all (`resize`). Both numbers travel together for the same
 * reason `Geometry` does: half a box is not a size.
 */
export const Size = Type.Object(
  {
    width: Type.Number(),
    height: Type.Number(),
  },
  { ...Seal, description: "A box's size. Both numbers travel together." },
);
export type Size = Static<typeof Size>;

/**
 * A world-space rectangle — a region rather than an object's box. `look at:`
 * frames one; region measurements report against one. Structurally identical
 * to `Geometry`, kept separate because they name different things: `Geometry`
 * IS an object's box, a `Rect` is an area of the board.
 */
export const Rect = Type.Object(
  {
    x: Type.Number(),
    y: Type.Number(),
    width: Type.Number(),
    height: Type.Number(),
  },
  { ...Seal, description: "A world-space rectangle: top-left plus size." },
);
export type Rect = Static<typeof Rect>;

/** One end of a connector. The steering fields are optional; omitting both
 * hands the choice to the router. */
export const Endpoint = Type.Object(
  {
    objectId: Id,
    anchor: Type.Optional(Anchor),
    position: Type.Optional(Point),
  },
  Seal,
);
export type Endpoint = Static<typeof Endpoint>;

/**
 * Where an edge's label chip is pinned along its own routed path. Absent —
 * the default — leaves the chip at the route's arc-length midpoint.
 * `along` is a fraction of arc length; `offset` pushes the chip
 * perpendicular, positive = left of travel (from → to). Neither is snapped to
 * the board grid: they are fractions and fine placement, not geometry.
 */
export const LabelPosition = Type.Object(
  {
    along: Type.Number({
      minimum: 0,
      maximum: 1,
      description: "How far along the routed path the label sits: 0 is the start, 1 the end.",
    }),
    offset: Type.Optional(Type.Number({
      description: "Perpendicular nudge in px; positive is left of the from→to direction.",
    })),
  },
  { ...Seal, description: "Where the label chip sits on the edge. Omit it for the midpoint." },
);
export type LabelPosition = Static<typeof LabelPosition>;

export const SectionPayload = Type.Object(
  {
    id: Id,
    text: Type.String(),
    color: Type.Optional(Color),
    geometry: Geometry,
  },
  Seal,
);
export type SectionPayload = Static<typeof SectionPayload>;

export const SectionPatch = Type.Object(
  {
    text: Type.Optional(Type.String()),
    color: Type.Optional(Color),
    geometry: Type.Optional(Geometry),
  },
  Patch,
);
export type SectionPatch = Static<typeof SectionPatch>;

export const StickyPayload = Type.Object(
  {
    id: Id,
    text: Type.String(),
    color: Type.Optional(Color),
    geometry: Geometry,
  },
  Seal,
);
export type StickyPayload = Static<typeof StickyPayload>;

export const StickyPatch = Type.Object(
  {
    text: Type.Optional(Type.String()),
    color: Type.Optional(Color),
    geometry: Type.Optional(Geometry),
  },
  Patch,
);
export type StickyPatch = Static<typeof StickyPatch>;

export const ObjectPayload = Type.Object(
  {
    id: Id,
    type: ShapeType,
    text: Type.Optional(Type.String()),
    color: Type.Optional(Color),
    geometry: Geometry,
    direction: Type.Optional(Direction),
    icon: Type.Optional(Glyph),
  },
  Seal,
);
export type ObjectPayload = Static<typeof ObjectPayload>;

export const ObjectPatch = Type.Object(
  {
    type: Type.Optional(ShapeType),
    text: Type.Optional(Type.String()),
    color: Type.Optional(Color),
    geometry: Type.Optional(Geometry),
    direction: Type.Optional(Direction),
    icon: Type.Optional(Glyph),
  },
  Patch,
);
export type ObjectPatch = Static<typeof ObjectPatch>;

export const ConnectionPayload = Type.Object(
  {
    id: Id,
    from: Endpoint,
    to: Endpoint,
    label: Type.Optional(Type.String()),
    style: Type.Optional(LineStyle),
    arrow: Type.Optional(Arrow),
    color: Type.Optional(Color),
    waypoints: Type.Optional(Type.Array(Point)),
    labelPosition: Type.Optional(LabelPosition),
  },
  Seal,
);
export type ConnectionPayload = Static<typeof ConnectionPayload>;

export const ConnectionPatch = Type.Object(
  {
    from: Type.Optional(Endpoint),
    to: Type.Optional(Endpoint),
    label: Type.Optional(Type.String()),
    style: Type.Optional(LineStyle),
    arrow: Type.Optional(Arrow),
    color: Type.Optional(Color),
    waypoints: Type.Optional(Type.Array(Point)),
    labelPosition: Type.Optional(LabelPosition),
  },
  Patch,
);
export type ConnectionPatch = Static<typeof ConnectionPatch>;

// ---------------------------------------------------------------------------
// Gesture payloads — Place
// ---------------------------------------------------------------------------
//
// The place payloads carry ONLY what the UI's creation gesture carries: the
// pick, the click, and the typing that is part of the same motion. Everything
// else about a new object comes from the creation defaults
// (service/session/tools/creation-defaults.ts), and every
// property beyond the default is its own subsequent gesture — resize, then
// recolor, then relabel. That is why there is no `color` and no `geometry`
// here: they are not omissions, they are the point.
//
// `at` is the TOP-LEFT of the box, in world units, snapped to the agent grid
// (service/session/tools/grid.ts, AGENT_GRID = 20) before it is lowered onto a
// document patch. Section membership is reconciled from geometry afterwards.
//
// The payload/patch shapes above are not a second tool surface: they are the
// internal vocabulary a gesture lowers onto, and nothing above this line is
// offered to the model directly.

/**
 * `place_section` — drawing a frame. Titling it is part of the gesture, so
 * `text` is required; the drawn size is optional because a frame dropped
 * without a drag takes the default section footprint.
 */
export const PlaceSectionParams = Type.Object(
  {
    id: Id,
    text: Type.String({ description: "The frame's title." }),
    at: Point,
    size: Type.Optional(Size),
  },
  { ...Seal, description: "Draw a section frame at `at` (its top-left corner)." },
);
export type PlaceSectionParams = Static<typeof PlaceSectionParams>;

/**
 * `place_sticky` — dropping a note. Typing the note is part of the gesture;
 * size and color are the defaults, and there is no parameter for either.
 */
export const PlaceStickyParams = Type.Object(
  {
    id: Id,
    text: Type.String({ description: "The note's body." }),
    at: Point,
  },
  { ...Seal, description: "Drop a sticky note at `at` (its top-left corner)." },
);
export type PlaceStickyParams = Static<typeof PlaceStickyParams>;

/**
 * `place_shape` — the pick and the click, nothing else. No text, no color, no
 * direction: those are `update_text` / `change_color` / `change_shape`
 * afterward. `type` is the FOLDED vocabulary — shape types with the icon
 * glyphs folded in as types of their own — so placing "decision" and placing
 * "memory" are the same gesture with a different pick (see ./placeable-types).
 */
export const PlaceShapeParams = Type.Object(
  {
    id: Id,
    type: PlaceableType,
    at: Point,
  },
  { ...Seal, description: "Place a shape at `at` (its top-left corner)." },
);
export type PlaceShapeParams = Static<typeof PlaceShapeParams>;

/**
 * `clone` — "make another one of these". Everything about the source travels
 * with the copy (kind, size, color, shape type/direction/icon, border style),
 * which is the whole point: a row of options matches without re-specifying a
 * single number.
 *
 * `at` and `by` are MUTUALLY EXCLUSIVE and both optional — a constraint JSON
 * Schema cannot state without a `oneOf` at the root, which the wire rules above
 * forbid, so the descriptor's validator is the gate and this description is the
 * steering. Neither given puts the copy at the UI's paste offset.
 */
export const CloneParams = Type.Object(
  {
    sourceId: Id,
    id: Id,
    at: Type.Optional(Point),
    by: Type.Optional(Point),
    text: Type.Optional(Type.String({
      description: "Text for the copy. Omit it and the source's text carries over.",
    })),
  },
  {
    ...Seal,
    description:
      "Copy one object. Give `at` (absolute top-left) or `by` (offset from the source), never both; give neither for the paste offset.",
  },
);
export type CloneParams = Static<typeof CloneParams>;

/**
 * `connect` — the separate call after placement, matching the two steps a
 * person performs. Line and arrowheads are here because they are part of
 * drawing the edge; the route is not (`reroute` / `shift_segment` own it) and
 * neither is the label's placement (`move_label`).
 */
export const ConnectParams = Type.Object(
  {
    id: Id,
    from: Endpoint,
    to: Endpoint,
    label: Type.Optional(Type.String({ description: "Text for the edge's label chip." })),
    style: Type.Optional(LineStyle),
    arrow: Type.Optional(Arrow),
    color: Type.Optional(Color),
  },
  { ...Seal, description: "Route an edge from one object to another." },
);
export type ConnectParams = Static<typeof ConnectParams>;

// ---------------------------------------------------------------------------
// Gesture payloads — Sections
// ---------------------------------------------------------------------------

/**
 * A section frame's stroke. Already in the document model as
 * `style.strokeStyle` (packages/canvas/src/state/schema/style.ts), so
 * `change_section_border` is plumbing rather than a schema change. The UI
 * flyout offers only solid/dashed; the model and the handler both accept
 * "none", per docs/30-agent-layout/50-tool-surface/10-gestures §Sections.
 */
export const SectionBorder = StringEnum(["solid", "dashed", "none"], {
  description: "How the frame's border is stroked.",
});

export const ChangeSectionBorderParams = Type.Object(
  {
    id: Id,
    border: SectionBorder,
  },
  { ...Seal, description: "Restroke a section frame's border." },
);
export type ChangeSectionBorderParams = Static<typeof ChangeSectionBorderParams>;

/**
 * The two lock strengths the document model carries. `"background"` pins the
 * frame itself and leaves its contents draggable; `"all"` freezes every
 * descendant too.
 */
export const LockMode = StringEnum(["all", "background"], {
  description: "How much the lock covers: the frame alone, or the frame and everything in it.",
});

export const LockParams = Type.Object(
  {
    id: Id,
    mode: LockMode,
  },
  { ...Seal, description: "Lock a section." },
);
export type LockParams = Static<typeof LockParams>;

export const UnlockParams = Type.Object(
  { id: Id },
  { ...Seal, description: "Release a section's lock." },
);
export type UnlockParams = Static<typeof UnlockParams>;

// ---------------------------------------------------------------------------
// Gesture payloads — Delete
// ---------------------------------------------------------------------------

/**
 * One id, any kind. The gesture is the same motion whatever it lands on; the
 * cascade differs by kind and the descriptor's summary reports which one ran.
 */
export const DeleteParams = Type.Object(
  { id: Id },
  { ...Seal, description: "Remove one object, section, or edge from the board." },
);
export type DeleteParams = Static<typeof DeleteParams>;

// ---------------------------------------------------------------------------
// Gesture payloads — Content & appearance
// ---------------------------------------------------------------------------
//
// `update_text` and `change_color` need no payload type of their own: their
// parameters are `id` plus one scalar, declared inline by the descriptor
// (operations/content.ts). `change_shape` is the one that carries a patch,
// because "swap what this is" has two independent knobs and asking for
// neither is not a gesture.

/**
 * `change_shape`'s patch — what the object becomes. `type` is the FOLDED
 * vocabulary (./placeable-types), so a glyph is picked by its own name and the
 * document's `{type: "icon", icon}` split never reaches the model.
 *
 * `direction` is only carried by the four types that point or skew —
 * arrow-shape / parallelogram / chevron (left|right) and triangle (up|down),
 * per the document validator's per-type subsets. Asking for a direction on any
 * other type is legal input; the operation drops it and says so, rather than
 * spending a turn on a rejection.
 */
export const ShapeSwapPatch = Type.Object(
  {
    type: Type.Optional(PlaceableType),
    direction: Type.Optional(Direction),
  },
  { ...Patch, description: "What the shape becomes. Name at least one of the two." },
);
export type ShapeSwapPatch = Static<typeof ShapeSwapPatch>;

// ---------------------------------------------------------------------------
// Gesture payloads — Edges
// ---------------------------------------------------------------------------
//
// Restyling, repointing, and routing are three different gestures, and the
// schemas are what keep them from bleeding into one another
// (docs/30-agent-layout/50-tool-surface/10-gestures §Edges):
//
//  - `EdgeStylePatch` carries the LINE and the ARROWHEADS and nothing else.
//    An edge's color is `change_color` and an edge's label is `update_text` —
//    one home per concern — so neither has a key here to reach for.
//  - `RepointPatch` carries the two ENDS. It cannot express a route, so a
//    repoint can never smuggle in waypoints.
//  - the route is `reroute` (wholesale) / `shift_segment` (one elbow) /
//    `reset_route` (back to the auto-router), whose parameters are scalars
//    and a point list declared inline by their descriptors.
//  - `LabelAlong` is `move_label`'s one polymorphic field: a fraction, or the
//    word that clears the pin.

/**
 * `style_edge`'s patch — how the wire is DRAWN. Both fields are optional and
 * at least one is required, because "restyle this edge" without saying what to
 * change is not a gesture.
 */
export const EdgeStylePatch = Type.Object(
  {
    style: Type.Optional(LineStyle),
    arrow: Type.Optional(Arrow),
  },
  {
    ...Patch,
    description:
      "How the edge is drawn: its line, its arrowheads. Color is change_color and the label is update_text.",
  },
);
export type EdgeStylePatch = Static<typeof EdgeStylePatch>;

/**
 * `change_connection`'s patch — where the edge LANDS. A patch usually carries
 * one side, so the other is read off the stored edge when the operation checks
 * that the two ends still name different objects.
 */
export const RepointPatch = Type.Object(
  {
    from: Type.Optional(Endpoint),
    to: Type.Optional(Endpoint),
  },
  {
    ...Patch,
    description:
      "Which objects the edge joins, and where on them it meets. Name the end you are moving; the other stays.",
  },
);
export type RepointPatch = Static<typeof RepointPatch>;

/**
 * `move_label`'s `along` — a fraction of the routed path's arc length, or
 * `"auto"` to drop the pin and let the chip return to the midpoint. The union
 * is genuine (a number OR one word), not an enum smuggled in as a union of
 * consts, so it does not fall foul of the wire rules at the top of this file.
 */
export const LabelAlong = Type.Union(
  [
    Type.Number({
      minimum: 0,
      maximum: 1,
      description: "How far along the routed path the chip sits: 0 is the start, 1 the end.",
    }),
    StringEnum(["auto"], {
      description: "Clear the pin and let the chip sit at the routed midpoint.",
    }),
  ],
  { description: "A 0..1 fraction of the routed path, or \"auto\" for the midpoint." },
);
export type LabelAlong = Static<typeof LabelAlong>;
