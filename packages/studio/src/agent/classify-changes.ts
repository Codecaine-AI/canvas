import type {
  CanvasGeometry,
  InteractiveCanvasDocument,
} from "@codecaine-ai/canvas";
import type { AgentPatchOperation } from "@codecaine-ai/canvas-agent/protocol";

export interface MovedChange {
  id: string;
  from: CanvasGeometry;
  to: CanvasGeometry;
  resized: boolean;
}

export interface ObjectRectChange {
  id: string;
  rect: CanvasGeometry;
}

export interface ClassifiedChanges {
  moved: MovedChange[];
  created: ObjectRectChange[];
  removed: ObjectRectChange[];
  removedConnections: string[];
  displaced: MovedChange[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rectFrom(value: unknown): CanvasGeometry | null {
  if (!isRecord(value)) return null;

  const { x, y, width, height } = value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }

  return { x, y, width, height };
}

function rectsEqual(left: CanvasGeometry, right: CanvasGeometry): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function classifyChanges(
  baselineDocument: InteractiveCanvasDocument,
  operations: readonly AgentPatchOperation[],
): ClassifiedChanges {
  const baselineById = new Map(
    baselineDocument.objects.map((object) => [object.id, object]),
  );
  const moved: MovedChange[] = [];
  const created: ObjectRectChange[] = [];
  const removed: ObjectRectChange[] = [];
  const removedConnections: string[] = [];

  for (const operation of operations) {
    switch (operation.type) {
      case "updateObject": {
        const baselineObject = baselineById.get(operation.objectId);
        const to = rectFrom(operation.patch.geometry);
        if (!baselineObject || !to || rectsEqual(baselineObject.geometry, to)) break;

        const from = { ...baselineObject.geometry };
        moved.push({
          id: operation.objectId,
          from,
          to,
          resized: from.width !== to.width || from.height !== to.height,
        });
        break;
      }
      case "addObject": {
        const id = operation.object.id;
        const rect = rectFrom(operation.object.geometry);
        if (typeof id === "string" && rect) created.push({ id, rect });
        break;
      }
      case "removeObject": {
        const baselineObject = baselineById.get(operation.objectId);
        if (baselineObject) {
          removed.push({ id: operation.objectId, rect: { ...baselineObject.geometry } });
        }
        break;
      }
      case "removeConnection":
        removedConnections.push(operation.connectionId);
        break;
      case "addConnection":
      case "addAnnotation":
      case "fitSectionToChildren":
        break;
    }
  }

  return {
    moved,
    created,
    removed,
    removedConnections,
    // Reserved until the harness emits the made-room set.
    displaced: [],
  };
}
