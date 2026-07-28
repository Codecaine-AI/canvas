"use client";

import type {
  CanvasConnectionEndpoint,
  CanvasGeometry,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "./schema";

/**
 * The INTERACTION grid: what a human drag/resize/nudge lands on in the UI
 * (stage/editor/features/snapping/, use-canvas-hotkeys' Shift+Arrow step, and
 * the reducer's own move/resize handlers). It is deliberately NOT the grid the
 * write path normalizes to — see GEOMETRY_NORMALIZATION_GRID.
 */
export const CANVAS_GRID_SIZE = 16;

/**
 * The NORMALIZATION grid: the rounding every geometry WRITE passes through
 * (mergeObjectPatch, sectionFitGeometry, and the agent harness' injected page
 * frame). 4 is the common divisor of the UI's 16 and the agent's 20, so a box
 * authored on either grid survives normalization byte-for-byte — a 16-grid
 * drag result stays 16-grid, and an agent-written 20-grid box is not silently
 * re-rounded to 96/112 on update or on commit replay through the reducer.
 *
 * (Gesture-surface plan D1. The agent's own quantizer, AGENT_GRID = 20, lives
 * in canvas-agent and runs before values reach this layer; whether UI drags
 * move to 20 as well is a separate product call.)
 */
export const GEOMETRY_NORMALIZATION_GRID = 4;

/**
 * The air a fitted frame keeps on its left, right and bottom edges by default
 * — the interactive fit-to-content control's rung. Callers that need a
 * different rung (the agent fits on grid multiples, see SectionFitPadding)
 * pass their own; this stays the UI's number.
 */
export const SECTION_FIT_PADDING_PX = 24;
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

/**
 * Rounds one number to `gridSize`. The grid is an explicit parameter because
 * interaction and normalization use different grids (D1); the default is the
 * interaction grid, so callers that snap a drag read the same as before.
 */
export function snapCanvasNumber(value: number, gridSize = CANVAS_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Rounds a whole box to `gridSize`, keeping width/height at one grid unit
 * minimum. Pass GEOMETRY_NORMALIZATION_GRID on a write path and
 * CANVAS_GRID_SIZE (the default) on an interaction path.
 */
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

/**
 * How much air a fit leaves around the children, when the defaults are not
 * what the caller wants. A bare number keeps the old meaning (body padding,
 * default title clearance) so every existing call site reads the same.
 *
 * The agent path passes grid multiples ({ padding: 40, titleClearance: 40 })
 * so a frame fitted around 20-grid children lands on the 20 grid too; the
 * interactive control keeps the UI's 24/30 (see SECTION_FIT_PADDING_PX).
 */
export type SectionFitPadding = {
  /** Air on the left, right and bottom edges. Defaults to SECTION_FIT_PADDING_PX. */
  padding?: number;
  /**
   * Extra air above the topmost child, ON TOP of `padding` — the band the
   * title chip occupies. Defaults to SECTION_TITLE_CLEARANCE_PX.
   */
  titleClearance?: number;
};

type ResolvedSectionFitPadding = { padding: number; titleClearance: number };

function resolveSectionFitPadding(
  padding: number | SectionFitPadding,
): ResolvedSectionFitPadding {
  if (typeof padding === "number") {
    return { padding, titleClearance: SECTION_TITLE_CLEARANCE_PX };
  }
  return {
    padding: padding.padding ?? SECTION_FIT_PADDING_PX,
    titleClearance: padding.titleClearance ?? SECTION_TITLE_CLEARANCE_PX,
  };
}

export function fitSectionToChildren(
  document: InteractiveCanvasDocument,
  sectionId: string,
  padding: number | SectionFitPadding = SECTION_FIT_PADDING_PX,
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
  paddingConfig: number | SectionFitPadding = SECTION_FIT_PADDING_PX,
): CanvasGeometry | null {
  const section = objectById(document, sectionId);
  if (!section || section.type !== "section") return null;
  const children = document.objects.filter((object) => object.parentId === sectionId);
  if (children.length === 0) return null;

  const { padding, titleClearance } = resolveSectionFitPadding(paddingConfig);
  const geometries = children.map((object) => object.geometry);
  const minX = Math.min(...geometries.map((geometry) => geometry.x));
  const minY = Math.min(...geometries.map((geometry) => geometry.y));
  const maxX = Math.max(...geometries.map((geometry) => geometry.x + geometry.width));
  const maxY = Math.max(...geometries.map((geometry) => geometry.y + geometry.height));
  const topPadding = padding + titleClearance;

  // D1 — a fit is a WRITE, so it normalizes on the 4 grid: a frame fitted
  // around 20-grid children keeps 20-grid edges instead of being pulled to
  // the nearest 16.
  return snapGeometry(
    {
      x: roundCanvasNumber(minX - padding),
      y: roundCanvasNumber(minY - topPadding),
      width: roundCanvasNumber(maxX - minX + padding * 2),
      height: roundCanvasNumber(maxY - minY + topPadding + padding),
    },
    GEOMETRY_NORMALIZATION_GRID,
  );
}

// ---------------------------------------------------------------------------
// Rigid translation (gesture-surface S2.1)
//
// The reducer's own handlers (handleMoveSelection, alignObjects) move exactly
// the ids they are handed. Dragging a frame in the UI does not: the drag layer
// expands the selection over the section's descendants first
// (stage/editor/features/move/move.ts' expandMoveObjectIds) so a frame and its
// contents travel as one body. The agent's arrange gestures need the same
// semantics, so the expansion + rigid translate live here, in the model layer,
// where both paths can converge on them later.
// ---------------------------------------------------------------------------

/** A rigid displacement in board coordinates. */
export type CanvasTranslation = {
  dx: number;
  dy: number;
};

/**
 * The closed set of ids a rigid move touches: every listed id that names a
 * real object, plus every transitive descendant of any listed section.
 *
 * Unknown ids are skipped rather than rejected — a caller that hands over a
 * connection id or a stale object id gets a smaller move, not a throw. Ids
 * listed twice, and a child listed alongside the section that already carries
 * it, collapse into the one set entry, so nothing can move twice.
 */
export function moveClosureIds(
  document: InteractiveCanvasDocument,
  objectIds: readonly string[],
): Set<string> {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const closure = new Set<string>();
  for (const objectId of objectIds) {
    const object = byId.get(objectId);
    if (!object) continue;
    closure.add(objectId);
    if (object.type !== "section") continue;
    for (const descendantId of sectionDescendantIds(document, objectId)) {
      closure.add(descendantId);
    }
  }
  return closure;
}

/**
 * The subset of `objectIds` that moves under its own delta: listed ids, minus
 * any that a listed section already carries as a descendant.
 *
 * This is what makes a multi-delta gesture (align, space_out) well defined on
 * an overlapping selection. A child of a listed section has no independent
 * position to align or re-pitch — it travels with its frame — so it drops out
 * here rather than receiving a second, contradictory delta. Order and
 * duplicates from the caller are normalized away (first mention wins).
 */
export function moveRootIds(
  document: InteractiveCanvasDocument,
  objectIds: readonly string[],
): string[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const listed: string[] = [];
  const seen = new Set<string>();
  for (const objectId of objectIds) {
    if (seen.has(objectId) || !byId.has(objectId)) continue;
    seen.add(objectId);
    listed.push(objectId);
  }
  const carried = new Set<string>();
  for (const objectId of listed) {
    if (byId.get(objectId)!.type !== "section") continue;
    for (const descendantId of sectionDescendantIds(document, objectId)) {
      carried.add(descendantId);
    }
  }
  return listed.filter((objectId) => !carried.has(objectId));
}

function translateGeometry(
  geometry: CanvasGeometry,
  delta: CanvasTranslation,
): CanvasGeometry {
  return {
    ...geometry,
    x: roundCanvasNumber(geometry.x + delta.dx),
    y: roundCanvasNumber(geometry.y + delta.dy),
  };
}

/**
 * Rigidly translates `objectIds` and everything any listed section contains.
 *
 * Sizes are untouched and every member of the closed set moves by the same
 * delta, so relative geometry is preserved exactly — which is why containment
 * cannot change on a move: reconcileSectionMembership is an identity on the
 * result (asserted in the tests).
 *
 * Returns the new objects array (the file's pure-function convention — the
 * caller decides which document to hang it on); the input array comes back
 * unchanged when the move is a no-op.
 */
export function translateWithDescendants(
  document: InteractiveCanvasDocument,
  objectIds: readonly string[],
  delta: CanvasTranslation,
): InteractiveCanvasObject[] {
  if (delta.dx === 0 && delta.dy === 0) return document.objects;
  const closure = moveClosureIds(document, objectIds);
  if (closure.size === 0) return document.objects;
  return document.objects.map((object) =>
    closure.has(object.id)
      ? { ...object, geometry: translateGeometry(object.geometry, delta) }
      : object,
  );
}

/**
 * Applies one delta per move root, expanding each root over its descendants.
 * Roots must already be disjoint (moveRootIds guarantees it), so no object is
 * ever claimed by two deltas.
 */
function translateRoots(
  document: InteractiveCanvasDocument,
  deltasByRootId: Map<string, CanvasTranslation>,
): InteractiveCanvasDocument {
  const deltaByObjectId = new Map<string, CanvasTranslation>();
  for (const [rootId, delta] of deltasByRootId) {
    if (delta.dx === 0 && delta.dy === 0) continue;
    for (const objectId of moveClosureIds(document, [rootId])) {
      if (!deltaByObjectId.has(objectId)) deltaByObjectId.set(objectId, delta);
    }
  }
  if (deltaByObjectId.size === 0) return document;
  return {
    ...document,
    objects: document.objects.map((object) => {
      const delta = deltaByObjectId.get(object.id);
      if (!delta) return object;
      return { ...object, geometry: translateGeometry(object.geometry, delta) };
    }),
  };
}

/** The canvas-native alignment vocabulary (reducer actions, selection toolbar). */
export type CanvasAlignAxis =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom";

/**
 * The alignment vocabulary plus the agent tool surface's spelling of the two
 * centering edges (`center_h` / `center_v`, per
 * docs/30-agent-layout/50-tool-surface/10-gestures §Arrange). `center_h`
 * aligns HORIZONTAL centers — every box ends on the same
 * center x, i.e. `center-x` — and `center_v` the vertical ones, matching the
 * usual "align horizontal centers" phrasing.
 */
export type CanvasAlignEdge = CanvasAlignAxis | "center_h" | "center_v";

function normalizeAlignEdge(edge: CanvasAlignEdge): CanvasAlignAxis {
  if (edge === "center_h") return "center-x";
  if (edge === "center_v") return "center-y";
  return edge;
}

/**
 * Where one box lands when aligned to `axis` inside `bounds`. The single home
 * of the edge math — alignObjects writes the result straight onto the object,
 * alignWithDescendants turns it into a delta and carries section contents
 * along with it.
 */
function alignedGeometry(
  geometry: CanvasGeometry,
  bounds: CanvasBounds,
  axis: CanvasAlignAxis,
): CanvasGeometry {
  if (axis === "left") return { ...geometry, x: bounds.x };
  if (axis === "right") return { ...geometry, x: bounds.x + bounds.width - geometry.width };
  if (axis === "center-x") {
    return { ...geometry, x: bounds.x + bounds.width / 2 - geometry.width / 2 };
  }
  if (axis === "top") return { ...geometry, y: bounds.y };
  if (axis === "bottom") {
    return { ...geometry, y: bounds.y + bounds.height - geometry.height };
  }
  return { ...geometry, y: bounds.y + bounds.height / 2 - geometry.height / 2 };
}

export function alignObjects(
  document: InteractiveCanvasDocument,
  objectIds: string[],
  axis: CanvasAlignAxis,
): InteractiveCanvasDocument {
  const selected = document.objects.filter((object) => objectIds.includes(object.id));
  if (selected.length < 2) return document;
  const bounds = boundsForGeometries(selected.map((object) => object.geometry));
  if (!bounds) return document;
  return {
    ...document,
    objects: document.objects.map((object) => {
      if (!objectIds.includes(object.id)) return object;
      return { ...object, geometry: alignedGeometry(object.geometry, bounds, axis) };
    }),
  };
}

/**
 * alignObjects with frame semantics (gesture-surface S2.3): a section aligns
 * as one unit, by its own frame edge, and its contents travel with it instead
 * of being left behind.
 *
 * The edge math is alignObjects' — same bounds, same per-box target — applied
 * as a rigid delta rather than an absolute write. Ids that a listed section
 * already carries are dropped before the bounds are taken (moveRootIds): they
 * have no independent position to align. Unknown ids (a connection, a stale
 * id) are skipped, so a caller that has not validated its input gets a smaller
 * alignment rather than an error.
 */
export function alignWithDescendants(
  document: InteractiveCanvasDocument,
  objectIds: readonly string[],
  edge: CanvasAlignEdge,
): InteractiveCanvasDocument {
  const axis = normalizeAlignEdge(edge);
  const rootIds = moveRootIds(document, objectIds);
  if (rootIds.length < 2) return document;
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const roots = rootIds.map((objectId) => byId.get(objectId)!);
  const bounds = boundsForGeometries(roots.map((object) => object.geometry));
  if (!bounds) return document;

  const deltas = new Map<string, CanvasTranslation>();
  for (const root of roots) {
    const target = alignedGeometry(root.geometry, bounds, axis);
    deltas.set(root.id, {
      dx: target.x - root.geometry.x,
      dy: target.y - root.geometry.y,
    });
  }
  return translateRoots(document, deltas);
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

/**
 * Gap-based re-pitch along one axis (gesture-surface S2.2) — the corridor
 * opener the crowding lint's suggestions describe, as one operation instead of
 * N hand-computed moves.
 *
 * Deliberately NOT distributeObjects. That one is span-based: it equalizes
 * pitch inside the span the selection already occupies, so it can never open a
 * gap that isn't there and needs three boxes to mean anything. This one is
 * gap-based: in positional order along the axis the first box HOLDS, and each
 * subsequent box slides so the CLEAR gap to its predecessor's trailing edge is
 * exactly `gap`. The span grows or shrinks as needed and two boxes are enough.
 *
 * Cross-axis positions are untouched — align owns the cross axis, space_out
 * owns the flow axis. Sections re-pitch by their own frame box and carry their
 * contents (moveRootIds + translateRoots), and a child of a listed section
 * drops out rather than being re-pitched inside the frame that is already
 * carrying it.
 *
 * `gap` is expected to arrive already quantized (the agent descriptor snaps it
 * to the 20 grid); the arithmetic here is hold + trailing edge + gap with no
 * rounding of its own beyond roundCanvasNumber's 2-decimal hygiene, so on-grid
 * boxes with an on-grid gap stay exactly on grid.
 *
 * Unknown ids are skipped defensively — the descriptor is what rejects
 * connection ids.
 */
export function spaceOutObjects(
  document: InteractiveCanvasDocument,
  objectIds: readonly string[],
  axis: "horizontal" | "vertical",
  gap: number,
): InteractiveCanvasDocument {
  const rootIds = moveRootIds(document, objectIds);
  if (rootIds.length < 2) return document;
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const horizontal = axis === "horizontal";
  const start = (object: InteractiveCanvasObject): number =>
    horizontal ? object.geometry.x : object.geometry.y;
  const extent = (object: InteractiveCanvasObject): number =>
    horizontal ? object.geometry.width : object.geometry.height;

  // Positional order along the axis; ties keep the caller's order (stable sort).
  const sorted = rootIds.map((objectId) => byId.get(objectId)!).sort((a, b) => start(a) - start(b));

  const deltas = new Map<string, CanvasTranslation>();
  let trailingEdge = start(sorted[0]!) + extent(sorted[0]!);
  for (const object of sorted.slice(1)) {
    const target = trailingEdge + gap;
    const offset = target - start(object);
    if (offset !== 0) {
      deltas.set(object.id, horizontal ? { dx: offset, dy: 0 } : { dx: 0, dy: offset });
    }
    trailingEdge = target + extent(object);
  }
  return translateRoots(document, deltas);
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
 * screen-recording trim catalog, see affine-mining-map.md §1's flagged
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
