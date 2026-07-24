"use client";

import { Type, type TObject } from "@sinclair/typebox";
import type { CanvasAgentPatchOperation } from "./state/actions";

const CanvasObjectSchema = Type.Object(
  {
    id: Type.String(),
    type: Type.String(),
    geometry: Type.Object({
      x: Type.Number(),
      y: Type.Number(),
      width: Type.Number(),
      height: Type.Number(),
    }),
  },
  { additionalProperties: true },
);

const CanvasConnectionSchema = Type.Object(
  {
    id: Type.String(),
    from: Type.Object({ objectId: Type.String() }, { additionalProperties: true }),
    to: Type.Object({ objectId: Type.String() }, { additionalProperties: true }),
  },
  { additionalProperties: true },
);

export const AddObjectParamsSchema = Type.Object({
  type: Type.Literal("addObject"),
  object: CanvasObjectSchema,
});

export const UpdateObjectParamsSchema = Type.Object({
  type: Type.Literal("updateObject"),
  objectId: Type.String(),
  patch: Type.Object({}, { additionalProperties: true }),
});

export const RemoveObjectParamsSchema = Type.Object({
  type: Type.Literal("removeObject"),
  objectId: Type.String(),
});

export const AddConnectionParamsSchema = Type.Object({
  type: Type.Literal("addConnection"),
  connection: CanvasConnectionSchema,
});

export const UpdateConnectionParamsSchema = Type.Object({
  type: Type.Literal("updateConnection"),
  connectionId: Type.String(),
  patch: Type.Object({}, { additionalProperties: true }),
});

export const RemoveConnectionParamsSchema = Type.Object({
  type: Type.Literal("removeConnection"),
  connectionId: Type.String(),
});

export type CanvasAgentPatchOperationDescriptor = {
  type: CanvasAgentPatchOperation["type"];
  description: string;
  params: TObject;
};

export const CANVAS_AGENT_PATCH_OPERATIONS = [
  {
    type: "addObject",
    description: "Add a canvas object with an explicit ID, type, geometry, and optional styling.",
    params: AddObjectParamsSchema,
  },
  {
    type: "updateObject",
    description: "Update an existing canvas object by ID.",
    params: UpdateObjectParamsSchema,
  },
  {
    type: "removeObject",
    description: "Remove an object by ID, including its dependent connections.",
    params: RemoveObjectParamsSchema,
  },
  {
    type: "addConnection",
    description: "Add a connection between two existing canvas objects.",
    params: AddConnectionParamsSchema,
  },
  {
    type: "updateConnection",
    description: "Update an existing connection by ID.",
    params: UpdateConnectionParamsSchema,
  },
  {
    type: "removeConnection",
    description: "Remove an existing connection by ID.",
    params: RemoveConnectionParamsSchema,
  },
] as const satisfies readonly CanvasAgentPatchOperationDescriptor[];
