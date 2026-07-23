/**
 * Session-context building blocks: crop/geometry guards, the wrecked-document
 * gate, draft-only page-frame injection (every frameless board gets a
 * locked-background root section at session start), and the spawn snapshots —
 * <board_state> (digest + lint report), <editor_state> (scope frame,
 * selection, viewport), and <user_requests> (document + invoke annotations
 * merged into the read-only request queue; document wins on id collision).
 */
import type {
  CanvasGeometry,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

import {
  CANVAS_GRID_SIZE,
  boundsForGeometries,
} from "../../../../canvas/src/state/geometry";
import { nextId } from "../../../../canvas/src/state/actions/helpers";

import type { Rect } from "../../board/types";
import { formatBoardDigest } from "../../board/digest";
import { formatDiagnostics, runDiagnostics } from "../../board/lints/run";
import type { Diagnostic } from "../../board/lints";

import type { EditorStateSnapshot } from "../../agent/loaders/editor-state";
import { formatUserRequests } from "../../agent/loaders/user-requests";
import type { AgentSessionAnnotation } from "../../protocol";
import type { LayoutSession } from "./store";

/** A generous world-space bound that rejects overflow/memory-bomb crops. */
const MAX_RENDER_CROP_DIMENSION = 1_000_000;
const MAX_RENDER_WORLD_COORDINATE = 1_000_000_000;
const DOCUMENT_ITEM_MINIMUM = { width: 32, height: 24 } as const;
/** Smallest useful empty section: a 16px placeholder cell plus corpus-mined trim (48px side padding, 64px header band). */
export const MINIMUM_SECTION_DIMENSIONS = { width: 112, height: 176 } as const;
const PAGE_FRAME_ID = "page-frame";
const PAGE_FRAME_INSET = 32;
const DEFAULT_PAGE_SIZE = { width: 1200, height: 720 } as const;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function expandRect(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

export function renderCropError(crop: Rect): string | null {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)) {
    return "Render crop x, y, width, and height must all be finite numbers.";
  }
  if (!(crop.width > 0) || !(crop.height > 0)) {
    return "Render crop must have positive width and height.";
  }
  if (crop.width > MAX_RENDER_CROP_DIMENSION || crop.height > MAX_RENDER_CROP_DIMENSION) {
    return `Render crop width and height must not exceed ${MAX_RENDER_CROP_DIMENSION}px.`;
  }
  if (Math.abs(crop.x) > MAX_RENDER_WORLD_COORDINATE
    || Math.abs(crop.y) > MAX_RENDER_WORLD_COORDINATE) {
    return "Render crop x and y are outside the supported world range.";
  }
  if (!Number.isFinite(crop.x + crop.width) || !Number.isFinite(crop.y + crop.height)) {
    return "Render crop bounds must remain finite.";
  }
  return null;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  if (![a.x, a.y, a.width, a.height].every(Number.isFinite)) return false;
  if (!(a.width > 0) || !(a.height > 0)) return false;
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function intersectionArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

export function finiteGeometry(value: unknown): value is CanvasGeometry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const geometry = value as Record<string, unknown>;
  return [geometry.x, geometry.y, geometry.width, geometry.height].every(
    (entry) => typeof entry === "number" && Number.isFinite(entry),
  );
}

function gateRelevant(
  restrictToIds: ReadonlySet<string> | undefined,
  ...ids: string[]
): boolean {
  return !restrictToIds || ids.some((id) => restrictToIds.has(id));
}

export interface WreckedDocumentOptions {
  restrictToIds?: ReadonlySet<string>;
  mode?: "error" | "warning";
}

/**
 * Document gate for drafts authored through id-addressed operations.
 */
export function wreckedDocumentError(
  draft: InteractiveCanvasDocument,
  options: WreckedDocumentOptions = {},
): string | null {
  const { restrictToIds } = options;
  const problems: string[] = [];
  const sections = draft.objects.filter((object) => object.type === "section");

  for (const section of sections) {
    const { geometry } = section;
    if (gateRelevant(restrictToIds, section.id)
      && (!finiteGeometry(geometry)
        || geometry.width < MINIMUM_SECTION_DIMENSIONS.width
        || geometry.height < MINIMUM_SECTION_DIMENSIONS.height)) {
      problems.push(
        `section "${section.id}" is ${round2(geometry.width)}×${round2(geometry.height)}, `
        + `below its minimum ${MINIMUM_SECTION_DIMENSIONS.width}×${MINIMUM_SECTION_DIMENSIONS.height}.`,
      );
    }

    const children = draft.objects.filter((object) => object.parentId === section.id);
    if (children.length === 0
      || !gateRelevant(restrictToIds, section.id, ...children.map((child) => child.id))) {
      continue;
    }
    const childLeft = Math.min(...children.map((child) => child.geometry.x));
    const childTop = Math.min(...children.map((child) => child.geometry.y));
    const childRight = Math.max(...children.map(
      (child) => child.geometry.x + child.geometry.width,
    ));
    const childBottom = Math.max(...children.map(
      (child) => child.geometry.y + child.geometry.height,
    ));
    if (!finiteGeometry(geometry)
      || geometry.x > childLeft
      || geometry.y > childTop
      || geometry.x + geometry.width < childRight
      || geometry.y + geometry.height < childBottom) {
      problems.push(
        `section "${section.id}" does not contain its parentId children `
        + `(child bounds ${round2(childRight - childLeft)}×${round2(childBottom - childTop)}).`,
      );
    }
  }

  for (const object of draft.objects) {
    if (object.type === "section" || object.type === "annotation-marker") continue;
    if (!gateRelevant(restrictToIds, object.id)) continue;
    const { geometry } = object;
    if (!finiteGeometry(geometry)
      || geometry.width < DOCUMENT_ITEM_MINIMUM.width
      || geometry.height < DOCUMENT_ITEM_MINIMUM.height) {
      problems.push(
        `object "${object.id}" is ${round2(geometry.width)}×${round2(geometry.height)}, `
        + `below its minimum ${DOCUMENT_ITEM_MINIMUM.width}×${DOCUMENT_ITEM_MINIMUM.height}.`,
      );
    }
  }

  const overlapCandidates = draft.objects.filter((object) => (
    object.type !== "section"
    && object.type !== "sticky"
    && object.type !== "annotation-marker"
  ));
  for (let index = 0; index < overlapCandidates.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < overlapCandidates.length; otherIndex += 1) {
      const a = overlapCandidates[index]!;
      const b = overlapCandidates[otherIndex]!;
      if ((a.parentId ?? null) !== (b.parentId ?? null)) continue;
      if (!gateRelevant(restrictToIds, a.id, b.id)) continue;
      const smallerArea = Math.min(
        a.geometry.width * a.geometry.height,
        b.geometry.width * b.geometry.height,
      );
      if (!(smallerArea > 0)) continue;
      const overlapPct = intersectionArea(a.geometry, b.geometry) / smallerArea * 100;
      if (overlapPct > 25) {
        problems.push(
          `siblings "${a.id}" and "${b.id}" overlap across ${round2(overlapPct)}% `
          + "of the smaller object (maximum 25%).",
        );
      }
    }
  }

  const lockedFrames = sections.filter((section) => section.locked === "background");
  const pageFrame = lockedFrames.find((section) => section.parentId == null) ?? lockedFrames[0];
  if (pageFrame) {
    const frame = pageFrame.geometry;
    for (const object of draft.objects) {
      if (object.id === pageFrame.id
        || !gateRelevant(restrictToIds, pageFrame.id, object.id)) continue;
      const overflow = Math.max(
        frame.x - object.geometry.x,
        frame.y - object.geometry.y,
        object.geometry.x + object.geometry.width - (frame.x + frame.width),
        object.geometry.y + object.geometry.height - (frame.y + frame.height),
      );
      if (overflow > 16) {
        problems.push(
          `object "${object.id}" extends ${round2(overflow)}px past locked page frame `
          + `"${pageFrame.id}" (maximum 16px).`,
        );
      }
    }
  }

  if (problems.length === 0) return null;
  return [
    options.mode === "warning" ? "Document gate warnings:" : "Wrecked document rejected:",
    ...problems.map((problem) => `- ${problem}`),
  ].join("\n");
}

/**
 * resvg 2.6 aborts when a filtered or nested-SVG object is wholly outside
 * the viewport and its clip intersection is empty. Static crop rendering
 * deliberately retains the whole document, so select visible content here
 * before the SVG ever reaches the native rasterizer.
 */
export function documentWithinCrop(
  document: InteractiveCanvasDocument,
  crop: Rect,
): InteractiveCanvasDocument {
  const objects = document.objects.filter((object) => rectsOverlap(object.geometry, crop));
  const objectIds = new Set(objects.map((object) => object.id));
  const connections = document.connections.filter((connection) =>
    objectIds.has(connection.from.objectId) && objectIds.has(connection.to.objectId));
  return { ...document, objects, connections };
}

export function injectedPageFrame(
  document: InteractiveCanvasDocument,
): InteractiveCanvasObject | null {
  if (document.objects.some((object) => (
    object.type === "section"
    && object.locked === "background"
    && object.parentId == null
  ))) return null;

  let geometry: CanvasGeometry;
  if (document.size) {
    geometry = {
      x: PAGE_FRAME_INSET,
      y: PAGE_FRAME_INSET,
      width: Math.max(CANVAS_GRID_SIZE, document.size.width - PAGE_FRAME_INSET * 2),
      height: Math.max(CANVAS_GRID_SIZE, document.size.height - PAGE_FRAME_INSET * 2),
    };
  } else {
    const bounds = boundsForGeometries(
      document.objects.map((object) => object.geometry),
      PAGE_FRAME_INSET,
    );
    if (bounds) {
      const x = Math.floor(bounds.x / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;
      const y = Math.floor(bounds.y / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;
      const right = Math.ceil((bounds.x + bounds.width) / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;
      const bottom = Math.ceil((bounds.y + bounds.height) / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;
      geometry = { x, y, width: right - x, height: bottom - y };
    } else {
      geometry = {
        x: PAGE_FRAME_INSET,
        y: PAGE_FRAME_INSET,
        width: DEFAULT_PAGE_SIZE.width - PAGE_FRAME_INSET * 2,
        height: DEFAULT_PAGE_SIZE.height - PAGE_FRAME_INSET * 2,
      };
    }
  }

  const ids = document.objects.map((object) => object.id);
  return {
    id: ids.includes(PAGE_FRAME_ID) ? nextId(PAGE_FRAME_ID, ids) : PAGE_FRAME_ID,
    type: "section",
    text: document.title || "Canvas",
    color: "white",
    parentId: null,
    geometry,
    style: { shape: "section" },
    locked: "background",
  };
}

export function draftWithPageFrame(document: InteractiveCanvasDocument): InteractiveCanvasDocument {
  const frame = injectedPageFrame(document);
  return frame ? { ...document, objects: [frame, ...document.objects] } : document;
}

/**
 * The spawn-time <board_state> payload: full digest + full lint report over
 * the current draft, recomputed per run so refinements get a fresh snapshot.
 */
export function boardStateSnapshot(session: LayoutSession): string {
  return `${formatBoardDigest(session.draft)}\n\n${formatDiagnostics(runDiagnostics(session.draft))}`;
}

export function editorSnapshot(session: LayoutSession): EditorStateSnapshot {
  const byId = new Map(session.baseline.objects.map((object) => [object.id, object]));
  return {
    canvasId: session.canvasId,
    instruction: session.instruction,
    baselineHash: session.baselineHash,
    frame: session.scopeResolution.frame,
    selection: session.scopeResolution.scopeObjectIds.map((id) => {
      const object = byId.get(id);
      return { id, type: object?.type ?? "unknown", text: object?.text ?? "" };
    }),
    boundaryArrowCount: session.scopeResolution.boundaryArrowCount,
    viewport: session.viewport,
  };
}

/**
 * The <user_requests> queue: the draft document's annotations merged with the
 * invoke-time session annotations (document wins on id collision — it is the
 * stored truth; invoke-only entries follow).
 */
export function userRequestsSnapshot(session: LayoutSession): string {
  const documentAnnotations = (session.draft.annotations
    ?? []) as unknown as AgentSessionAnnotation[];
  const documentIds = new Set(documentAnnotations.map((annotation) => annotation.id));
  const invokeOnly = (session.annotations ?? []).filter(
    (annotation) => !documentIds.has(annotation.id),
  );
  return formatUserRequests([...documentAnnotations, ...invokeOnly]);
}

/** Digest + diagnostics over the current draft. */
export function boardReport(session: LayoutSession): {
  digest: string;
  diagnostics: Diagnostic[];
  diagnosticsText: string;
} {
  const diagnostics = runDiagnostics(session.draft);
  return {
    digest: formatBoardDigest(session.draft),
    diagnostics,
    diagnosticsText: formatDiagnostics(diagnostics),
  };
}

/** Scope ids for lint filtering: baseline scope + draft-created objects. */
export function lintScopeIds(
  session: LayoutSession,
  draft: InteractiveCanvasDocument,
): string[] {
  const created = draft.objects
    .filter((object) => !session.baseline.objects.some((baseline) => baseline.id === object.id))
    .map((object) => object.id);
  return [...session.scopeIds, ...created];
}

/** The current scope frame, unioned over baseline-scoped and newly created objects. */
export function solvedFrame(session: LayoutSession): Rect {
  const ids = new Set(lintScopeIds(session, session.draft));
  const scoped = session.draft.objects.filter((object) => ids.has(object.id));
  if (scoped.length === 0) return session.scopeResolution.frame;
  const x = Math.min(...scoped.map((object) => object.geometry.x));
  const y = Math.min(...scoped.map((object) => object.geometry.y));
  const right = Math.max(...scoped.map((object) => object.geometry.x + object.geometry.width));
  const bottom = Math.max(...scoped.map((object) => object.geometry.y + object.geometry.height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/**
 * Scope-filtered diagnostics: findings whose `at` list touches the baseline
 * scope or a draft-created object.
 */
export function scopedDiagnostics(
  session: LayoutSession,
  diagnostics: Diagnostic[],
): Diagnostic[] {
  const restrictToIds = new Set(lintScopeIds(session, session.draft));
  return diagnostics.filter((diagnostic) =>
    diagnostic.at.length === 0
    || diagnostic.at.some((id) => restrictToIds.has(id)));
}
