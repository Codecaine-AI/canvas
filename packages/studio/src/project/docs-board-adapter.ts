/**
 * Two-way adapter between a docs project's canvas sidecar shape and this
 * Studio's editor schema.
 *
 * The docs side stores boards in the OLDER canvas schema: every object has a
 * required `label`, sections carry `title` + `tint` (a "purple" family this
 * schema calls "violet"), and styles may hold raw `fill`/`stroke` hexes. This
 * Studio's editor schema replaced that trio with one required `text` field and
 * one `color` pick from the closed 10-hue roster.
 *
 * Contract: the SAVED wire format stays in the docs-side shape the board was
 * loaded in. Load adapts docs -> studio for the editor; save merges the edited
 * studio document back over the ORIGINAL raw objects (by id) so docs-only
 * fields the editor doesn't model survive the round-trip untouched.
 */
import {
  isCanvasColor,
  validateInteractiveCanvasDocument,
  type CanvasColor,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
} from "@codecaine-ai/canvas";
import { withRootPageFrame } from "../new-document";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Docs-side object types with a direct studio replacement ("container" became
 * "rectangle" in W6; the docs "text" object reads closest to a sticky).
 * Everything else shares names across both schemas.
 */
const DOCS_TO_STUDIO_TYPE: Record<string, string> = {
  container: "rectangle",
  text: "sticky",
};

const STUDIO_TO_DOCS_TYPE: Record<string, string> = {
  rectangle: "container",
};

/** Docs tint family -> studio hue ("purple" is the one renamed id). */
function studioColorFromDocs(value: unknown): CanvasColor | undefined {
  const candidate = value === "purple" ? "violet" : value;
  return isCanvasColor(candidate) ? candidate : undefined;
}

/** Studio hue -> docs tint family (inverse of the rename above). */
function docsTintFromStudio(color: CanvasColor | undefined): string | undefined {
  if (!color) return undefined;
  return color === "violet" ? "purple" : color;
}

/** The color the studio editor was shown for a raw docs object at load time. */
function loadedStudioColor(raw: Record<string, unknown>): CanvasColor | undefined {
  if (isCanvasColor(raw.color)) return raw.color;
  return studioColorFromDocs(raw.tint);
}

export type AdaptToStudioResult =
  | { ok: true; document: InteractiveCanvasDocument }
  | { ok: false; detail: string };

/**
 * Docs sidecar -> studio editor document. Builds studio-shape objects
 * explicitly (label/title -> text, tint -> color, docs-only style hexes
 * dropped) and runs the result through the studio validator so the editor
 * only ever sees a document it fully understands.
 */
export function adaptProjectCanvasToStudio(raw: unknown): AdaptToStudioResult {
  if (!isRecord(raw)) {
    return { ok: false, detail: "Project board payload is not an object." };
  }
  const rawObjects = Array.isArray(raw.objects) ? raw.objects : [];
  const objects = rawObjects.map((entry) => {
    if (!isRecord(entry)) return entry;
    const type =
      typeof entry.type === "string" && DOCS_TO_STUDIO_TYPE[entry.type]
        ? DOCS_TO_STUDIO_TYPE[entry.type]
        : entry.type;
    const text =
      typeof entry.text === "string"
        ? entry.text
        : typeof entry.label === "string"
          ? entry.label
          : typeof entry.title === "string"
            ? entry.title
            : "";
    const style = isRecord(entry.style)
      ? {
          shape: entry.style.shape,
          strokeWidth: entry.style.strokeWidth,
          strokeStyle: entry.style.strokeStyle,
        }
      : undefined;
    return {
      id: entry.id,
      type,
      text,
      color: loadedStudioColor(entry),
      parentId: entry.parentId ?? null,
      geometry: entry.geometry,
      style,
      layout: entry.layout,
      locked: entry.locked,
      direction: entry.direction,
      author: entry.author,
      icon: entry.icon,
    };
  });

  const candidate = {
    schemaVersion: raw.schemaVersion,
    id: raw.id,
    title: raw.title,
    mode: raw.mode,
    viewport: raw.viewport,
    size: raw.size,
    objects,
    connections: Array.isArray(raw.connections) ? raw.connections : [],
    annotations: Array.isArray(raw.annotations) ? raw.annotations : [],
  };

  const validation = validateInteractiveCanvasDocument(candidate);
  if (!validation.ok) {
    const detail = validation.issues
      .slice(0, 3)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    return { ok: false, detail: `Board uses fields this editor cannot load — ${detail}` };
  }
  return { ok: true, document: validation.document };
}

function adaptObjectToDocs(
  object: InteractiveCanvasObject,
  original: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(original ?? {}) };
  // The studio-only field names never go on the wire; the docs shape speaks
  // label/title/tint instead.
  delete out.text;
  delete out.color;

  const originalColor = original ? loadedStudioColor(original) : undefined;
  const colorChanged = (object.color ?? undefined) !== originalColor;

  const originalType = typeof original?.type === "string" ? original.type : undefined;
  const type =
    originalType && (DOCS_TO_STUDIO_TYPE[originalType] ?? originalType) === object.type
      ? originalType
      : (STUDIO_TO_DOCS_TYPE[object.type] ?? object.type);

  const trimmedText = object.text.trim();
  const label = trimmedText
    ? object.text
    : typeof original?.label === "string" && original.label.trim()
      ? original.label
      : object.id;

  out.id = object.id;
  out.type = type;
  out.label = label;
  out.parentId = object.parentId ?? null;
  out.geometry = { ...object.geometry };

  // Style merge: editor-owned keys (shape/strokeWidth/strokeStyle) win; every
  // docs-only style key rides through — except raw fill/stroke hexes when the
  // user recolored the object here, where a stale hex would keep overriding
  // the new pick on the docs side.
  const mergedStyle: Record<string, unknown> = isRecord(original?.style)
    ? { ...original.style }
    : {};
  if (colorChanged) {
    delete mergedStyle.fill;
    delete mergedStyle.stroke;
  }
  if (object.style?.shape !== undefined) mergedStyle.shape = object.style.shape;
  if (object.style?.strokeWidth !== undefined) mergedStyle.strokeWidth = object.style.strokeWidth;
  if (object.style?.strokeStyle !== undefined) mergedStyle.strokeStyle = object.style.strokeStyle;
  if (Object.keys(mergedStyle).length > 0) out.style = mergedStyle;
  else delete out.style;

  if (object.layout !== undefined) out.layout = object.layout;
  if (object.locked !== undefined) out.locked = object.locked;
  else delete out.locked;
  if (object.direction !== undefined) out.direction = object.direction;
  if (object.author !== undefined) out.author = object.author;
  if (object.icon !== undefined) out.icon = object.icon;

  if (type === "section") {
    // Docs-side sections hard-require a non-empty title + a known tint family.
    out.title = trimmedText
      ? object.text
      : typeof original?.title === "string" && original.title.trim()
        ? original.title
        : label;
    const keptTint =
      !colorChanged && typeof original?.tint === "string" ? original.tint : undefined;
    out.tint = keptTint ?? docsTintFromStudio(object.color) ?? "gray";
  }

  return out;
}

/**
 * Studio editor document -> docs sidecar wire shape, merged over the original
 * raw document so docs-only fields (top-level and per-object/connection)
 * survive. `originalRaw` is the exact payload the board was loaded (or last
 * saved) as.
 */
export function adaptStudioDocumentToProject(
  document: InteractiveCanvasDocument,
  originalRaw: unknown,
): Record<string, unknown> {
  const framedDocument = withRootPageFrame(document);
  const rawDoc = isRecord(originalRaw) ? originalRaw : {};
  const originalObjects = new Map<unknown, Record<string, unknown>>();
  if (Array.isArray(rawDoc.objects)) {
    for (const entry of rawDoc.objects) {
      if (isRecord(entry)) originalObjects.set(entry.id, entry);
    }
  }
  const originalConnections = new Map<unknown, Record<string, unknown>>();
  if (Array.isArray(rawDoc.connections)) {
    for (const entry of rawDoc.connections) {
      if (isRecord(entry)) originalConnections.set(entry.id, entry);
    }
  }

  const objects = framedDocument.objects.map((object) =>
    adaptObjectToDocs(object, originalObjects.get(object.id)),
  );
  const connections = framedDocument.connections.map((connection) => ({
    ...(originalConnections.get(connection.id) ?? {}),
    ...JSON.parse(JSON.stringify(connection)),
  }));

  return {
    ...rawDoc,
    schemaVersion: 1,
    id: framedDocument.id,
    title: framedDocument.title,
    mode: framedDocument.mode,
    viewport: framedDocument.viewport,
    size: framedDocument.size,
    objects,
    connections,
    annotations: framedDocument.annotations ?? [],
  };
}
