/**
 * Section auto-grow, shared by every geometry commit: the agent's operation
 * pipeline (session/tools/operations/operation-tool.ts) and Studio's reducer
 * (state/actions/reducer.ts). One function, so a draft and its accept-time
 * replay derive the same frames.
 */
import {
  GEOMETRY_NORMALIZATION_GRID,
  moveClosureIds,
  sectionFitGeometry,
  snapCanvasNumber,
  type CanvasBounds,
  type SectionFitPadding,
} from "./geometry";
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
export const GROW_TRIGGER = { padding: 20, titleClearance: 20 } as const satisfies SectionFitPadding;

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

/**
 * A grow that was not made because it would change membership. `pinned` names
 * the locked objects that kept make-room from pushing the captures clear.
 */
export type BlockedGrow = { section: string; captures: string[]; pinned?: string[] };

/** The siblings a grown section pushed clear of itself (each travels with what it holds). */
export type MadeRoom = { section: string; pushed: string[] };

/**
 * The gutter a push leaves between a grown section and the neighbour it moves:
 * the gutter they had, but never under MIN_GUTTER and never over KEPT_GUTTER.
 * So a wide gutter is used up first and only then does the neighbour move,
 * which keeps a board's rows and columns lined up until a grow really runs
 * out of room. A gutter that labelled wires cross is never left under the
 * room their label chips need (`LabelRoom`).
 */
const MIN_GUTTER = 40;
const KEPT_GUTTER = 100;

/**
 * The clear space the label chips of the wires that join two sets of boxes
 * need between them along `axis`, 0 when no labelled wire joins them. The
 * agent path passes connectors/label-placement.ts labelledGapPx.
 */
export type LabelRoom = (
  document: InteractiveCanvasDocument,
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
  axis: "x" | "y",
) => number;

/**
 * Make room for a section that grew from `was`: every sibling in the way of a
 * grown side moves away along that side's direction, with everything it holds,
 * and pushes the siblings in its own way in turn. `document` holds the section
 * at its grown geometry. A sibling is in the way of a side when it sits beyond
 * that side's old edge, level with the frame, nearer than the gutter above.
 *
 * All or nothing: when a push would move a locked object, or carry a sibling
 * past a locked ancestor's edge, nothing is pushed and the locks are named.
 */
function makeRoom(
  document: InteractiveCanvasDocument,
  sectionId: string,
  was: CanvasBounds,
  labelRoom?: LabelRoom,
): { document: InteractiveCanvasDocument; pushed: string[] } | { pinned: string[] } {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const section = byId.get(sectionId)!;
  const now = section.geometry;
  const parentId = section.parentId ?? null;
  // The nearest locked ancestor is a wall no push may cross; one locked "all" freezes what it holds.
  let wall: CanvasBounds | null = null;
  let wallId: string | null = null;
  for (let id = parentId, hops = 0; id !== null && hops <= byId.size; id = byId.get(id)?.parentId ?? null, hops += 1) {
    const ancestor = byId.get(id);
    if (!ancestor) break;
    if (ancestor.locked === "all") return { pinned: [ancestor.id] };
    if (ancestor.locked && wall === null) {
      wall = ancestor.geometry;
      wallId = ancestor.id;
    }
  }
  const sides = [
    { axis: "x", sign: 1, grew: now.x + now.width > was.x + was.width },
    { axis: "y", sign: 1, grew: now.y + now.height > was.y + was.height },
    { axis: "x", sign: -1, grew: now.x < was.x },
    { axis: "y", sign: -1, grew: now.y < was.y },
  ] as const;
  let current = document;
  const pushed = new Set<string>();
  const pinned = new Set<string>();
  for (const { axis, sign, grew } of sides) {
    if (!grew) continue;
    const size = axis === "x" ? "width" : "height";
    const cross = axis === "x" ? "y" : "x";
    const crossSize = axis === "x" ? "height" : "width";
    // Along the push direction: `near` is the edge that faces the pusher, `far` the one that leads.
    const near = (rect: CanvasBounds) => (sign > 0 ? rect[axis] : -(rect[axis] + rect[size]));
    const far = (rect: CanvasBounds) => (sign > 0 ? rect[axis] + rect[size] : -rect[axis]);
    const level = (a: CanvasBounds, b: CanvasBounds) =>
      Math.min(a[cross] + a[crossSize], b[cross] + b[crossSize]) > Math.max(a[cross], b[cross]);
    const pushers = [{ id: sectionId, rect: now, from: far(was), to: far(now) }];
    // A sibling is only pushed by one whose middle sits before its own, so one pass in that order settles the cascade.
    const siblings = current.objects
      .filter((object) => object.id !== sectionId && (object.parentId ?? null) === parentId)
      .sort((a, b) => near(a.geometry) + far(a.geometry) - (near(b.geometry) + far(b.geometry)));
    const shifts = new Map<string, number>();
    for (const sibling of siblings) {
      const rect = sibling.geometry;
      let shift = 0;
      for (const pusher of pushers) {
        if (!level(pusher.rect, rect) || (near(rect) + far(rect)) / 2 <= pusher.from) continue;
        const room = labelRoom?.(current, moveClosureIds(current, [pusher.id]), moveClosureIds(current, [sibling.id]), axis) ?? 0;
        const gutter = Math.max(Math.min(Math.max(near(rect) - pusher.from, MIN_GUTTER), KEPT_GUTTER), room);
        shift = Math.max(shift, pusher.to + gutter - near(rect));
      }
      if (shift <= 0) continue;
      shift = Math.ceil(shift / GRID) * GRID;
      shifts.set(sibling.id, shift);
      pushers.push({ id: sibling.id, rect, from: far(rect), to: far(rect) + shift });
    }
    if (shifts.size === 0) continue;
    const delta = new Map<string, number>();
    for (const [id, shift] of shifts) {
      pushed.add(id);
      for (const carried of moveClosureIds(current, [id])) {
        delta.set(carried, sign * shift);
        if (byId.get(carried)?.locked) pinned.add(carried);
      }
    }
    current = {
      ...current,
      objects: current.objects.map((object) => {
        const by = delta.get(object.id);
        if (by === undefined) return object;
        // A push is a geometry write, so it lands on the grid the reducer normalizes every write to.
        const start = snapCanvasNumber(object.geometry[axis] + by, GEOMETRY_NORMALIZATION_GRID);
        return { ...object, geometry: { ...object.geometry, [axis]: start } };
      }),
    };
    if (wall && wallId) {
      const outside = current.objects.some((object) => {
        if (!shifts.has(object.id)) return false;
        const g = object.geometry;
        return g.x < wall.x || g.y < wall.y || g.x + g.width > wall.x + wall.width || g.y + g.height > wall.y + wall.height;
      });
      if (outside) pinned.add(wallId);
    }
  }
  if (pinned.size > 0) return { pinned: [...pinned] };
  return { document: current, pushed: [...pushed] };
}

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
 *
 * With `makeRoom` (the agent path), a grown section first pushes the siblings
 * in its way clear (see makeRoom), so a grow into an unlocked neighbour is
 * made rather than blocked. Each pushed sibling keeps its parent, which then
 * grows to hold it and makes room in turn. The returned `held` is `held` plus
 * those siblings. Studio does not pass it: a person's drop moves nothing else.
 * `labelRoom` widens the gutter a push leaves to the room its label chips need.
 */
export function growSectionsToChildren(
  document: InteractiveCanvasDocument,
  held?: ReadonlyMap<string, string | null>,
  options: { makeRoom?: boolean; labelRoom?: LabelRoom } = {},
): {
  document: InteractiveCanvasDocument;
  grown: string[];
  blocked: BlockedGrow[];
  pushed: MadeRoom[];
  held: ReadonlyMap<string, string | null>;
} {
  const sections = document.objects
    .filter((object) => object.type === "section")
    .map((section) => ({ id: section.id, depth: sectionDepth(document, section.id) }))
    .sort((a, b) => b.depth - a.depth);
  let current = document;
  let keep: ReadonlyMap<string, string | null> = held ?? new Map();
  const grown: string[] = [];
  const blocked: BlockedGrow[] = [];
  const pushed: MadeRoom[] = [];
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
    const capturesIn = (grownDocument: InteractiveCanvasDocument, holding: ReadonlyMap<string, string | null>) =>
      reconcileHolding(grownDocument, holding).objects
        .filter((object) => parents.get(object.id) !== (object.parentId ?? null))
        .map((object) => object.id);
    const room = options.makeRoom ? makeRoom(candidate, id, rect, options.labelRoom) : null;
    if (room && "document" in room && room.pushed.length > 0) {
      const holding = new Map([...keep, ...room.pushed.map((pushedId) => [pushedId, parents.get(pushedId) ?? null] as const)]);
      if (capturesIn(room.document, holding).length === 0) {
        current = room.document;
        keep = holding;
        grown.push(id);
        pushed.push({ section: id, pushed: room.pushed });
        continue;
      }
    }
    const captures = capturesIn(candidate, keep);
    if (captures.length > 0) {
      blocked.push(room && "pinned" in room ? { section: id, captures, pinned: room.pinned } : { section: id, captures });
      continue;
    }
    current = candidate;
    grown.push(id);
  }
  return { document: current, grown, blocked, pushed, held: keep };
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
 * still moves a held object (a grown frame lands inside a neighbor), only that
 * object's hold is dropped and the grows run again, so a grow that would move
 * it is blocked and every other group keeps its hold. A note its frame then
 * cannot hold moves in the next round and is dropped too. Each round drops at
 * least one hold, so this ends.
 */
export function settleSections(
  document: InteractiveCanvasDocument,
  held: ReadonlyMap<string, string | null> = new Map(),
): InteractiveCanvasDocument {
  const keep = new Map(held);
  for (;;) {
    const settled = reconcileSectionMembership(growSectionsToChildren(reconcileHolding(document, keep), keep).document);
    const moved = heldMoves(settled, keep);
    if (moved.length === 0) return settled;
    for (const { id } of moved) keep.delete(id);
  }
}
