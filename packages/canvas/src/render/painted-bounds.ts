/**
 * Painted-extent measurement for canvas documents.
 *
 * An object's *painted* picture is larger than its geometry rect: icon
 * captions render below the glyph box, section title chips float at the
 * frame's top-left corner, connections route as elbow polylines that can
 * detour far outside their endpoints' bboxes, and labeled connections carry
 * a label chip at the route's halfway point. Cameras that promise "nothing
 * painted is cut off" must be computed from these extents, not from geometry
 * rects — so this module measures them with the SAME primitives the renderer
 * draws with: the production router (connectors/routing.ts routeConnection),
 * the below-band text slot (objects/text-slots.ts belowExtendedBoundsPx),
 * the section chip geometry (objects/section/title-chip-geometry.ts), and
 * the renderer's own label-chip rect (render/static-svg.ts
 * connectionLabelChipRect). Pure, deterministic, Node-safe — no DOM.
 */

import { routeConnection } from "../connectors/routing";
import { belowExtendedBoundsPx } from "../objects/text-slots";
import { sectionTitleChipWorldRect } from "../objects/section/title-chip-geometry";
import { connectionLabelChipRect } from "./static-svg";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../state/schema";

/** Axis-aligned world-space rect. Structurally identical to CanvasBounds. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Smallest rect containing both inputs. */
export function unionRects(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** Whether two rects overlap at all (touching edges count). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

/**
 * The world-space painted extent of one object: its geometry rect, plus the
 * below-glyph caption band for below-text types (icon captions render under
 * the glyph box, unclamped), plus — for a titled section — the natural-size
 * (scale 1) title chip. Chip counter-scale at a specific camera zoom is the
 * caller's concern (see render/views.ts): world-space painted bounds are
 * measured at zoom 1.
 */
export function objectPaintedBounds(object: InteractiveCanvasObject): Rect {
  // belowExtendedBoundsPx returns the glyph box ∪ caption band in
  // object-local coordinates (glyph box alone for types without a below
  // band, or when the band is empty/hidden).
  const local = belowExtendedBoundsPx(object);
  let rect: Rect = {
    x: object.geometry.x + local.x,
    y: object.geometry.y + local.y,
    width: local.width,
    height: local.height,
  };
  if (object.type === "section" && object.text !== "") {
    rect = unionRects(rect, sectionTitleChipWorldRect(object, 1));
  }
  return rect;
}

/** Bounding box of a routed polyline's vertices. */
function polylineBounds(points: ReadonlyArray<{ x: number; y: number }>): Rect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function routedConnectionBounds(
  connection: InteractiveCanvasConnection,
  objectsById: ReadonlyMap<string, InteractiveCanvasObject>,
  obstacles: ReadonlyArray<InteractiveCanvasObject>,
): Rect | null {
  const fromObject = objectsById.get(connection.from.objectId);
  const toObject = objectsById.get(connection.to.objectId);
  if (!fromObject || !toObject) return null;

  const routed = routeConnection(fromObject, toObject, connection, obstacles);
  const points = routed.points && routed.points.length > 0
    ? routed.points
    : [routed.start, routed.end];
  let rect = polylineBounds(points);
  if (!rect) return null;

  const label = connection.label?.trim() ? connection.label : null;
  if (label) rect = unionRects(rect, connectionLabelChipRect(label, routed.labelPoint));
  return rect;
}

/**
 * The world-space painted extent of one connection: the bounding box of its
 * production-routed polyline (elbow corners, obstacle detours and all) plus
 * its label chip when labeled. Routes against the WHOLE document's objects —
 * the same obstacle set the live board routes against — so the measured route
 * is the drawn route. Returns null when either endpoint object is missing.
 */
export function connectionPaintedBounds(
  document: InteractiveCanvasDocument,
  connection: InteractiveCanvasConnection,
): Rect | null {
  const objectsById = new Map(document.objects.map((object) => [object.id, object]));
  return routedConnectionBounds(connection, objectsById, document.objects);
}

/**
 * World-space union of the painted extents of the targeted content —
 * everything when `targetIds` is omitted. Targets select objects by id (and
 * may name connection ids directly); every connection touching a targeted
 * object is measured too, since its painted route belongs to the target's
 * picture even when the far endpoint is not targeted.
 *
 * Falls back to the document's page rect (or the default board size) when
 * nothing is targeted or the document is empty.
 */
export function paintedBounds(
  document: InteractiveCanvasDocument,
  targetIds?: ReadonlySet<string>,
): Rect {
  const objectsById = new Map(document.objects.map((object) => [object.id, object]));
  const targetObjects = targetIds
    ? document.objects.filter((object) => targetIds.has(object.id))
    : document.objects;
  const targetObjectIds = new Set(targetObjects.map((object) => object.id));

  let rect: Rect | null = null;
  const add = (candidate: Rect | null) => {
    if (!candidate) return;
    rect = rect ? unionRects(rect, candidate) : candidate;
  };

  for (const object of targetObjects) add(objectPaintedBounds(object));

  for (const connection of document.connections) {
    const touchesTarget =
      !targetIds ||
      targetIds.has(connection.id) ||
      targetObjectIds.has(connection.from.objectId) ||
      targetObjectIds.has(connection.to.objectId);
    if (!touchesTarget) continue;
    add(routedConnectionBounds(connection, objectsById, document.objects));
  }

  return (
    rect ?? {
      x: 0,
      y: 0,
      width: document.size?.width ?? 1200,
      height: document.size?.height ?? 720,
    }
  );
}
