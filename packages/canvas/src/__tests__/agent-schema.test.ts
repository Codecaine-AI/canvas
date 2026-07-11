import { describe, expect, it } from "bun:test";
import { TypeGuard, type TObject } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import type { CanvasAgentPatchOperation } from "../actions";
import { CANVAS_AGENT_PATCH_OPERATIONS } from "../agent-schema";

const ADD_OBJECT: Extract<CanvasAgentPatchOperation, { type: "addObject" }> = {
  type: "addObject",
  object: {
    id: "agent-draft",
    type: "process",
    label: "Draft response",
    body: "Turn the interview notes into a concise response.",
    parentId: "interview-flow",
    geometry: { x: 440, y: 176, width: 192, height: 88 },
    style: {
      tone: "process",
      shape: "rounded-rect",
      paletteToken: "process",
      fill: "#D8E8FF",
      stroke: "#3B82F6",
      strokeWidth: 4,
    },
    layout: { mode: "row", padding: 16, gap: 8 },
    source: { path: "docs/agent.md", symbol: "draftResponse", section: "Workflow" },
  },
};

const UPDATE_OBJECT: Extract<CanvasAgentPatchOperation, { type: "updateObject" }> = {
  type: "updateObject",
  objectId: "agent-draft",
  patch: {
    label: "Reviewed response",
    geometry: { x: 448, y: 184, width: 208, height: 96 },
    style: { tone: "agent", fill: "#E0E7FF" },
  },
};

const ADD_CONNECTION: Extract<CanvasAgentPatchOperation, { type: "addConnection" }> = {
  type: "addConnection",
  connection: {
    id: "draft-to-spec",
    from: { objectId: "agent-draft", anchor: "right", position: [1, 0.5] },
    to: { objectId: "write-spec", anchor: "left", position: [0, 0.5] },
    label: "reviewed output",
    style: "elbow",
    arrow: "forward",
    role: "handoff",
    color: "#6B7280",
    waypoints: [
      [672, 228],
      [824, 228],
    ],
  },
};

const ADD_ANNOTATION: Extract<CanvasAgentPatchOperation, { type: "addAnnotation" }> = {
  type: "addAnnotation",
  annotation: {
    id: "review-region",
    target: {
      kind: "region",
      region: { x: 420, y: 152, width: 448, height: 144 },
    },
    intent: "agent-request",
    body: "Verify the handoff before publishing.",
    status: "open",
    createdBy: "agent",
    createdAt: "2026-07-10T12:00:00.000Z",
  },
};

const FIT_CONTAINER: Extract<
  CanvasAgentPatchOperation,
  { type: "fitContainerToChildren" }
> = {
  type: "fitContainerToChildren",
  containerId: "interview-flow",
  padding: 32,
};

const VALID_OPERATIONS: readonly CanvasAgentPatchOperation[] = [
  ADD_OBJECT,
  UPDATE_OBJECT,
  ADD_CONNECTION,
  ADD_ANNOTATION,
  FIT_CONTAINER,
];

function schemaFor(type: CanvasAgentPatchOperation["type"]): TObject {
  const descriptor = CANVAS_AGENT_PATCH_OPERATIONS.find((entry) => entry.type === type);
  if (!descriptor) throw new Error(`Missing canvas agent patch descriptor: ${type}`);
  return descriptor.params;
}

function expectInvalid(type: CanvasAgentPatchOperation["type"], values: readonly unknown[]): void {
  for (const value of values) {
    expect(Value.Check(schemaFor(type), value)).toBe(false);
  }
}

describe("canvas agent patch schemas", () => {
  it("accepts a valid addObject envelope and rejects malformed variants", () => {
    expect(Value.Check(schemaFor("addObject"), ADD_OBJECT)).toBe(true);

    expectInvalid("addObject", [
      { type: "addWidget", object: ADD_OBJECT.object },
      {
        type: "addObject",
        object: {
          id: "missing-label",
          type: "process",
          geometry: { x: 0, y: 0, width: 160, height: 96 },
        },
      },
      {
        type: "addObject",
        object: {
          id: "bad-geometry",
          type: "process",
          label: "Bad geometry",
          geometry: { x: 0, y: 0, width: 0, height: 96 },
        },
      },
    ]);
  });

  it("accepts a valid updateObject envelope and rejects malformed variants", () => {
    expect(Value.Check(schemaFor("updateObject"), UPDATE_OBJECT)).toBe(true);

    expectInvalid("updateObject", [
      { type: "updateObject", patch: { label: "Missing target" } },
      { type: "updateObject", objectId: "agent-draft", patch: { type: "hexagon" } },
      {
        type: "updateObject",
        objectId: "agent-draft",
        patch: { geometry: { x: 0, y: 0, width: 160 } },
      },
    ]);
  });

  it("accepts a valid addConnection envelope and rejects malformed variants", () => {
    expect(Value.Check(schemaFor("addConnection"), ADD_CONNECTION)).toBe(true);

    expectInvalid("addConnection", [
      {
        type: "addConnection",
        connection: {
          id: "missing-to",
          from: { objectId: "agent-draft" },
        },
      },
      {
        type: "addConnection",
        connection: {
          id: "bad-anchor",
          from: { objectId: "agent-draft", anchor: "north" },
          to: { objectId: "write-spec" },
        },
      },
      {
        type: "addConnection",
        connection: {
          id: "bad-position",
          from: { objectId: "agent-draft", position: [1.1, 0.5] },
          to: { objectId: "write-spec" },
        },
      },
    ]);
  });

  it("accepts a valid addAnnotation envelope and rejects malformed variants", () => {
    expect(Value.Check(schemaFor("addAnnotation"), ADD_ANNOTATION)).toBe(true);

    expectInvalid("addAnnotation", [
      {
        type: "addAnnotation",
        annotation: {
          id: "missing-body",
          target: { kind: "object", objectId: "agent-draft" },
          intent: "note",
          status: "open",
          createdBy: "human",
        },
      },
      {
        type: "addAnnotation",
        annotation: {
          id: "bad-target",
          target: { kind: "object" },
          intent: "note",
          body: "Missing target ID",
          status: "open",
          createdBy: "human",
        },
      },
      {
        type: "addAnnotation",
        annotation: {
          id: "bad-status",
          target: { kind: "connection", connectionId: "draft-to-spec" },
          intent: "note",
          body: "Unknown status",
          status: "pending",
          createdBy: "human",
        },
      },
    ]);
  });

  it("accepts a valid fitContainerToChildren envelope and rejects malformed variants", () => {
    expect(Value.Check(schemaFor("fitContainerToChildren"), FIT_CONTAINER)).toBe(true);

    expectInvalid("fitContainerToChildren", [
      { type: "fitContainerToChildren", padding: 32 },
      { type: "fitContainerToChildren", containerId: "interview-flow", padding: "32" },
      { type: "fitChildren", containerId: "interview-flow", padding: 32 },
    ]);
  });

  it("keeps envelopes and nested payload records open like the hand validators", () => {
    expect(
      Value.Check(schemaFor("addObject"), {
        ...ADD_OBJECT,
        futureEnvelopeField: true,
        object: {
          ...ADD_OBJECT.object,
          futureObjectField: true,
          geometry: { ...ADD_OBJECT.object.geometry, futureGeometryField: true },
          style: { ...ADD_OBJECT.object.style, futureStyleField: true },
          layout: { ...ADD_OBJECT.object.layout, futureLayoutField: true },
          source: { ...ADD_OBJECT.object.source, futureSourceField: true },
        },
      }),
    ).toBe(true);

    expect(
      Value.Check(schemaFor("updateObject"), {
        ...UPDATE_OBJECT,
        patch: { ...UPDATE_OBJECT.patch, id: "ignored-replacement-id", futurePatchField: true },
      }),
    ).toBe(true);

    expect(
      Value.Check(schemaFor("addConnection"), {
        ...ADD_CONNECTION,
        connection: {
          ...ADD_CONNECTION.connection,
          futureConnectionField: true,
          from: { ...ADD_CONNECTION.connection.from, futureEndpointField: true },
        },
      }),
    ).toBe(true);

    expect(
      Value.Check(schemaFor("addAnnotation"), {
        ...ADD_ANNOTATION,
        annotation: {
          ...ADD_ANNOTATION.annotation,
          futureAnnotationField: true,
          target: { ...ADD_ANNOTATION.annotation.target, futureTargetField: true },
        },
      }),
    ).toBe(true);
  });
});

describe("CANVAS_AGENT_PATCH_OPERATIONS", () => {
  it("enumerates five ordered, bare operation names with TObject params", () => {
    expect(CANVAS_AGENT_PATCH_OPERATIONS).toHaveLength(5);
    expect(CANVAS_AGENT_PATCH_OPERATIONS.map((entry) => entry.type)).toEqual([
      "addObject",
      "updateObject",
      "addConnection",
      "addAnnotation",
      "fitContainerToChildren",
    ]);

    for (const entry of CANVAS_AGENT_PATCH_OPERATIONS) {
      expect(entry.description.trim().length).toBeGreaterThan(0);
      expect(TypeGuard.IsObject(entry.params)).toBe(true);
    }
  });

  it("accepts one CanvasAgentPatchOperation-typed value for every variant", () => {
    for (const operation of VALID_OPERATIONS) {
      expect(Value.Check(schemaFor(operation.type), operation)).toBe(true);
    }
  });
});
