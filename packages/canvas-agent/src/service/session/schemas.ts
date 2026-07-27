/**
 * The JSON Schema contract for every model-facing operation parameter.
 *
 * Each operation tool declares its fields from the payloads and patches below,
 * so the model reads shape, enums, and id format off the tool surface itself
 * rather than out of prose. What a schema can state — presence, type, roster
 * membership, geometry completeness — is stated here exactly once; everything
 * state-dependent belongs to the operation's validator.
 *
 * Two properties of the wire shape this file. Enums use `StringEnum` so they
 * serialize as a single `enum` rather than a union of consts, and every
 * definition is inlined: providers are free to rebuild a tool's schema keeping
 * only `properties` and `required`, which drops anything parked at the root,
 * so there are no refs and no shared `$defs`.
 *
 * Each payload and patch is exported twice under one name — the TypeBox schema
 * for `fields`, and the `Static` type for the validators and mutators that
 * consume the parsed arguments.
 */
import { StringEnum, Type } from "@mariozechner/pi-ai";
import type { Static } from "@mariozechner/pi-ai";

import { CANVAS_COLORS, CANVAS_ICON_GLYPHS } from "@codecaine-ai/canvas/schema";

import { SHAPE_OBJECT_TYPES } from "./op-surface";

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

/** Connector line style. */
export const Style = StringEnum(["solid", "dashed"]);

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
    style: Type.Optional(Style),
    arrow: Type.Optional(Arrow),
    color: Type.Optional(Color),
    waypoints: Type.Optional(Type.Array(Point)),
  },
  Seal,
);
export type ConnectionPayload = Static<typeof ConnectionPayload>;

export const ConnectionPatch = Type.Object(
  {
    from: Type.Optional(Endpoint),
    to: Type.Optional(Endpoint),
    label: Type.Optional(Type.String()),
    style: Type.Optional(Style),
    arrow: Type.Optional(Arrow),
    color: Type.Optional(Color),
    waypoints: Type.Optional(Type.Array(Point)),
  },
  Patch,
);
export type ConnectionPatch = Static<typeof ConnectionPatch>;
