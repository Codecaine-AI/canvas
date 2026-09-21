/**
 * Load current or legacy project sidecars and save the current Canvas schema.
 * Docs and Studio share the required `text` field and `color` vocabulary.
 * Legacy label/title/tint fields are accepted on load, never emitted on save.
 * Unmodeled project metadata survives by merging original records by id.
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

/** Docs tint family -> studio hue ("purple" is the one renamed id). */
function studioColorFromDocs(value: unknown): CanvasColor | undefined {
  const candidate = value === "purple" ? "violet" : value;
  return isCanvasColor(candidate) ? candidate : undefined;
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
  const out: Record<string, unknown> = {
    ...(original ?? {}),
    ...object,
    parentId: object.parentId ?? null,
    geometry: { ...object.geometry },
  };
  for (const key of ["label", "title", "body", "tint"]) delete out[key];
  // Explicitly clear optional editor-owned fields removed by an edit.
  for (const key of ["color", "layout", "locked", "direction", "author", "icon"] as const) {
    if (object[key] === undefined) delete out[key];
  }

  const mergedStyle: Record<string, unknown> = isRecord(original?.style)
    ? { ...original.style }
    : {};
  for (const key of ["fill", "stroke", "tone", "paletteToken"]) delete mergedStyle[key];
  if (object.style?.shape !== undefined) mergedStyle.shape = object.style.shape;
  if (object.style?.strokeWidth !== undefined) mergedStyle.strokeWidth = object.style.strokeWidth;
  if (object.style?.strokeStyle !== undefined) mergedStyle.strokeStyle = object.style.strokeStyle;
  if (Object.keys(mergedStyle).length > 0) out.style = mergedStyle;
  else delete out.style;

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
