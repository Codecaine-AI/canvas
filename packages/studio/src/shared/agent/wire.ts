import type {
  CanvasAgentPatchOperation,
  CanvasAnnotationReply,
  InteractiveCanvasAnnotation,
  InteractiveCanvasConnection,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas";
import type {
  AgentPatchOperation,
  AgentSessionMessageRequest,
  AgentSessionViewport,
} from "@codecaine-ai/canvas-agent/protocol";

import { AgentSessionClientError } from "./session-client";
import type { AgentSessionFailure, BeforeAgentStartSnapshot } from "./types";

export function failureFrom(error: unknown): AgentSessionFailure {
  if (
    error instanceof AgentSessionClientError &&
    error.kind === "harness-unavailable"
  ) {
    return { kind: "harness-unavailable", message: error.message };
  }
  return {
    kind: "request-failed",
    message: error instanceof Error ? error.message : String(error),
  };
}

type CanvasOperation<Type extends CanvasAgentPatchOperation["type"]> = Extract<
  CanvasAgentPatchOperation,
  { type: Type }
>;

/**
 * The protocol intentionally mirrors the canvas patch type without importing
 * it, so its nested payloads arrive as records. Keep the bridge at this wire
 * boundary and exhaustively reconstruct the canvas union.
 * A `null` patch value is a clear in its wire spelling; the reducer reads it as one.
 */
export function toCanvasOperation(
  operation: AgentPatchOperation,
): CanvasAgentPatchOperation {
  switch (operation.type) {
    case "updateTitle":
      return { type: "updateTitle", title: operation.title };
    case "updateDescription":
      return {
        type: "updateDescription",
        description: operation.description,
      };
    case "addObject":
      return {
        type: "addObject",
        object: operation.object as unknown as InteractiveCanvasObject,
      };
    case "updateObject":
      return {
        type: "updateObject",
        objectId: operation.objectId,
        patch: operation.patch as unknown as CanvasOperation<"updateObject">["patch"],
      };
    case "removeObject":
      return { type: "removeObject", objectId: operation.objectId };
    case "addConnection":
      return {
        type: "addConnection",
        connection: operation.connection as unknown as InteractiveCanvasConnection,
      };
    case "updateConnection":
      return {
        type: "updateConnection",
        connectionId: operation.connectionId,
        patch: operation.patch as unknown as CanvasOperation<"updateConnection">["patch"],
      };
    case "removeConnection":
      return {
        type: "removeConnection",
        connectionId: operation.connectionId,
      };
    case "addAnnotation":
      return {
        type: "addAnnotation",
        annotation: operation.annotation as unknown as InteractiveCanvasAnnotation,
      };
    case "appendAnnotationReply":
      return {
        type: "appendAnnotationReply",
        annotationId: operation.annotationId,
        reply: operation.reply as unknown as CanvasAnnotationReply,
      };
    case "setAnnotationStatus":
      return {
        type: "setAnnotationStatus",
        annotationId: operation.annotationId,
        status: operation.status,
      };
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

export function invokeSnapshot(
  value: void | BeforeAgentStartSnapshot,
): BeforeAgentStartSnapshot {
  return value ?? {};
}

export function refineSnapshot(
  value: BeforeAgentStartSnapshot,
): Omit<AgentSessionMessageRequest, "instruction"> {
  const snapshot: Omit<AgentSessionMessageRequest, "instruction"> = {};
  if (value.annotations !== undefined) snapshot.annotations = value.annotations;
  if (value.viewport !== undefined) {
    snapshot.viewport = value.viewport as AgentSessionViewport;
  }
  return snapshot;
}
