import {
  objectTypeDefaults,
  type CanvasAnnotationTarget,
  type CanvasSelection,
  type InteractiveCanvasDocument,
} from "@codecaine-ai/canvas";

export interface PendingNote {
  id: string;
  body: string;
  target: CanvasAnnotationTarget;
  targetLabel: string;
}

export function targetLabel(
  document: InteractiveCanvasDocument,
  target: CanvasAnnotationTarget,
): string {
  if (target.kind === "region") return "Region";

  if (target.kind === "connection") {
    const connection = document.connections.find(({ id }) => id === target.connectionId);
    return connection?.label?.trim() || "Connection";
  }

  const object = document.objects.find(({ id }) => id === target.objectId);
  if (!object) return "Object";

  const text = object.text.trim();
  if (object.type === "section") {
    return text ? `Section "${text}"` : objectTypeDefaults(object.type).label;
  }
  return text || objectTypeDefaults(object.type).label;
}

export function targetLabelForSelection(
  document: InteractiveCanvasDocument,
  selection: CanvasSelection,
): string | null {
  if (selection.kind !== "objects") return null;

  const objectId = selection.objectIds[0];
  if (!objectId || !document.objects.some(({ id }) => id === objectId)) return null;

  return targetLabel(document, { kind: "object", objectId });
}

export function pendingNotes(document: InteractiveCanvasDocument): PendingNote[] {
  return (document.annotations ?? [])
    .filter(({ intent, status }) => intent === "agent-request" && status === "open")
    .map(({ id, body, target }) => ({
      id,
      body,
      target,
      targetLabel: targetLabel(document, target),
    }));
}
