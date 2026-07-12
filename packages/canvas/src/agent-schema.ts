"use client";

import { Type, type Static, type TObject } from "@sinclair/typebox";

import type { CanvasAgentPatchOperation } from "./actions";

const StableIdSchema = Type.String({
  pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$",
});

const CanvasObjectTypeSchema = Type.Union([
  Type.Literal("container"),
  Type.Literal("process"),
  Type.Literal("decision"),
  Type.Literal("text"),
  Type.Literal("sticky"),
  Type.Literal("source-node"),
  Type.Literal("annotation-marker"),
  Type.Literal("document"),
  Type.Literal("person"),
  Type.Literal("database"),
  Type.Literal("chat"),
  Type.Literal("section"),
  Type.Literal("pill"),
  Type.Literal("arrow-shape"),
  Type.Literal("predefined-process"),
  Type.Literal("code-block"),
  Type.Literal("chip-icon"),
]);

const CanvasToneSchema = Type.Union([
  Type.Literal("neutral"),
  Type.Literal("input"),
  Type.Literal("process"),
  Type.Literal("decision"),
  Type.Literal("memory"),
  Type.Literal("agent"),
  Type.Literal("warning"),
  Type.Literal("annotation"),
]);

const CanvasObjectShapeSchema = Type.Union([
  Type.Literal("rounded-rect"),
  Type.Literal("diamond"),
  Type.Literal("pill"),
  Type.Literal("note"),
  Type.Literal("marker"),
  Type.Literal("document"),
  Type.Literal("person"),
  Type.Literal("database"),
  Type.Literal("chat"),
  Type.Literal("section"),
  Type.Literal("arrow-shape"),
  Type.Literal("predefined-process"),
  Type.Literal("code-block"),
  Type.Literal("chip-icon"),
]);

const CanvasPaletteTokenSchema = Type.Union([
  Type.Literal("process"),
  Type.Literal("input"),
  Type.Literal("hot"),
  Type.Literal("memory"),
  Type.Literal("note"),
]);

const CanvasSectionTintSchema = Type.Union([
  Type.Literal("green"),
  Type.Literal("purple"),
  Type.Literal("orange"),
  Type.Literal("yellow"),
  Type.Literal("gray"),
  Type.Literal("white"),
  Type.Literal("pink"),
  Type.Literal("red"),
  Type.Literal("blue"),
  Type.Literal("teal"),
]);

const CanvasArrowShapeDirectionSchema = Type.Union([
  Type.Literal("left"),
  Type.Literal("right"),
]);

const CanvasConnectionStyleSchema = Type.Union([
  Type.Literal("solid"),
  Type.Literal("dotted"),
  Type.Literal("elbow"),
  Type.Literal("smooth"),
]);

const CanvasArrowDirectionSchema = Type.Union([
  Type.Literal("none"),
  Type.Literal("forward"),
  Type.Literal("back"),
  Type.Literal("both"),
]);

const CanvasAnnotationIntentSchema = Type.Union([
  Type.Literal("note"),
  Type.Literal("agent-request"),
]);

const CanvasAnnotationStatusSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("applied"),
  Type.Literal("resolved"),
]);

/*
 * These objects intentionally stay open. validateInteractiveCanvasDocument
 * reads the known fields and ignores unknown keys instead of rejecting them.
 * The schema preserves that tolerance by omitting additionalProperties: false.
 */
export const CanvasGeometrySchema = Type.Object({
  x: Type.Number(),
  y: Type.Number(),
  width: Type.Number({ exclusiveMinimum: 0 }),
  height: Type.Number({ exclusiveMinimum: 0 }),
});

/*
 * The hand validator tolerates any string for tone/shape, but the exported TS
 * contract deliberately pins their literal vocabulary. Keep these schemas
 * narrow so agents discover and use that supported vocabulary.
 */
export const CanvasObjectStyleSchema = Type.Object({
  tone: Type.Optional(CanvasToneSchema),
  shape: Type.Optional(CanvasObjectShapeSchema),
  paletteToken: Type.Optional(CanvasPaletteTokenSchema),
  fill: Type.Optional(Type.String()),
  stroke: Type.Optional(Type.String()),
  strokeWidth: Type.Optional(Type.Number()),
});

const CanvasObjectLayoutSchema = Type.Object({
  mode: Type.Union([
    Type.Literal("free"),
    Type.Literal("row"),
    Type.Literal("column"),
    Type.Literal("stack"),
  ]),
  padding: Type.Optional(Type.Number()),
  gap: Type.Optional(Type.Number()),
});

const CanvasObjectSourceSchema = Type.Object({
  path: Type.Optional(Type.String()),
  symbol: Type.Optional(Type.String()),
  section: Type.Optional(Type.String()),
});

/*
 * The hand validator normalizes or drops several invalid optional values. Its
 * object validation is also state-dependent: type === "section" hard-requires
 * a nonblank title and known tint. That condition cannot be represented by a
 * single per-operation object schema while updateObject may preserve existing
 * state, so the operation descriptions advertise it explicitly.
 */
export const CanvasObjectSchema = Type.Object({
  id: StableIdSchema,
  type: CanvasObjectTypeSchema,
  label: Type.String({ pattern: "\\S" }),
  body: Type.Optional(Type.String()),
  parentId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  geometry: CanvasGeometrySchema,
  style: Type.Optional(CanvasObjectStyleSchema),
  layout: Type.Optional(CanvasObjectLayoutSchema),
  source: Type.Optional(CanvasObjectSourceSchema),
  title: Type.Optional(Type.String()),
  tint: Type.Optional(CanvasSectionTintSchema),
  locked: Type.Optional(Type.Boolean()),
  direction: Type.Optional(CanvasArrowShapeDirectionSchema),
  language: Type.Optional(Type.String()),
  author: Type.Optional(Type.String()),
});

const CanvasEndpointAnchorSchema = Type.Union([
  Type.Literal("top"),
  Type.Literal("right"),
  Type.Literal("bottom"),
  Type.Literal("left"),
  Type.Literal("center"),
]);

const CanvasUnitPositionSchema = Type.Tuple([
  Type.Number({ minimum: 0, maximum: 1 }),
  Type.Number({ minimum: 0, maximum: 1 }),
]);

export const CanvasConnectionEndpointSchema = Type.Object({
  objectId: StableIdSchema,
  anchor: Type.Optional(CanvasEndpointAnchorSchema),
  position: Type.Optional(CanvasUnitPositionSchema),
});

const CanvasWaypointSchema = Type.Tuple([Type.Number(), Type.Number()]);

/* Missing style/arrow values are accepted and defaulted by the hand validator;
 * when present, their schemas retain the exported contract's literal vocabulary. */
export const CanvasConnectionSchema = Type.Object({
  id: StableIdSchema,
  from: CanvasConnectionEndpointSchema,
  to: CanvasConnectionEndpointSchema,
  label: Type.Optional(Type.String()),
  style: Type.Optional(CanvasConnectionStyleSchema),
  arrow: Type.Optional(CanvasArrowDirectionSchema),
  role: Type.Optional(Type.String()),
  color: Type.Optional(Type.String()),
  waypoints: Type.Optional(Type.Array(CanvasWaypointSchema)),
});

export const CanvasAnnotationTargetSchema = Type.Union([
  Type.Object({
    kind: Type.Literal("object"),
    objectId: Type.String(),
  }),
  Type.Object({
    kind: Type.Literal("connection"),
    connectionId: Type.String(),
  }),
  Type.Object({
    kind: Type.Literal("region"),
    region: CanvasGeometrySchema,
  }),
]);

/* Missing intent/status/createdBy values are accepted and defaulted by the hand
 * validator; when present, they retain the exported contract's vocabulary. */
export const CanvasAnnotationSchema = Type.Object({
  id: StableIdSchema,
  target: CanvasAnnotationTargetSchema,
  intent: Type.Optional(CanvasAnnotationIntentSchema),
  body: Type.String(),
  status: Type.Optional(CanvasAnnotationStatusSchema),
  createdBy: Type.Optional(
    Type.Union([
      Type.Literal("human"),
      Type.Literal("agent"),
      Type.Literal("system"),
    ]),
  ),
  createdAt: Type.Optional(Type.String()),
});

// Each params schema describes the complete wire envelope, including its type.
export const AddObjectParamsSchema = Type.Object({
  type: Type.Literal("addObject"),
  object: CanvasObjectSchema,
});

export const CanvasObjectUpdatePatchSchema = Type.Partial(
  Type.Omit(CanvasObjectSchema, ["id"]),
);

export const UpdateObjectParamsSchema = Type.Object({
  type: Type.Literal("updateObject"),
  objectId: Type.String(),
  patch: CanvasObjectUpdatePatchSchema,
});

export const AddConnectionParamsSchema = Type.Object({
  type: Type.Literal("addConnection"),
  connection: CanvasConnectionSchema,
});

export const AddAnnotationParamsSchema = Type.Object({
  type: Type.Literal("addAnnotation"),
  annotation: CanvasAnnotationSchema,
});

export const FitContainerToChildrenParamsSchema = Type.Object({
  type: Type.Literal("fitContainerToChildren"),
  containerId: Type.String(),
  padding: Type.Optional(Type.Number()),
});

export type CanvasAgentPatchOperationDescriptor = {
  type: CanvasAgentPatchOperation["type"];
  description: string;
  params: TObject;
};

export const CANVAS_AGENT_PATCH_OPERATIONS = [
  {
    type: "addObject",
    description:
      "Add a fully specified canvas object at its provided geometry; a section requires a nonblank title and known tint.",
    params: AddObjectParamsSchema,
  },
  {
    type: "updateObject",
    description:
      "Update an existing canvas object by ID, shallow-merging fields and deep-merging style fields; a resulting section requires a nonblank title and known tint.",
    params: UpdateObjectParamsSchema,
  },
  {
    type: "addConnection",
    description:
      "Add a canvas connection with explicit endpoint object IDs and optional routing metadata.",
    params: AddConnectionParamsSchema,
  },
  {
    type: "addAnnotation",
    description: "Add an annotation targeting a canvas object, connection, or region.",
    params: AddAnnotationParamsSchema,
  },
  {
    type: "fitContainerToChildren",
    description: "Resize a container to enclose its current child objects with optional padding.",
    params: FitContainerToChildrenParamsSchema,
  },
] as const satisfies readonly CanvasAgentPatchOperationDescriptor[];

type MutuallyAssignable<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;
type Assignable<Left, Right> = [Left] extends [Right] ? true : false;
type Assert<Condition extends true> = Condition;

type _OperationDescriptorsAreExhaustive = Assert<
  MutuallyAssignable<
    (typeof CANVAS_AGENT_PATCH_OPERATIONS)[number]["type"],
    CanvasAgentPatchOperation["type"]
  >
>;

type _AddObjectSchemaMatchesContract = Assert<
  MutuallyAssignable<
    Static<typeof AddObjectParamsSchema>,
    Extract<CanvasAgentPatchOperation, { type: "addObject" }>
  >
>;
type _UpdateObjectSchemaMatchesContract = Assert<
  MutuallyAssignable<
    Static<typeof UpdateObjectParamsSchema>,
    Extract<CanvasAgentPatchOperation, { type: "updateObject" }>
  >
>;
type _AddConnectionSchemaMatchesContract = Assert<
  MutuallyAssignable<
    Static<typeof AddConnectionParamsSchema>,
    Extract<CanvasAgentPatchOperation, { type: "addConnection" }>
  >
>;
/*
 * The annotation wire schema is deliberately looser than the TS contract so
 * agents may omit fields that the hand validator defaults. Guard the remaining
 * direction: every TS-typed operation must still be accepted by the schema.
 */
type _AddAnnotationContractIsAcceptedBySchema = Assert<
  Assignable<
    Extract<CanvasAgentPatchOperation, { type: "addAnnotation" }>,
    Static<typeof AddAnnotationParamsSchema>
  >
>;
type _FitContainerToChildrenSchemaMatchesContract = Assert<
  MutuallyAssignable<
    Static<typeof FitContainerToChildrenParamsSchema>,
    Extract<CanvasAgentPatchOperation, { type: "fitContainerToChildren" }>
  >
>;
