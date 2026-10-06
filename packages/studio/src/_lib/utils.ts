import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import type { AgentSessionAnnotation } from "@codecaine-ai/canvas-agent/protocol";
import type { CanvasStyle } from "@codecaine-ai/canvas/style";
import type { PendingNote } from "@/shared/agent";
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

type Rect = { x: number; y: number; width: number; height: number };

function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map(({ x }) => x));
  const top = Math.min(...rects.map(({ y }) => y));
  const right = Math.max(...rects.map(({ x, width }) => x + width));
  const bottom = Math.max(...rects.map(({ y, height }) => y + height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function noteRect(note: Pick<PendingNote, "target">, document: InteractiveCanvasDocument): Rect | null {
  const target = note.target;
  if (target.kind === "region") return target.region;
  if (target.kind === "object") {
    const objectId = target.objectId;
    return document.objects.find(({ id }) => id === objectId)?.geometry ?? null;
  }

  const connectionId = target.connectionId;
  const connection = document.connections.find(({ id }) => id === connectionId);
  if (!connection) return null;
  return unionRects(
    [connection.from.objectId, connection.to.objectId]
      .map((objectId) => document.objects.find(({ id }) => id === objectId)?.geometry)
      .filter((geometry) => geometry !== undefined),
  );
}

export function sessionAnnotations(
  notes: readonly PendingNote[],
  document: InteractiveCanvasDocument,
): AgentSessionAnnotation[] {
  return notes.flatMap((note) => {
    const target: AgentSessionAnnotation["target"] | null =
      note.target.kind === "connection"
        ? (() => {
            const region = noteRect(note, document);
            return region ? { kind: "region", region } : null;
          })()
        : note.target;
    if (!target) return [];
    return [{
      id: note.id,
      intent: "agent-request",
      body: note.body,
      target,
      status: note.status,
      createdBy: note.createdBy,
      replies: note.replies.map((reply) => ({
        id: reply.id,
        author: reply.author,
        body: reply.body,
        ...(reply.createdAt === undefined ? {} : { createdAt: reply.createdAt }),
      })),
    }];
  });
}
