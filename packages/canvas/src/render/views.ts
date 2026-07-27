/**
 * Named cameras over the static renderer (render/static-svg.ts).
 *
 * - `renderBoardView`: the whole board, framed by its painted extents —
 *   nothing painted (object, routed connection polyline, label chip, section
 *   title chip, icon caption) crosses the viewBox edge.
 * - `renderSectionView`: one section — the frame, everything belonging to it
 *   (descendants, their chips and captions, fully-internal edges including
 *   detours and label chips) fully visible; boundary-crossing connections are
 *   retained and drawn up to the camera edge, visibly clipped by the viewBox,
 *   never dropped.
 *
 * Both views route connectors against the WHOLE document — a view is a
 * camera onto the board, not a re-layout, so every drawn route matches the
 * board's route — and pass their effective zoom (rendered px width ÷ world
 * width) into title-chip rendering so section headers counter-scale exactly
 * as the live stage does at that zoom (titleChipScale). Connection label
 * chips never scale, mirroring the stage.
 */

import { sectionDescendantIds } from "../state/geometry";
import { titleChipScale } from "../objects/text-slots";
import { sectionTitleChipWorldRect } from "../objects/section/title-chip-geometry";
import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../state/schema";
import {
  objectPaintedBounds,
  paintedBounds,
  connectionPaintedBounds,
  rectsIntersect,
  unionRects,
  type Rect,
} from "./painted-bounds";
import { renderSceneToSvg } from "./static-svg";
import type { RenderedSvg } from "./types";

/** A rendered named view: the SVG plus the world-space camera it framed. */
export interface RenderedView extends RenderedSvg {
  camera: Rect;
}

export interface RenderViewOptions {
  /** Output width in px; height derives from the camera's aspect ratio. */
  width: number;
}

/** World padding framing a view's painted content. */
const VIEW_PADDING_PX = 24;
/**
 * Chip-fit passes are bounded: each expansion lowers the zoom, which raises
 * the (maxZoomOutScale-clamped) chip scale sub-linearly, so the camera
 * converges after very few rounds.
 */
const CHIP_FIT_MAX_PASSES = 5;
const CHIP_FIT_EPSILON_PX = 0.5;

function inflateRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function rectsAlmostEqual(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= CHIP_FIT_EPSILON_PX &&
    Math.abs(a.y - b.y) <= CHIP_FIT_EPSILON_PX &&
    Math.abs(a.width - b.width) <= CHIP_FIT_EPSILON_PX &&
    Math.abs(a.height - b.height) <= CHIP_FIT_EPSILON_PX
  );
}

/**
 * Grows a camera until every given section's title chip — counter-scaled at
 * the camera's own effective zoom — fits inside it with view padding. The
 * zoom depends on the camera width and the chip size depends on the zoom, so
 * this is a (rapidly converging) fixed point.
 */
function cameraFittingTitleChips(
  camera: Rect,
  widthPx: number,
  sections: ReadonlyArray<InteractiveCanvasObject>,
): Rect {
  let current = camera;
  for (let pass = 0; pass < CHIP_FIT_MAX_PASSES; pass += 1) {
    const zoom = widthPx / Math.max(1, current.width);
    let expanded = current;
    for (const section of sections) {
      if (section.text === "") continue;
      expanded = unionRects(
        expanded,
        inflateRect(sectionTitleChipWorldRect(section, zoom), VIEW_PADDING_PX),
      );
    }
    if (rectsAlmostEqual(expanded, current)) return current;
    current = expanded;
  }
  return current;
}

/**
 * Renders the whole board framed by its painted extents plus padding.
 * Everything painted on the board — every object rect, routed connection
 * polyline (including obstacle detours), connection label chip, icon caption
 * and zoom-scaled section title chip — lies fully inside the returned camera.
 */
export function renderBoardView(
  document: InteractiveCanvasDocument,
  opts: RenderViewOptions,
): RenderedView {
  const sections = document.objects.filter((object) => object.type === "section");
  const camera = cameraFittingTitleChips(
    inflateRect(paintedBounds(document), VIEW_PADDING_PX),
    opts.width,
    sections,
  );
  const chipZoom = opts.width / Math.max(1, camera.width);
  const rendered = renderSceneToSvg(
    document,
    {
      bounds: camera,
      objects: document.objects,
      connections: document.connections,
      obstacles: document.objects,
      chipZoom,
    },
    { width: opts.width },
  );
  return { ...rendered, camera };
}

/**
 * Renders one section: the camera covers the section frame, the painted
 * extents of all its descendants, every fully-internal connection (detours
 * and label chips included) and the zoom-scaled title chips, plus padding.
 *
 * Inclusion rule: anything whose painted extent intersects the camera is
 * retained — so boundary-crossing connections draw up to the camera edge,
 * visibly clipped by the viewBox rather than dropped — and the endpoint
 * objects of every retained connection are retained even when their own
 * rects lie outside the camera (the router needs their geometry, and a
 * partial edge must aim at its true endpoint). Off-camera endpoints render
 * without rasterizer-unsafe features (see the renderer's viewBox gating).
 *
 * Throws for an id that is not a section on this document.
 */
export function renderSectionView(
  document: InteractiveCanvasDocument,
  sectionId: string,
  opts: RenderViewOptions,
): RenderedView {
  const section = document.objects.find(
    (object) => object.id === sectionId && object.type === "section",
  );
  if (!section) {
    throw new Error(`renderSectionView: "${sectionId}" is not a section on this document`);
  }

  const descendantIds = sectionDescendantIds(document, sectionId);
  const memberIds = new Set([sectionId, ...descendantIds]);

  // Camera: frame ∪ member painted extents ∪ fully-internal edges. Boundary
  // edges deliberately do NOT grow the camera — they are shown clipped.
  let base: Rect = { ...section.geometry };
  for (const object of document.objects) {
    if (!descendantIds.has(object.id)) continue;
    base = unionRects(base, objectPaintedBounds(object));
  }
  for (const connection of document.connections) {
    const internal =
      memberIds.has(connection.from.objectId) && memberIds.has(connection.to.objectId);
    if (!internal) continue;
    const painted = connectionPaintedBounds(document, connection);
    if (painted) base = unionRects(base, painted);
  }
  const memberSections = document.objects.filter(
    (object) => object.type === "section" && memberIds.has(object.id),
  );
  const camera = cameraFittingTitleChips(
    inflateRect(base, VIEW_PADDING_PX),
    opts.width,
    memberSections,
  );
  const chipZoom = opts.width / Math.max(1, camera.width);

  // Retention by painted-extent intersection with the camera.
  const retainedObjectIds = new Set<string>();
  for (const object of document.objects) {
    let extent = objectPaintedBounds(object);
    if (object.type === "section" && object.text !== "") {
      extent = unionRects(extent, sectionTitleChipWorldRect(object, chipZoom));
    }
    if (rectsIntersect(extent, camera)) retainedObjectIds.add(object.id);
  }
  const connections = document.connections.filter((connection) => {
    const painted = connectionPaintedBounds(document, connection);
    return painted !== null && rectsIntersect(painted, camera);
  });
  for (const connection of connections) {
    retainedObjectIds.add(connection.from.objectId);
    retainedObjectIds.add(connection.to.objectId);
  }
  const objects = document.objects.filter((object) => retainedObjectIds.has(object.id));

  const rendered = renderSceneToSvg(
    document,
    { bounds: camera, objects, connections, obstacles: document.objects, chipZoom },
    { width: opts.width },
  );
  return { ...rendered, camera };
}
