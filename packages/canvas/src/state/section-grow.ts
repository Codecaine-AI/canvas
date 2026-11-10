/**
 * Section auto-grow, shared by every geometry commit: the agent's operation
 * pipeline (session/tools/operations/operation-tool.ts) and Studio's reducer
 * (state/actions/reducer.ts). One function, so a draft and its accept-time
 * replay derive the same frames.
 */
import { GEOMETRY_NORMALIZATION_GRID, sectionFitGeometry, type SectionFitPadding } from "./geometry";
import type { InteractiveCanvasDocument } from "./schema";
import { reconcileSectionMembership } from "./section-membership";

/**
 * The air a grown (or agent-fitted) frame keeps around its children: body air
 * on the left, right and bottom, plus a title band above the first child.
 * Both are multiples of the 20px agent grid. session/apply-ops.ts re-exports
 * it as SECTION_FIT_PADDING for fit_section.
 */
export const SECTION_AUTO_GROW_FIT = { padding: 40, titleClearance: 40 } as const;

/**
 * The air below which a child counts as intruding: 20px on the sides and
 * bottom, 40px on top (the title chip is 3px inset + 27px tall). A frame that
 * already keeps this much air is left alone, so a drawer's 20px-padded frames
 * do not move on the first edit; a frame that does not grows to the full fit.
 */
const GROW_TRIGGER: SectionFitPadding = { padding: 20, titleClearance: 20 };

const GRID = 20;

function snapOutward(rect: { x: number; y: number; width: number; height: number }, grid: number) {
  const left = Math.floor(rect.x / grid) * grid;
  const top = Math.floor(rect.y / grid) * grid;
  const right = Math.ceil((rect.x + rect.width) / grid) * grid;
  const bottom = Math.ceil((rect.y + rect.height) / grid) * grid;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Depth of an object in the section tree: 0 for a root. */
function sectionDepth(document: InteractiveCanvasDocument, id: string): number {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  let depth = 0;
  for (let parent = byId.get(id)?.parentId; parent != null; parent = byId.get(parent)?.parentId) {
    depth += 1;
    if (depth > byId.size) break; // a parent cycle is not a tree; stop rather than spin
  }
  return depth;
}

/** A grow that was not made because it would change membership. */
export type BlockedGrow = { section: string; captures: string[] };

/**
 * Every unlocked section whose child intrudes on its padding or title band
 * (or crosses its edge) grows outward to the fit air, snapped outward to the
 * 20 grid. Only an intruded side moves, and only outward, so a section never
 * shrinks on its own, and never past a locked parent's edge. Deepest sections go first, so a nested section's growth
 * reaches its ancestors in the same pass.
 *
 * Membership is derived from geometry, so a grow that would capture a
 * neighbor (or reparent anything) is not made and comes back in `blocked`
 * with the objects it would move. The caller decides: the agent path refuses
 * the edit, Studio keeps the human's drop. `document` must already have
 * reconciled membership. Each id in `held` keeps the parent it names while
 * the grows are judged, so a frame and its ancestors can grow together.
 */
export function growSectionsToChildren(
  document: InteractiveCanvasDocument,
  held?: ReadonlyMap<string, string | null>,
): { document: InteractiveCanvasDocument; grown: string[]; blocked: BlockedGrow[] } {
  const sections = document.objects
    .filter((object) => object.type === "section")
    .map((section) => ({ id: section.id, depth: sectionDepth(document, section.id) }))
    .sort((a, b) => b.depth - a.depth);
  let current = document;
  const grown: string[] = [];
  const blocked: BlockedGrow[] = [];
  for (const { id } of sections) {
    const section = current.objects.find((object) => object.id === id)!;
    if (section.locked) continue;
    const need = sectionFitGeometry(current, id, GROW_TRIGGER);
    if (!need) continue;
    const rect = section.geometry;
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    const past = {
      left: need.x < rect.x,
      top: need.y < rect.y,
      right: need.x + need.width > right,
      bottom: need.y + need.height > bottom,
    };
    if (!past.left && !past.top && !past.right && !past.bottom) continue;
    const fit = snapOutward(sectionFitGeometry(current, id, SECTION_AUTO_GROW_FIT)!, GRID);
    // A locked parent never moves, so a grow stops at its edge rather than
    // pushing this frame out of it.
    const parent = current.objects.find((object) => object.id === section.parentId);
    // The wall is snapped inward to the 4px grid, so the snapped frame stays inside it.
    const n = GEOMETRY_NORMALIZATION_GRID;
    const wall = parent?.locked
      ? {
          left: Math.ceil(parent.geometry.x / n) * n,
          top: Math.ceil(parent.geometry.y / n) * n,
          right: Math.floor((parent.geometry.x + parent.geometry.width) / n) * n,
          bottom: Math.floor((parent.geometry.y + parent.geometry.height) / n) * n,
        }
      : { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    const left = past.left ? Math.min(rect.x, Math.max(fit.x, wall.left)) : rect.x;
    const top = past.top ? Math.min(rect.y, Math.max(fit.y, wall.top)) : rect.y;
    const farRight = past.right ? Math.max(right, Math.min(fit.x + fit.width, wall.right)) : right;
    const farBottom = past.bottom ? Math.max(bottom, Math.min(fit.y + fit.height, wall.bottom)) : bottom;
    // A grow is a geometry write, so it lands on the 4px grid the reducer
    // normalizes every write to (snapped outward, so no side moves in): the
    // draft and its accept-time replay then hold the same numbers.
    // The wall clamp never pulls an edge in past where it was: an off-grid
    // edge already at a locked parent's off-grid edge stays where it is.
    const snapped = snapOutward({ x: left, y: top, width: farRight - left, height: farBottom - top }, n);
    const x = Math.min(rect.x, Math.max(snapped.x, wall.left));
    const y = Math.min(rect.y, Math.max(snapped.y, wall.top));
    const geometry = {
      x,
      y,
      width: Math.max(right, Math.min(snapped.x + snapped.width, wall.right)) - x,
      height: Math.max(bottom, Math.min(snapped.y + snapped.height, wall.bottom)) - y,
    };
    if (geometry.x === rect.x && geometry.y === rect.y && geometry.width === rect.width && geometry.height === rect.height) continue;
    const candidate = {
      ...current,
      objects: current.objects.map((object) => object.id === id ? { ...object, geometry } : object),
    };
    const parents = new Map(current.objects.map((object) => [object.id, object.parentId ?? null]));
    const captures = reconcileHolding(candidate, held).objects
      .filter((object) => parents.get(object.id) !== (object.parentId ?? null))
      .map((object) => object.id);
    if (captures.length > 0) {
      blocked.push({ section: id, captures });
      continue;
    }
    current = candidate;
    grown.push(id);
  }
  return { document: current, grown, blocked };
}

/**
 * How far each child crosses each edge of a section, in px (0 when it does
 * not), keyed by child id. The agent path compares it across an edit to a
 * section whose grow is blocked, so such an edit may not push any child
 * further out on any edge, even when another child already sits further out.
 */
export function sectionOverflow(document: InteractiveCanvasDocument, id: string) {
  const out = new Map<string, { left: number; top: number; right: number; bottom: number }>();
  const frame = document.objects.find((object) => object.id === id)?.geometry;
  if (!frame) return out;
  for (const { id: childId, geometry: g } of document.objects.filter((object) => object.parentId === id)) {
    out.set(childId, {
      left: Math.max(0, frame.x - g.x),
      top: Math.max(0, frame.y - g.y),
      right: Math.max(0, g.x + g.width - (frame.x + frame.width)),
      bottom: Math.max(0, g.y + g.height - (frame.y + frame.height)),
    });
  }
  return out;
}

/**
 * The section parent of each note whose text fit changed only its height
 * (top-left and width held) between `before` and `after`, keyed by note id,
 * and the `before` parent of every frame above it (null at the top level).
 * A fitted note that grew past its frame is still that frame's child: the
 * frame and its ancestors grow together to hold it rather than lose it
 * (objects/sticky/note-fit.ts).
 */
export function fittedNoteParents(
  before: InteractiveCanvasDocument,
  after: InteractiveCanvasDocument,
): Map<string, string | null> {
  const prior = new Map(before.objects.map((object) => [object.id, object]));
  const held = new Map<string, string | null>();
  for (const object of after.objects) {
    const was = prior.get(object.id);
    if (object.style?.shape !== "note" || !was?.parentId) continue;
    const a = was.geometry;
    const b = object.geometry;
    if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height === b.height) continue;
    for (let id: string | null = object.id; id !== null && !held.has(id); id = held.get(id)!) {
      held.set(id, prior.get(id)?.parentId ?? null);
    }
  }
  return held;
}

/**
 * Membership reconciled from geometry, except each id in `held` keeps the
 * parent it names (while that parent is still on the board; null keeps it at
 * the top level), so a section grow can catch up with it. The grow's last
 * reconcile then confirms it.
 */
export function reconcileHolding(
  document: InteractiveCanvasDocument,
  held: ReadonlyMap<string, string | null> = new Map(),
): InteractiveCanvasDocument {
  const reconciled = reconcileSectionMembership(document);
  if (held.size === 0) return reconciled;
  const ids = new Set(reconciled.objects.map((object) => object.id));
  return {
    ...reconciled,
    objects: reconciled.objects.map((object) => {
      const parentId = held.get(object.id);
      if (parentId === undefined || (parentId !== null && !ids.has(parentId)) || object.parentId === parentId) return object;
      return { ...object, parentId };
    }),
  };
}

/**
 * Each id in `held` (still on the board, with its held parent) whose parent
 * in `document` is not the one `held` names.
 */
export function heldMoves(
  document: InteractiveCanvasDocument,
  held: ReadonlyMap<string, string | null> = new Map(),
): { id: string; from: string | null; to: string | null }[] {
  const parents = new Map(document.objects.map((object) => [object.id, object.parentId ?? null]));
  return [...held].flatMap(([id, from]) => {
    const to = parents.get(id) ?? null;
    return parents.has(id) && (from === null || parents.has(from)) && to !== from ? [{ id, from, to }] : [];
  });
}

/**
 * Reconcile membership (holding `held`, see reconcileHolding), grow what can
 * grow, reconcile again (an identity on a grown tree).
 *
 * Holding judges the grows as if the held tree stayed. When the settled board
 * still moves a held object (a grown frame lands inside a neighbor), the grows
 * are judged on bare membership instead, which blocks that grow: the frame
 * keeps its parent, and a note it could not hold leaves it as before.
 */
export function settleSections(
  document: InteractiveCanvasDocument,
  held?: ReadonlyMap<string, string | null>,
): InteractiveCanvasDocument {
  const reconciled = reconcileHolding(document, held);
  const settled = reconcileSectionMembership(growSectionsToChildren(reconciled, held).document);
  if (heldMoves(settled, held).length === 0) return settled;
  return reconcileSectionMembership(growSectionsToChildren(reconciled).document);
}
