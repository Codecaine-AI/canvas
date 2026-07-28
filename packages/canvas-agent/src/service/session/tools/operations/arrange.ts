/**
 * The Arrange group — `move_to`, `move_by`, `resize`, `match_size`, `align`, `space_out`
 * (docs/30-agent-layout/50-tool-surface/10-gestures §Arrange).
 *
 * These are the six gestures that write geometry and nothing else, so they
 * share three rules that live here rather than being restated per descriptor:
 *
 * FRAMES TRAVEL WHOLE. Moving a section moves everything it holds — the
 * agent-path equivalent of dragging a frame in the UI (`translateWithDescendants`
 * / `alignWithDescendants` / `spaceOutObjects` in the canvas package's geometry
 * engine, which expand a listed section over its descendants and translate the
 * closed set rigidly). Because every member of that set moves by the same
 * delta, relative geometry is preserved and containment cannot change on a
 * move; the factory's membership reconcile is an identity afterwards (asserted
 * in the tests). `resize` and `match_size` are the deliberate exceptions: a
 * frame's NEW edges decide what it contains, so the same reconcile adopts and
 * releases there.
 *
 * BOXES ONLY. Every id these gestures take must name an object or a section.
 * A connection has no box to position — it is a wire between two of them and
 * re-routes itself whenever they move — so a connection id is an error with a
 * redirect rather than a silent skip (`requirePositionable`).
 *
 * THE GRID IS ABOUT WHAT LANDS, NOT WHAT WAS ASKED FOR. Every geometry field
 * these gestures WRITE lands on the agent grid (grid.ts, AGENT_GRID = 20), so
 * it is the RESULT that is quantized, never merely the argument: a `move_by`
 * off an off-grid box snaps the corner it lands on rather than the delta it was
 * given, `align` snaps the shared coordinate the whole row agrees on, and
 * `space_out` snaps each position it computes (which makes the gap approximate
 * when a box starts off-grid — the summary reports the positions that landed,
 * so the next gesture reasons from the board's real numbers). 20-multiples pass
 * through the write path's own grid-4 normalization untouched, which is what
 * makes the reported number and the stored number the same number.
 *
 * What a gesture does NOT write, it does not snap: a width-only `resize` leaves
 * a legacy off-grid height alone, and descendants carried by a moving frame
 * travel by their root's snapped delta rather than being dragged onto the grid
 * individually — a frame's children keep their exact relative geometry, which
 * is the whole meaning of carrying them.
 *
 * LOCKS GATE EVERY ONE OF THESE. A box under a lock refuses to move or resize
 * (`requireUnlocked`, op-context.ts); `match_size`'s `like` source is only
 * measured, never written, so a locked box can still be matched.
 *
 * SIZE HAS RULES. `resize` and `match_size` measure the new box against the
 * text already in it with the renderer's own wrap/clamp decision
 * (board/text-fit.ts) and attach the verdict as a note when the text would
 * clip. Report-only — the size still lands — and the mirror image of the check
 * `update_text` fires from the other direction (new text into the current box).
 */
import { StringEnum, Type } from "@mariozechner/pi-ai";

import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import {
  alignWithDescendants,
  moveRootIds,
  spaceOutObjects,
  translateWithDescendants,
  type CanvasAlignEdge,
} from "../../../../../../canvas/src/state/geometry";

import { textFitReport } from "../../../../board/text-fit";
import { applyOperationToDraft, resolveSizeLike } from "../../apply-ops";
import { snapCoordinate, snapGap, snapPoint, snapSize } from "../grid";
import type { OpContext, OpOutcome } from "./op-context";
import { defineOperationTool } from "./operation-tool";
import { Id } from "../schemas";

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

/** Board numbers print whole; only a legacy off-grid box ever needs the decimal. */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function point(x: number, y: number): string {
  return `(${num(x)}, ${num(y)})`;
}

function signed(value: number): string {
  return value >= 0 ? `+${num(value)}` : num(value);
}

function objectOf(ctx: OpContext, id: string): InteractiveCanvasObject {
  // Every caller has passed requirePositionable, so this is total.
  return ctx.draft.objects.find((object) => object.id === id)!;
}

/**
 * Lower a whole recomputed objects array onto the draft as ordinary geometry
 * updates — one `updateObject` per box that actually moved or resized.
 *
 * The geometry engine returns entire objects (it is a pure model-layer
 * function), but only the box changed, and routing every write through the
 * draft applier keeps one mutation door: agent geometry normalizes exactly the
 * way a human edit does (`mergeObjectPatch`), and the accept-time diff sees the
 * same per-object shape it sees from every other descriptor.
 *
 * An unchanged array comes back as an unchanged document, which the operation
 * factory reports as the no-op it is.
 */
function lowerGeometry(
  before: InteractiveCanvasDocument,
  after: readonly InteractiveCanvasObject[],
): { document: InteractiveCanvasDocument; changedIds: string[] } {
  const byId = new Map(before.objects.map((object) => [object.id, object]));
  let document = before;
  const changedIds: string[] = [];
  for (const object of after) {
    const current = byId.get(object.id);
    if (!current) continue;
    const geometry = object.geometry;
    if (
      current.geometry.x === geometry.x
      && current.geometry.y === geometry.y
      && current.geometry.width === geometry.width
      && current.geometry.height === geometry.height
    ) continue;
    document = applyOperationToDraft(document, {
      type: "updateObject",
      objectId: object.id,
      patch: { geometry },
    }).document;
    changedIds.push(object.id);
  }
  return { document, changedIds };
}

/**
 * Apply one extra translation per move root to a geometry result that has
 * already been computed — the second pass that puts the multi-id gestures'
 * written coordinates on the grid.
 *
 * The engine (`alignWithDescendants` / `spaceOutObjects`) decides what the
 * gesture MEANS; this decides where the meaning lands. Move roots are disjoint
 * closures by construction (`moveRootIds`), so no object is claimed by two
 * deltas and the order the corrections are applied in cannot matter.
 */
function retranslate(
  document: InteractiveCanvasDocument,
  deltas: ReadonlyMap<string, { dx: number; dy: number }>,
): InteractiveCanvasDocument {
  let next = document;
  for (const [rootId, delta] of deltas) {
    if (delta.dx === 0 && delta.dy === 0) continue;
    next = { ...next, objects: translateWithDescendants(next, [rootId], delta) };
  }
  return next;
}

/** Whether an align edge acts on x (a shared vertical line) or on y. */
function alignsHorizontally(edge: CanvasAlignEdge): boolean {
  return edge === "left" || edge === "right" || edge === "center_h" || edge === "center-x";
}

/**
 * The single number an aligned row agrees on: a shared left/right edge, or a
 * shared center. This — not each box's corner — is what the gesture computes,
 * so this is what the grid quantizes; each box's own corner then follows from
 * it and its width. For the four edge alignments that puts every corner on the
 * grid whenever the boxes' extents are (which every agent-written box's are).
 * Centering a box of odd-grid-multiple width is the documented exception: the
 * shared center lands on 20 and the corner falls half an extent from it,
 * because a shared center IS the gesture and cannot be given up to round a
 * corner.
 */
function sharedAlignCoordinate(
  geometry: { x: number; y: number; width: number; height: number },
  edge: CanvasAlignEdge,
): number {
  if (edge === "left") return geometry.x;
  if (edge === "right") return geometry.x + geometry.width;
  if (edge === "center_h" || edge === "center-x") return geometry.x + geometry.width / 2;
  if (edge === "top") return geometry.y;
  if (edge === "bottom") return geometry.y + geometry.height;
  return geometry.y + geometry.height / 2;
}

/** `carrying N` when a section took contents along, nothing when it did not. */
function carriedSuffix(changedIds: readonly string[], rootIds: readonly string[]): string {
  const roots = new Set(rootIds);
  const carried = changedIds.filter((id) => !roots.has(id)).length;
  return carried > 0 ? ` (carrying ${carried})` : "";
}

// ---------------------------------------------------------------------------
// move_to / move_by
// ---------------------------------------------------------------------------

/**
 * The one body both move forms share: a rigid delta, expanded over any listed
 * section's descendants, lowered, and summarized by where the named box landed.
 */
function translate(
  ctx: OpContext,
  id: string,
  delta: { dx: number; dy: number },
  gesture: (landed: { x: number; y: number }) => string,
): OpOutcome {
  const moved = translateWithDescendants(ctx.draft, [id], delta);
  const { document, changedIds } = lowerGeometry(ctx.draft, moved);
  const landed = (document.objects.find((object) => object.id === id) ?? objectOf(ctx, id))
    .geometry;
  return {
    status: "applied",
    draft: document,
    summary: `${gesture(landed)}${carriedSuffix(changedIds, [id])}`,
  };
}

export const moveTo = defineOperationTool({
  name: "move_to",
  description:
    "Put a box's top-left corner at a point on the board. A section takes everything it holds with it, so what it contains never changes. The point lands on the board's grid, and the result reports where the box actually is.",
  fields: {
    id: Id,
    x: Type.Number({ description: "New left edge, in board coordinates." }),
    y: Type.Number({ description: "New top edge, in board coordinates." }),
  },
  validate: (ctx, p) => {
    const errors = ctx.requirePositionable(p.id);
    return errors.length > 0 ? errors : ctx.requireUnlocked(p.id);
  },
  apply: (ctx, p) => {
    const target = objectOf(ctx, p.id);
    // An absolute target IS the coordinate that lands, so snapping the
    // argument and snapping the result are the same operation here.
    const [x, y] = snapPoint([p.x, p.y]);
    return translate(
      ctx,
      p.id,
      { dx: x - target.geometry.x, dy: y - target.geometry.y },
      (landed) => `move_to ${p.id} → ${point(landed.x, landed.y)}`,
    );
  },
});

export const moveBy = defineOperationTool({
  name: "move_by",
  description:
    "Nudge a box by an offset from where it already is. A section takes everything it holds with it, so what it contains never changes. The offset lands on the board's grid, and the result reports where the box ended up.",
  fields: {
    id: Id,
    dx: Type.Number({ description: "Rightward offset; negative moves left." }),
    dy: Type.Number({ description: "Downward offset; negative moves up." }),
  },
  validate: (ctx, p) => {
    const errors = ctx.requirePositionable(p.id);
    return errors.length > 0 ? errors : ctx.requireUnlocked(p.id);
  },
  apply: (ctx, p) => {
    const current = objectOf(ctx, p.id).geometry;
    // Snap the CORNER THE NUDGE LANDS ON, not the nudge. Snapping the delta
    // would leave an off-grid box off-grid forever (16 + 20 = 36), and a nudge
    // off a hand-drawn box is exactly when the grid earns its keep. The
    // reported delta is therefore the one that was actually applied.
    const [x, y] = snapPoint([current.x + p.dx, current.y + p.dy]);
    const dx = x - current.x;
    const dy = y - current.y;
    return translate(
      ctx,
      p.id,
      { dx, dy },
      (landed) =>
        `move_by ${p.id} ${signed(dx)},${signed(dy)} → ${point(landed.x, landed.y)}`,
    );
  },
});

// ---------------------------------------------------------------------------
// resize / match_size
// ---------------------------------------------------------------------------

/**
 * Lower a size change and report the dimensions that actually landed.
 *
 * Both size gestures hold the top-left corner still, take their readability
 * verdict from the landed box, and rely on the operation factory's shared
 * membership reconcile so a section's new edges adopt and release contents.
 */
function applySize(
  ctx: OpContext,
  id: string,
  size: { width: number; height: number },
  summary: (landed: { width: number; height: number }) => string,
): OpOutcome {
  const target = objectOf(ctx, id);
  const { document } = lowerGeometry(ctx.draft, [
    { ...target, geometry: { ...target.geometry, ...size } },
  ]);
  // Read the size back off the document rather than reporting the one that
  // was computed: the write path normalizes on its own grid, so an untouched
  // legacy dimension can come back a hair different from the one carried in,
  // and the summary has to be the board's number, not the descriptor's.
  const landed = (document.objects.find((object) => object.id === id) ?? target).geometry;
  // The readability verdict is taken on the box that LANDED.
  const report = textFitReport(target, landed, target.text ?? "");
  return {
    status: "applied",
    draft: document,
    summary: summary(landed),
    ...(report.fits ? {} : { notes: [report.detail] }),
  };
}

export const resize = defineOperationTool({
  name: "resize",
  description:
    "Re-size a box to explicit dimensions, holding its top-left corner still so it grows or shrinks toward its bottom-right. Matching another box is match_size's job. A section's new edges decide what it now contains, so it can adopt or release as it changes. Dimensions land on the board's grid, and a box that no longer shows its text still applies, with a warning naming the size it would need.",
  fields: {
    id: Id,
    width: Type.Optional(
      Type.Number({
        description: "New width. Omit to keep the current one.",
      }),
    ),
    height: Type.Optional(
      Type.Number({
        description: "New height. Omit to keep the current one.",
      }),
    ),
  },
  validate: (ctx, p) => {
    const errors = ctx.requirePositionable(p.id);
    if (errors.length === 0) errors.push(...ctx.requireUnlocked(p.id));
    const hasDimensions = p.width !== undefined || p.height !== undefined;
    if (!hasDimensions) {
      errors.push(
        "resize needs a width or a height — as written it asks for no change.",
      );
    }
    return errors;
  },
  apply: (ctx, p) => {
    const current = objectOf(ctx, p.id).geometry;
    const requested = {
      width: p.width ?? current.width,
      height: p.height ?? current.height,
    };
    const snapped = snapSize(requested);
    // Snap only what the gesture actually asked for: a width-only resize must
    // not drag a legacy off-grid height onto the grid behind the model's back.
    const size = {
      width: p.width !== undefined ? snapped.width : current.width,
      height: p.height !== undefined ? snapped.height : current.height,
    };
    return applySize(
      ctx,
      p.id,
      size,
      (landed) => `resize ${p.id} → ${num(landed.width)}×${num(landed.height)}`,
    );
  },
});

export const matchSize = defineOperationTool({
  name: "match_size",
  description:
    "Make a box the same width and height as another box, holding its top-left corner still. The source is only measured, so it can be locked. A section's new edges decide what it now contains, so it can adopt or release as it changes. Both dimensions land on the board's grid, and a box that no longer shows its text still applies, with a warning naming the size it would need.",
  fields: {
    id: Id,
    like: Type.String({
      ...Id,
      description: "The different box whose width and height are copied.",
    }),
  },
  validate: (ctx, p) => {
    const errors = ctx.requirePositionable(p.id);
    if (errors.length === 0) errors.push(...ctx.requireUnlocked(p.id));
    errors.push(...ctx.requirePositionable(p.like, "like"));
    if (p.like === p.id) {
      errors.push(
        "a box cannot be its own size source — use resize with width or height for explicit dimensions.",
      );
    }
    return errors;
  },
  apply: (ctx, p) => {
    // `like` is measured, never written. A locked source is valid because
    // matching changes only the target.
    const source = resolveSizeLike(ctx.draft, p.like)!;
    // Matching a peer copies its size onto the grid, including when the source
    // is a hand-drawn off-grid box.
    const size = snapSize(source);
    return applySize(
      ctx,
      p.id,
      size,
      (landed) =>
        `match_size ${p.id} → ${num(landed.width)}×${num(landed.height)} (matching ${p.like})`,
    );
  },
});

// ---------------------------------------------------------------------------
// align
// ---------------------------------------------------------------------------

const AlignEdge = StringEnum(
  ["left", "right", "top", "bottom", "center_h", "center_v"],
  {
    description:
      "The edge the boxes share afterwards. center_h puts every box on one center x, center_v on one center y.",
  },
);

const ArrangeIds = Type.Array(Id, {
  minItems: 2,
  description: "The boxes to arrange. Sections arrange as one unit and carry their contents.",
});

/**
 * Both multi-id gestures need two boxes that can move INDEPENDENTLY, which the
 * schema's `minItems` cannot promise on its own: an id a listed section already
 * carries has no position of its own to align or re-pitch, so it drops out of
 * the gesture (`moveRootIds`) and a pair can collapse to one. Saying that is
 * worth a turn; silently doing nothing is not.
 */
function requireIndependentRoots(
  ctx: OpContext,
  ids: readonly string[],
  gesture: string,
): string[] {
  const errors = ids.flatMap((id) => ctx.requirePositionable(id, "ids"));
  if (errors.length > 0) return errors;
  // Every listed id is written by these gestures, so every one of them is
  // lock-gated — one locked box refuses the whole arrangement rather than
  // silently dropping out of it and leaving the row half-aligned.
  const locked = ids.flatMap((id) => ctx.requireUnlocked(id, "ids"));
  if (locked.length > 0) return locked;
  const roots = moveRootIds(ctx.draft, ids);
  if (roots.length >= 2) return [];
  return [
    `${gesture} needs at least two boxes that move independently — `
    + (ids.length < 2
      ? "one box has nothing to arrange against."
      : "the ids given all travel inside one listed section, which moves as a single unit."),
  ];
}

/**
 * The coordinate every aligned box now agrees on, read off the LANDED
 * document — so the number in the summary is the number in the board, which is
 * what makes the shared coordinate's snap visible to the model.
 */
function alignedCoordinate(
  object: InteractiveCanvasObject,
  edge: CanvasAlignEdge,
): string {
  const value = num(sharedAlignCoordinate(object.geometry, edge));
  if (edge === "left") return `left edges at x=${value}`;
  if (edge === "right") return `right edges at x=${value}`;
  if (edge === "center_h" || edge === "center-x") return `centers at x=${value}`;
  if (edge === "top") return `top edges at y=${value}`;
  if (edge === "bottom") return `bottom edges at y=${value}`;
  return `centers at y=${value}`;
}

export const align = defineOperationTool({
  name: "align",
  description:
    "Put a row or column of boxes on one shared edge. This is the cross-axis gesture — it never changes spacing along the flow. Sections align by their own frame and carry their contents; edges are not targets, they re-route themselves.",
  fields: { ids: ArrangeIds, edge: AlignEdge },
  validate: (ctx, p) => requireIndependentRoots(ctx, p.ids, "align"),
  apply: (ctx, p) => {
    const edge = p.edge as CanvasAlignEdge;
    // The move roots are what actually aligned; a child of a listed section
    // travelled with its frame, so it is neither named nor measured here.
    const roots = moveRootIds(ctx.draft, p.ids);
    const aligned = alignWithDescendants(ctx.draft, p.ids, edge);
    // Put the shared coordinate on the grid by nudging the WHOLE row by one
    // drift: every root moves by the same amount, so the edge they now share
    // stays exactly shared and lands on a 20.
    const alignedRoot = aligned.objects.find((object) => object.id === roots[0])!;
    const shared = sharedAlignCoordinate(alignedRoot.geometry, edge);
    const drift = snapCoordinate(shared) - shared;
    const horizontal = alignsHorizontally(edge);
    const snappedAlignment = retranslate(
      aligned,
      new Map(roots.map((id) => [
        id,
        horizontal ? { dx: drift, dy: 0 } : { dx: 0, dy: drift },
      ])),
    );
    const { document, changedIds } = lowerGeometry(ctx.draft, snappedAlignment.objects);
    const measured = document.objects.find((object) => object.id === roots[0])!;
    return {
      status: "applied",
      draft: document,
      summary: `align ${p.edge} · ${roots.join(", ")} → ${alignedCoordinate(measured, edge)}`
        + carriedSuffix(changedIds, roots),
    };
  },
});

// ---------------------------------------------------------------------------
// space_out
// ---------------------------------------------------------------------------

const SpaceAxis = StringEnum(["horizontal", "vertical"], {
  description: "The flow the boxes are re-pitched along.",
});

/**
 * Re-chain a spaced run so every position the gesture WRITES lands on the grid.
 *
 * The first box holds — it is not written, so it is not snapped, off-grid or
 * not — and each later box takes the snapped coordinate one gap past the box
 * before it, with the correction carried forward so the run cannot accumulate
 * drift. The clear gap is therefore approximate (within half a grid unit) when
 * a box's own extent is off-grid, which is the trade the spec's snap-not-reject
 * rule takes everywhere: the summary reports the positions that landed, so the
 * model reads the truth rather than the arithmetic it asked for.
 */
function snapRun(
  spaced: InteractiveCanvasDocument,
  rootIds: readonly string[],
  horizontal: boolean,
  gap: number,
): InteractiveCanvasDocument {
  const byId = new Map(spaced.objects.map((object) => [object.id, object]));
  const start = (object: InteractiveCanvasObject): number =>
    horizontal ? object.geometry.x : object.geometry.y;
  const extent = (object: InteractiveCanvasObject): number =>
    horizontal ? object.geometry.width : object.geometry.height;
  const run = rootIds
    .map((id) => byId.get(id))
    .filter((object): object is InteractiveCanvasObject => object !== undefined)
    .sort((a, b) => start(a) - start(b));
  if (run.length < 2) return spaced;

  const deltas = new Map<string, { dx: number; dy: number }>();
  let trailingEdge = start(run[0]!) + extent(run[0]!);
  for (const object of run.slice(1)) {
    const target = snapCoordinate(trailingEdge + gap);
    const offset = target - start(object);
    if (offset !== 0) {
      deltas.set(object.id, horizontal ? { dx: offset, dy: 0 } : { dx: 0, dy: offset });
    }
    trailingEdge = target + extent(object);
  }
  return retranslate(spaced, deltas);
}

export const spaceOut = defineOperationTool({
  name: "space_out",
  description:
    "Re-pitch boxes in place so the clear gap between neighbours is exactly what you ask for. In positional order along the flow the first box holds and every later one slides; the run grows or shrinks to suit, and the cross axis is untouched. This is the corridor-opening fix for crowding. Sections re-pitch by their own frame and carry their contents; edges are not targets, they re-route themselves.",
  fields: {
    ids: ArrangeIds,
    axis: SpaceAxis,
    gap: Type.Number({
      description: "The clear space to leave between neighbouring boxes, in board units.",
    }),
  },
  validate: (ctx, p) => requireIndependentRoots(ctx, p.ids, "space_out"),
  apply: (ctx, p) => {
    const gap = snapGap(p.gap);
    const horizontal = p.axis === "horizontal";
    const roots = moveRootIds(ctx.draft, p.ids);
    const spaced = spaceOutObjects(
      ctx.draft,
      p.ids,
      p.axis as "horizontal" | "vertical",
      gap,
    );
    const { document, changedIds } = lowerGeometry(
      ctx.draft,
      snapRun(spaced, roots, horizontal, gap).objects,
    );
    const byId = new Map(document.objects.map((object) => [object.id, object]));
    // Positional order along the flow is what the gesture re-pitched by, so it
    // is the order the summary reports the landed run in.
    const run = roots
      .map((id) => byId.get(id)!)
      .sort((a, b) =>
        horizontal ? a.geometry.x - b.geometry.x : a.geometry.y - b.geometry.y)
      .map((object) =>
        `${object.id} ${horizontal ? "x" : "y"}=`
        + num(horizontal ? object.geometry.x : object.geometry.y))
      .join(", ");
    return {
      status: "applied",
      draft: document,
      summary: `space_out ${p.axis} gap ${num(gap)} · ${run}`
        + carriedSuffix(changedIds, roots),
    };
  },
});
