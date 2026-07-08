"use client";

import type {
  CanvasConnectionEndpoint,
  CanvasGeometry,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "./schema";

export const CANVAS_GRID_SIZE = 16;
const SECTION_FIT_PADDING_PX = 24;
// Mirrors TITLE_CHIP.insetFromSectionCornerPx + TITLE_CHIP.heightPx (3 + 27)
// in ../objects/text-slots.ts. Keep this state-side to avoid importing
// renderer/object definitions into model geometry helpers.
export const SECTION_TITLE_CLEARANCE_PX = 30;

export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasBounds = CanvasGeometry;

export function roundCanvasNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

export function snapCanvasNumber(value: number, gridSize = CANVAS_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapGeometry(
  geometry: CanvasGeometry,
  gridSize = CANVAS_GRID_SIZE,
): CanvasGeometry {
  return {
    x: snapCanvasNumber(geometry.x, gridSize),
    y: snapCanvasNumber(geometry.y, gridSize),
    width: Math.max(gridSize, snapCanvasNumber(geometry.width, gridSize)),
    height: Math.max(gridSize, snapCanvasNumber(geometry.height, gridSize)),
  };
}

export function centerOf(geometry: CanvasGeometry): CanvasPoint {
  return {
    x: geometry.x + geometry.width / 2,
    y: geometry.y + geometry.height / 2,
  };
}

export function anchorPoint(
  object: InteractiveCanvasObject,
  endpoint?: CanvasConnectionEndpoint,
): CanvasPoint {
  const geometry = object.geometry;
  const anchor = endpoint?.anchor ?? "center";
  if (anchor === "top") return { x: geometry.x + geometry.width / 2, y: geometry.y };
  if (anchor === "right") {
    return { x: geometry.x + geometry.width, y: geometry.y + geometry.height / 2 };
  }
  if (anchor === "bottom") {
    return { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height };
  }
  if (anchor === "left") return { x: geometry.x, y: geometry.y + geometry.height / 2 };
  return centerOf(geometry);
}

export function boundsForGeometries(
  geometries: CanvasGeometry[],
  padding = 0,
): CanvasBounds | null {
  if (geometries.length === 0) return null;
  const minX = Math.min(...geometries.map((geometry) => geometry.x));
  const minY = Math.min(...geometries.map((geometry) => geometry.y));
  const maxX = Math.max(...geometries.map((geometry) => geometry.x + geometry.width));
  const maxY = Math.max(...geometries.map((geometry) => geometry.y + geometry.height));
  return {
    x: roundCanvasNumber(minX - padding),
    y: roundCanvasNumber(minY - padding),
    width: roundCanvasNumber(maxX - minX + padding * 2),
    height: roundCanvasNumber(maxY - minY + padding * 2),
  };
}

/** Returns whether two axis-aligned bounds overlap at all (inclusive of touching edges). */
export function boundsIntersect(a: CanvasBounds, b: CanvasBounds): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

/** Builds a normalized CanvasBounds (non-negative width/height) from two arbitrary corners. */
export function normalizeBounds(corners: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}): CanvasBounds {
  const x = Math.min(corners.x1, corners.x2);
  const y = Math.min(corners.y1, corners.y2);
  return {
    x,
    y,
    width: Math.abs(corners.x2 - corners.x1),
    height: Math.abs(corners.y2 - corners.y1),
  };
}

export function documentBounds(document: InteractiveCanvasDocument, padding = 80): CanvasBounds {
  const canvasBase = document.size
    ? [{ x: 0, y: 0, width: document.size.width, height: document.size.height }]
    : [];
  return (
    boundsForGeometries(
      [...canvasBase, ...document.objects.map((object) => object.geometry)],
      padding,
    ) ?? {
      x: 0,
      y: 0,
      width: document.size?.width ?? 1200,
      height: document.size?.height ?? 720,
    }
  );
}

export function objectById(
  document: InteractiveCanvasDocument,
  objectId: string,
): InteractiveCanvasObject | null {
  return document.objects.find((object) => object.id === objectId) ?? null;
}

export function fitSectionToChildren(
  document: InteractiveCanvasDocument,
  sectionId: string,
  padding = SECTION_FIT_PADDING_PX,
): InteractiveCanvasDocument {
  const geometry = sectionFitGeometry(document, sectionId, padding);
  if (!geometry) return document;
  return {
    ...document,
    objects: document.objects.map((object) =>
      object.id === sectionId ? { ...object, geometry } : object,
    ),
  };
}

export function sectionFitGeometry(
  document: InteractiveCanvasDocument,
  sectionId: string,
  padding = SECTION_FIT_PADDING_PX,
): CanvasGeometry | null {
  const section = objectById(document, sectionId);
  if (!section || section.type !== "section") return null;
  const children = document.objects.filter((object) => object.parentId === sectionId);
  if (children.length === 0) return null;

  const geometries = children.map((object) => object.geometry);
  const minX = Math.min(...geometries.map((geometry) => geometry.x));
  const minY = Math.min(...geometries.map((geometry) => geometry.y));
  const maxX = Math.max(...geometries.map((geometry) => geometry.x + geometry.width));
  const maxY = Math.max(...geometries.map((geometry) => geometry.y + geometry.height));
  const topPadding = padding + SECTION_TITLE_CLEARANCE_PX;

  return snapGeometry({
    x: roundCanvasNumber(minX - padding),
    y: roundCanvasNumber(minY - topPadding),
    width: roundCanvasNumber(maxX - minX + padding * 2),
    height: roundCanvasNumber(maxY - minY + topPadding + padding),
  });
}

export function alignObjects(
  document: InteractiveCanvasDocument,
  objectIds: string[],
  axis: "left" | "center-x" | "right" | "top" | "center-y" | "bottom",
): InteractiveCanvasDocument {
  const selected = document.objects.filter((object) => objectIds.includes(object.id));
  if (selected.length < 2) return document;
  const bounds = boundsForGeometries(selected.map((object) => object.geometry));
  if (!bounds) return document;
  return {
    ...document,
    objects: document.objects.map((object) => {
      if (!objectIds.includes(object.id)) return object;
      const geometry = object.geometry;
      if (axis === "left") return { ...object, geometry: { ...geometry, x: bounds.x } };
      if (axis === "right") {
        return {
          ...object,
          geometry: { ...geometry, x: bounds.x + bounds.width - geometry.width },
        };
      }
      if (axis === "center-x") {
        return {
          ...object,
          geometry: { ...geometry, x: bounds.x + bounds.width / 2 - geometry.width / 2 },
        };
      }
      if (axis === "top") return { ...object, geometry: { ...geometry, y: bounds.y } };
      if (axis === "bottom") {
        return {
          ...object,
          geometry: { ...geometry, y: bounds.y + bounds.height - geometry.height },
        };
      }
      return {
        ...object,
        geometry: { ...geometry, y: bounds.y + bounds.height / 2 - geometry.height / 2 },
      };
    }),
  };
}

export function distributeObjects(
  document: InteractiveCanvasDocument,
  objectIds: string[],
  axis: "horizontal" | "vertical",
): InteractiveCanvasDocument {
  const selected = document.objects.filter((object) => objectIds.includes(object.id));
  if (selected.length < 3) return document;
  const sorted = [...selected].sort((a, b) =>
    axis === "horizontal" ? a.geometry.x - b.geometry.x : a.geometry.y - b.geometry.y,
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span =
    axis === "horizontal"
      ? last.geometry.x - first.geometry.x
      : last.geometry.y - first.geometry.y;
  const gap = span / (sorted.length - 1);
  const positions = new Map(
    sorted.map((object, index) => [
      object.id,
      axis === "horizontal"
        ? { x: first.geometry.x + gap * index }
        : { y: first.geometry.y + gap * index },
    ]),
  );
  return {
    ...document,
    objects: document.objects.map((object) => {
      const position = positions.get(object.id);
      if (!position) return object;
      return {
        ...object,
        geometry: {
          ...object.geometry,
          ...position,
        },
      };
    }),
  };
}

/** Axis-aligned overlap area between two bounds, 0 if they don't intersect. */
function overlapArea(a: CanvasBounds, b: CanvasBounds): number {
  const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
  return overlapWidth * overlapHeight;
}

/**
 * Section capture-membership threshold (W2 design decision — not directly
 * pixel-sampled; FigJam's own overlap fraction was never captured in the
 * screen-recording chrome catalog, see affine-mining-map.md §1's flagged
 * caveat). Capture claims every object whose bounds overlap the section's
 * bounds by at least this fraction of the OBJECT's own area (since W6 the
 * result is persisted as auto-managed parentId membership rather than
 * recomputed per drag). 1.0 would require full containment (too
 * strict — FigJam visibly captures objects that graze a section's inset
 * padding); 0.6 was chosen as a documented, testable middle ground: an object
 * more than half "inside" reads as a member, matching the intuitive FigJam
 * feel of "drop it mostly inside the section and it's captured."
 *
 * Lives here (next to sectionCaptureMembers, its consumer) rather than in
 * theme.ts because it's model semantics, not a visual token (the old
 * theme/tokens re-export was dropped in the theme dispersal — importers pull
 * it from here).
 */
export const SECTION_CAPTURE_OVERLAP_THRESHOLD = 0.6;

/**
 * FigJam section capture semantics (W2): computes which objects a section
 * geometrically "captures", purely from bounds overlap. Since W6, membership
 * IS persisted (an auto-managed parentId, assigned on drop into a section and
 * cleared on drop onto open canvas) — this function is the geometric probe
 * that seeds it (see canvas.captureSectionContents). An object is captured
 * when its bounds overlap the section's bounds by at least `threshold` of the
 * OBJECT's OWN area (see SECTION_CAPTURE_OVERLAP_THRESHOLD above for the
 * rationale behind the default 0.6).
 *
 * Recursive: if a captured object is itself a section, that nested section's
 * own captured members (computed the same way, against the nested section's
 * bounds) are folded in too — so dragging an outer section carries nested
 * sections and everything inside them, transitively.
 *
 * Returns a Set of captured object ids, NOT including `sectionId` itself.
 * Other sections can be captured (a section fully inside another section is
 * itself a member), but `sectionId`'s own ancestors are never included since
 * this only ever walks downward from the bounds of `sectionId`.
 */
export function sectionCaptureMembers(
  document: InteractiveCanvasDocument,
  sectionId: string,
  threshold: number,
): Set<string> {
  const captured = new Set<string>();
  const visitedSections = new Set<string>();

  function captureInto(currentSectionId: string): void {
    if (visitedSections.has(currentSectionId)) return;
    visitedSections.add(currentSectionId);
    const section = document.objects.find((object) => object.id === currentSectionId);
    if (!section) return;
    const sectionBounds = section.geometry;
    for (const object of document.objects) {
      if (object.id === currentSectionId) continue;
      if (captured.has(object.id)) continue;
      const objectArea = object.geometry.width * object.geometry.height;
      if (objectArea <= 0) continue;
      const overlapFraction = overlapArea(sectionBounds, object.geometry) / objectArea;
      if (overlapFraction >= threshold) {
        captured.add(object.id);
        if (object.type === "section") {
          captureInto(object.id);
        }
      }
    }
  }

  captureInto(sectionId);
  return captured;
}

/**
 * Transitive parentId-based descendants of a section (W6): every object whose
 * parentId chain leads to `sectionId`, including nested sections' members.
 * This is the persisted-membership counterpart to sectionCaptureMembers'
 * geometric probe — drag-carry and delete-cascade walk this recorded chain.
 * Returns a Set NOT including `sectionId` itself.
 */
export function sectionDescendantIds(
  document: InteractiveCanvasDocument,
  sectionId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const object of document.objects) {
    if (!object.parentId) continue;
    const siblings = childrenByParent.get(object.parentId);
    if (siblings) siblings.push(object.id);
    else childrenByParent.set(object.parentId, [object.id]);
  }
  const descendants = new Set<string>();
  const queue = [sectionId];
  while (queue.length > 0) {
    const currentId = queue.pop()!;
    for (const childId of childrenByParent.get(currentId) ?? []) {
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      queue.push(childId);
    }
  }
  return descendants;
}

export function createObjectId(document: InteractiveCanvasDocument, base: string): string {
  const normalized =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "canvas-object";
  const ids = new Set(document.objects.map((object) => object.id));
  if (!ids.has(normalized)) return normalized;
  let index = 2;
  while (ids.has(`${normalized}-${index}`)) index += 1;
  return `${normalized}-${index}`;
}
