import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import type { CanvasStyle } from "@codecaine-ai/canvas/style";
import { withRootPageFrame } from "@/shared/new-document";

/** Short stable key (djb2 of the JSON) naming one resolved style. */
export function styleCacheKey(style: CanvasStyle): string {
  const text = JSON.stringify(style);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function clone(document: InteractiveCanvasDocument): InteractiveCanvasDocument {
  return JSON.parse(JSON.stringify(document)) as InteractiveCanvasDocument;
}

export function createStarterCanvasDocument(input: {
  id: string;
  title: string;
}): InteractiveCanvasDocument {
  // Every new board starts as one empty base section — the backdrop all
  // content lives on. Rename and resize it like any section.
  return withRootPageFrame({
    schemaVersion: 1,
    id: input.id,
    title: input.title,
    mode: "diagram",
    size: { width: 960, height: 560 },
    viewport: { x: 0, y: 0, zoom: 1 },
    objects: [],
    connections: [],
    annotations: [],
  });
}
