import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas/schema";

/** Hand-built synthetic documents for the scope/diff/lint unit cases. */

export function box(
  id: string,
  x: number,
  y: number,
  width = 160,
  height = 96,
  type: InteractiveCanvasObjectType = "rectangle",
): InteractiveCanvasObject {
  return { id, type, text: id, parentId: null, geometry: { x, y, width, height } };
}

export function connect(
  id: string,
  from: string,
  to: string,
): InteractiveCanvasConnection {
  return { id, from: { objectId: from }, to: { objectId: to } };
}

export function makeDocument(
  objects: InteractiveCanvasObject[],
  connections: InteractiveCanvasConnection[] = [],
): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "synthetic",
    title: "Synthetic",
    mode: "diagram",
    objects,
    connections,
  };
}
