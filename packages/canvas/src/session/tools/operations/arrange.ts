/**
 * The Arrange group — `move`, `resize`, `arrange`, `arrange_section`
 * (docs/10-system-design/70-agent-tool-surface/20-gestures §Arrange).
 *
 * These are the gestures that write geometry and nothing else, so they
 * share three rules that live here rather than being restated per descriptor:
 *
 * FRAMES TRAVEL WHOLE. Moving a section moves everything it holds — the
 * agent-path equivalent of dragging a frame in the UI (`translateWithDescendants`
 * / `alignWithDescendants` / `spaceOutObjects` in the canvas package's geometry
 * engine, which expand a listed section over its descendants and translate the
 * closed set rigidly). Because every member of that set moves by the same
 * delta, relative geometry is preserved and containment cannot change on a
 * move; the factory's membership reconcile is an identity afterwards (asserted
 * in the tests). `resize`, in both its modes, is the deliberate exception: a
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
 * it is the RESULT that is quantized, never merely the argument: a `move` `by`
 * off an off-grid box snaps the corner it lands on rather than the delta it was
 * given, `arrange` `align` snaps the shared coordinate the whole row agrees on,
 * and `arrange` `space` snaps each position it computes (which makes the gap approximate
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
 * (`requireUnlocked`, op-context.ts); `resize`'s `like` source is only
 * measured, never written, so a locked box can still be matched.
 *
 * SIZE HAS RULES. `resize`, with explicit dimensions or with `like`, measures
 * the new box against the text already in it with the renderer's own
 * wrap/clamp decision (board/text-fit.ts). A shape or icon asked to be smaller
 * than its text needs lands at the needed size instead, top-left still held,
 * and its row and column peers grow with it (auto-size.ts) — the mirror image
 * of `update_text` growing a box for new text. A sticky or section still lands
 * as asked, with the verdict as a note.
 */
import { StringEnum, Type } from "@mariozechner/pi-ai";

import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "../../../state/schema";
import {
  alignWithDescendants,
  moveRootIds,
  spaceOutObjects,
  translateWithDescendants,
  type CanvasAlignEdge,
} from "../../../state/geometry";

import { textFitReport } from "../../../board/text-fit";
import { autoSizeObjects } from "./auto-size";
import { CRAFT_TARGETS } from "../../../authoring/style-guide/craft-targets";
import { hitBoundsForObject } from "../../../objects/geometry";
import { connectionLabelChipMetrics } from "../../../connectors/label-chip";
import { LABELLED_GAP_AIR_PX, drawnRectOf, paintedRects } from "../../../connectors/label-placement";
import { entityKindOf } from "../../perception/op-surface";
import {
  SECTION_FIT_PADDING,
  applyOperationToDraft,
  resolveSizeLike,
} from "../../apply-ops";
import {
  AGENT_GRID,
  snapCoordinate,
  snapGap,
  snapPoint,
  snapRectOutward,
  snapSize,
} from "../grid";
import { ArrangeFlow, flowErrors, flowRun, type ArrangeFlowParams } from "./flow";
import type { OpContext, OpOutcome } from "./op-context";
import { defineOperationTool } from "./operation-tool";
import {
  ArrangeSectionParams,
  Id,
  nullable,
  nullableEnum,
  nullableId,
  nullableNumber,
} from "../schemas";

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
// move
// ---------------------------------------------------------------------------

/**
 * The one body both move modes share: a rigid delta, expanded over any listed
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

const MovePoint = Type.Object(
  {
    x: Type.Number({ description: "New left edge, in board coordinates." }),
    y: Type.Number({ description: "New top edge, in board coordinates." }),
  },
  { additionalProperties: false },
);

const MoveOffset = Type.Object(
  {
    dx: Type.Number({ description: "Rightward offset; negative moves left." }),
    dy: Type.Number({ description: "Downward offset; negative moves up." }),
  },
  { additionalProperties: false },
);

export const move = defineOperationTool({
  name: "move",
  description:
    "Move a box. Send exactly one of to or by; a null one counts as absent. to puts the box's top-left corner at a point on the board, and by nudges it by an offset from where it already is. A section takes everything it holds with it, so what it contains never changes. The result lands on the board's grid and reports where the box actually is.",
  fields: {
    id: Id,
    to: nullable(MovePoint, "Put the top-left corner at this point."),
    by: nullable(MoveOffset, "Move the box by this offset."),
  },
  validate: (ctx, p) => {
    const errors = ctx.requirePositionable(p.id);
    if (errors.length === 0) errors.push(...ctx.requireUnlocked(p.id));
    if ((p.to == null) === (p.by == null)) {
      errors.push(
        p.to == null
          ? "send exactly one of to or by — to puts the top-left corner at a point, by nudges the box by an offset."
          : "send exactly one of to or by, not both.",
      );
    }
    return errors;
  },
  apply: (ctx, p) => {
    const current = objectOf(ctx, p.id).geometry;
    if (p.to != null) {
      // An absolute target IS the coordinate that lands, so snapping the
      // argument and snapping the result are the same operation here.
      const [x, y] = snapPoint([p.to.x, p.to.y]);
      return translate(
        ctx,
        p.id,
        { dx: x - current.x, dy: y - current.y },
        (landed) => `move ${p.id} → ${point(landed.x, landed.y)}`,
      );
    }
    const by = p.by!;
    // Snap the CORNER THE NUDGE LANDS ON, not the nudge. Snapping the delta
    // would leave an off-grid box off-grid forever (16 + 20 = 36), and a nudge
    // off a hand-drawn box is exactly when the grid earns its keep. The
    // reported delta is therefore the one that was actually applied.
    const [x, y] = snapPoint([current.x + by.dx, current.y + by.dy]);
    const dx = x - current.x;
    const dy = y - current.y;
    return translate(
      ctx,
      p.id,
      { dx, dy },
      (landed) =>
        `move ${p.id} ${signed(dx)},${signed(dy)} → ${point(landed.x, landed.y)}`,
    );
  },
});

// ---------------------------------------------------------------------------
// resize
// ---------------------------------------------------------------------------

/**
 * Lower a size change and report the dimensions that actually landed.
 *
 * Both size modes hold the top-left corner still, take their readability
 * verdict from the landed box, and rely on the operation factory's shared
 * membership reconcile so a section's new edges adopt and release contents.
 */
function applySize(
  ctx: OpContext,
  id: string,
  size: { width: number; height: number },
  summary: (landed: { width: number; height: number }) => string,
  readOnly: readonly string[] = [],
): OpOutcome {
  const target = objectOf(ctx, id);
  const { document: sized } = lowerGeometry(ctx.draft, [
    { ...target, geometry: { ...target.geometry, ...size } },
  ]);
  // A box asked to be smaller than its text needs lands at the needed size
  // instead, top-left still held, and its peers grow with it (auto-size.ts).
  const { document, notes } = autoSizeObjects(sized, [id], ctx.canvasStyle, "corner", false, readOnly);
  // Read the size back off the document rather than reporting the one that
  // was computed: the write path normalizes on its own grid, so an untouched
  // legacy dimension can come back a hair different from the one carried in,
  // and the summary has to be the board's number, not the descriptor's.
  const landed = (document.objects.find((object) => object.id === id) ?? target).geometry;
  // What still cannot be promised whole (a sticky, a section title, glyphs
  // the bundled fonts lack) is said on the box that LANDED.
  const report = textFitReport(target, landed, target.text ?? "", ctx.canvasStyle);
  if (!report.fits || !report.reliable) notes.push(report.detail);
  return {
    status: "applied",
    draft: document,
    summary: summary(landed),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

export const resize = defineOperationTool({
  name: "resize",
  description:
    "Re-size a box, holding its top-left corner still so it grows or shrinks toward its bottom-right. Send width, height or both for explicit dimensions, or like to copy another box's width and height; like refuses width or height beside it, and a null field counts as absent. The like source is only measured, never resized, so it can be locked. A section's new edges decide what it now contains, so it can adopt or release as it changes. Dimensions land on the board's grid. A shape, icon, or schematic note is never made smaller than its text needs: below that it lands at the needed size, and the same-type shapes in its row (height) and column (width) grow to match, keeping their centers, unless that would make them overlap another box.",
  fields: {
    id: Id,
    width: nullableNumber("New width. Omit it, or send null, to keep the current one."),
    height: nullableNumber("New height. Omit it, or send null, to keep the current one."),
    like: nullableId(
      "A different box whose width and height are copied. Send it without width or height.",
    ),
  },
  validate: (ctx, p) => {
    const errors = ctx.requirePositionable(p.id);
    if (errors.length === 0) errors.push(...ctx.requireUnlocked(p.id));
    const hasDimensions = p.width != null || p.height != null;
    if (p.like != null) {
      if (hasDimensions) {
        errors.push("like copies both dimensions, so send it without width or height.");
      }
      errors.push(...ctx.requirePositionable(p.like, "like"));
      if (p.like === p.id) {
        errors.push(
          "a box cannot be its own size source — use resize with width or height for explicit dimensions.",
        );
      }
    } else if (!hasDimensions) {
      errors.push(
        "resize needs a width, a height or like — as written it asks for no change.",
      );
    }
    return errors;
  },
  apply: (ctx, p) => {
    if (p.like != null) {
      const like = p.like;
      // `like` is measured, never written. A locked source is valid because
      // matching changes only the target.
      const source = resolveSizeLike(ctx.draft, like)!;
      // Matching a peer copies its size onto the grid, including when the
      // source is a hand-drawn off-grid box.
      return applySize(
        ctx,
        p.id,
        snapSize(source),
        (landed) =>
          `resize ${p.id} → ${num(landed.width)}×${num(landed.height)} (matching ${like})`,
        // Peer growth never resizes the measured source.
        [like],
      );
    }
    const current = objectOf(ctx, p.id).geometry;
    const width = p.width ?? undefined;
    const height = p.height ?? undefined;
    const snapped = snapSize({
      width: width ?? current.width,
      height: height ?? current.height,
    });
    // Snap only what the gesture actually asked for: a width-only resize must
    // not drag a legacy off-grid height onto the grid behind the model's back.
    const size = {
      width: width !== undefined ? snapped.width : current.width,
      height: height !== undefined ? snapped.height : current.height,
    };
    return applySize(
      ctx,
      p.id,
      size,
      (landed) => `resize ${p.id} → ${num(landed.width)}×${num(landed.height)}`,
    );
  },
});

// ---------------------------------------------------------------------------
// arrange · align
// ---------------------------------------------------------------------------

const ALIGN_EDGES = ["left", "right", "top", "bottom", "center_h", "center_v"] as const;
const ALIGN_EDGE_DESCRIPTION =
  "The edge the boxes share afterwards. center_h puts every box on one center x, center_v on one center y.";

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

// ---------------------------------------------------------------------------
// arrange · space
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

/** The `align` mode: one shared edge, snapped as a whole row. */
function alignRow(ctx: OpContext, ids: readonly string[], align: CanvasAlignEdge): OpOutcome {
  // The move roots are what actually aligned; a child of a listed section
  // travelled with its frame, so it is neither named nor measured here.
  const roots = moveRootIds(ctx.draft, ids);
  const aligned = alignWithDescendants(ctx.draft, ids, align);
  // Put the shared coordinate on the grid by nudging the WHOLE row by one
  // drift: every root moves by the same amount, so the edge they now share
  // stays exactly shared and lands on a 20.
  const alignedRoot = aligned.objects.find((object) => object.id === roots[0])!;
  const shared = sharedAlignCoordinate(alignedRoot.geometry, align);
  const drift = snapCoordinate(shared) - shared;
  const horizontal = alignsHorizontally(align);
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
    summary: `arrange align ${align} · ${roots.join(", ")} → ${alignedCoordinate(measured, align)}`
      + carriedSuffix(changedIds, roots),
  };
}

/** The `space` mode: re-pitch the run so every clear gap is `gap`. */
function spaceRun(
  ctx: OpContext,
  ids: readonly string[],
  space: { axis: "horizontal" | "vertical"; gap: number },
): OpOutcome {
  const gap = snapGap(space.gap);
  const horizontal = space.axis === "horizontal";
  const roots = moveRootIds(ctx.draft, ids);
  const spaced = spaceOutObjects(ctx.draft, ids, space.axis, gap);
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
    summary: `arrange space ${space.axis} gap ${num(gap)} · ${run}`
      + carriedSuffix(changedIds, roots),
  };
}

const ArrangeSpace = Type.Object(
  {
    axis: SpaceAxis,
    gap: Type.Number({
      description: "The clear space to leave between neighbouring boxes, in board units.",
    }),
  },
  { additionalProperties: false },
);

export const arrange = defineOperationTool({
  name: "arrange",
  description:
    "Arrange a row or column of boxes, or reflow a full board. Send exactly one of align, space or flow; a null one counts as absent. align puts the boxes on one shared edge or centerline: it is the cross-axis mode and never changes spacing along the flow. space re-pitches them in place so the clear gap between neighbours is exactly gap: in positional order along the axis the first box holds and every later one slides, the run grows or shrinks to suit, and the cross axis is untouched. space opens a corridor between boxes in one call. flow lays sibling sections and free nodes out again when a board or a section has filled up: it keeps the rows (axis x) or columns (axis y) the boxes sit in and their reading order, sets every gutter between them to one gap, packs the empty space out, and the wires route again. flow takes boxes that share one parent and every sibling the block reaches. Sections arrange by their own frame and carry their contents; edges are not targets, they re-route themselves. A child of a listed section travels with its frame and is not an independent target; at least two independent targets must remain.",
  fields: {
    ids: ArrangeIds,
    align: nullableEnum(ALIGN_EDGES, ALIGN_EDGE_DESCRIPTION),
    space: nullable(ArrangeSpace, "Re-pitch the run along this axis to this clear gap."),
    flow: nullable(ArrangeFlow, "Lay the boxes out again in reading order along this axis, one even gap apart."),
  },
  validate: (ctx, p) => {
    const errors = requireIndependentRoots(ctx, p.ids, "arrange");
    const modes = [p.align, p.space, p.flow].filter((mode) => mode != null).length;
    if (modes !== 1) {
      errors.push(
        modes === 0
          ? "send exactly one of align, space or flow — align puts the boxes on one shared edge, space sets one clear gap along a run, flow lays the boxes out again in reading order."
          : "send exactly one of align, space or flow, not several.",
      );
    }
    if (errors.length === 0 && p.flow != null) errors.push(...flowErrors(ctx, p.ids, p.flow as ArrangeFlowParams));
    return errors;
  },
  apply: (ctx, p) => {
    if (p.flow != null) return flowRun(ctx, p.ids, p.flow as ArrangeFlowParams);
    return p.align != null
      ? alignRow(ctx, p.ids, p.align as CanvasAlignEdge)
      : spaceRun(ctx, p.ids, p.space as { axis: "horizontal" | "vertical"; gap: number });
  },
});

// ---------------------------------------------------------------------------
// arrange_section
// ---------------------------------------------------------------------------

/** Rounds a measured extent UP to the grid, so a cell never bites into its node. */
function ceilToGrid(value: number): number {
  return Math.ceil(value / AGENT_GRID) * AGENT_GRID;
}

/**
 * Why one id in `rows` cannot take a cell, or nothing when it can. A cell
 * holds one node of this section: a shape or an icon that is free or already
 * the section's child, and that no lock covers.
 */
function rowIdErrors(ctx: OpContext, sectionId: string, id: string): string[] {
  const missing = ctx.requirePositionable(id, "rows id");
  if (missing.length > 0) return missing;
  const object = objectOf(ctx, id);
  const kind = entityKindOf(object);
  if (id === sectionId) {
    return [`rows id "${id}" is the section being arranged — list only the nodes inside it.`];
  }
  if (kind === "section") {
    return [
      `rows id "${id}" is a section — arrange_section lays out the nodes inside one frame;`
      + ` arrange_section "${id}" on its own, and place the frame itself with move.`,
    ];
  }
  if (kind === "sticky") {
    return [
      `rows id "${id}" is a sticky — a note is not a node in the flow; leave it out and put it`
      + " beside the frame with move.",
    ];
  }
  const parentId = object.parentId ?? undefined;
  if (parentId !== undefined && parentId !== sectionId) {
    return [
      `rows id "${id}" belongs to section "${parentId}" — arrange_section arranges one section's`
      + ` nodes; arrange_section "${parentId}" instead, or move "${id}" out of it first.`,
    ];
  }
  return ctx.requireUnlocked(id, "rows id");
}

/**
 * The cells of the arrangement: each node's painted footprint (what a reader
 * sees: a shape's box, an icon's tile and caption, not its whole stored box),
 * its hit bounds relative to that footprint (the stored box and caption, which
 * the frame must still hold), and the offset from footprint to stored box.
 */
interface Cell {
  readonly id: string;
  readonly row: number;
  readonly column: number;
  /** Stored corner minus footprint corner: how far the box sits inside its footprint. */
  readonly inset: { x: number; y: number };
  readonly footprint: { width: number; height: number };
  /** How far below the footprint's top its side wires attach: the center of its drawn rect (an icon's tile). */
  readonly anchorY: number;
  /** Hit bounds minus footprint, as the overhang on each side (0 or more). */
  readonly overhang: { left: number; top: number; right: number; bottom: number };
}

/**
 * The air a stored box keeps inside the frame on each side, and above it (the
 * title band too). Section auto-grow (state/section-grow.ts) grows a frame
 * whose child keeps less, one side at a time, which would undo the centring.
 */
const STORED_BOX_AIR = { side: 20, top: 40 } as const;

/** Each gap a labelled wire crosses, keyed by its two cell ids, and the length along the wire its chip needs. */
type LabelledGaps = (a: string, b: string, axis: "across" | "down") => number;

/**
 * Pitch the rows and return each node's new top-left corner and the frame.
 *
 * Rows of the same length share a column grid: a column is as wide as its
 * widest footprint, rounded up to the grid. Neighbours in a row sit
 * `nodeGapRow` apart and rows `nodeGapColumn` apart, or further when a
 * labelled wire crosses the gap: its chip's length plus LABELLED_GAP_AIR_PX,
 * so the chip clears both ends and the arrowhead.
 *
 * Each row is centred in the frame, and each footprint in its column. Down a
 * row, every node's side anchor (a box's middle, an icon's tile middle, with
 * its caption hanging below) sits on one line, so its wires run straight.
 * That shared line is the gesture, as it is for `arrange`'s `align` center: a
 * corner falls half an extent from it and is not snapped to the agent grid
 * (the write path still puts it on its own grid of 4).
 *
 * The frame keeps its top-left corner and the same air on the left and right
 * of what paints: the frame padding, or more when a stored box (an icon's is
 * wider than its tile and caption) would otherwise keep less than
 * STORED_BOX_AIR inside the frame.
 */
function pitchCells(
  cells: readonly Cell[],
  corner: { x: number; y: number },
  labelledGap: LabelledGaps,
): { corners: Map<string, { x: number; y: number }>; frame: { x: number; y: number; width: number; height: number } } {
  const rows: Cell[][] = [];
  for (const cell of cells) (rows[cell.row] ??= [])[cell.column] = cell;

  // Column widths and gaps per row length.
  const grids = new Map<number, { widths: number[]; gaps: number[] }>();
  for (const row of rows) {
    const grid = grids.get(row.length) ?? { widths: [], gaps: [] };
    grids.set(row.length, grid);
    row.forEach((cell, column) => {
      grid.widths[column] = Math.max(grid.widths[column] ?? 0, ceilToGrid(cell.footprint.width));
      if (column > 0) {
        const need = ceilToGrid(labelledGap(row[column - 1]!.id, cell.id, "across"));
        grid.gaps[column - 1] = Math.max(grid.gaps[column - 1] ?? CRAFT_TARGETS.nodeGapRow, need);
      }
    });
  }
  const rowWidth = (row: readonly Cell[]): number => {
    const { widths, gaps } = grids.get(row.length)!;
    return widths.reduce((sum, width) => sum + width, 0) + gaps.reduce((sum, gap) => sum + gap, 0);
  };
  const contentWidth = Math.max(...rows.map(rowWidth));

  // Each row's anchor line: as far down as its tallest part above an anchor.
  const above = rows.map((row) => Math.max(...row.map((cell) => cell.anchorY)));
  const below = rows.map((row) => Math.max(...row.map((cell) => cell.footprint.height - cell.anchorY)));
  const rowHeight = rows.map((_, index) => ceilToGrid(above[index]! + below[index]!));
  const rowY: number[] = [0];
  for (let index = 1; index < rows.length; index += 1) {
    let gap: number = CRAFT_TARGETS.nodeGapColumn;
    for (const above of rows[index - 1]!) {
      for (const below of rows[index]!) gap = Math.max(gap, ceilToGrid(labelledGap(above.id, below.id, "down")));
    }
    rowY[index] = rowY[index - 1]! + rowHeight[index - 1]! + gap;
  }
  const contentHeight = rowY.at(-1)! + rowHeight.at(-1)!;

  // Footprint corners relative to the content's top-left.
  const placed = new Map<string, { x: number; y: number }>();
  for (const [index, row] of rows.entries()) {
    const { widths, gaps } = grids.get(row.length)!;
    let x = (contentWidth - rowWidth(row)) / 2;
    row.forEach((cell, column) => {
      placed.set(cell.id, {
        x: x + (widths[column]! - cell.footprint.width) / 2,
        y: rowY[index]! + (rowHeight[index]! - above[index]! - below[index]!) / 2 + above[index]! - cell.anchorY,
      });
      x += widths[column]! + (gaps[column] ?? 0);
    });
  }

  // The air around the content: the frame padding, or what holds every stored box.
  let side: number = CRAFT_TARGETS.framePadding;
  let top: number = CRAFT_TARGETS.framePadding + SECTION_FIT_PADDING.titleClearance;
  let bottom: number = CRAFT_TARGETS.framePadding;
  for (const cell of cells) {
    const at = placed.get(cell.id)!;
    side = Math.max(
      side,
      cell.overhang.left - at.x + STORED_BOX_AIR.side,
      at.x + cell.footprint.width + cell.overhang.right - contentWidth + STORED_BOX_AIR.side,
    );
    top = Math.max(top, cell.overhang.top - at.y + STORED_BOX_AIR.top);
    bottom = Math.max(bottom, at.y + cell.footprint.height + cell.overhang.bottom - contentHeight + STORED_BOX_AIR.side);
  }
  const frame = {
    x: corner.x,
    y: corner.y,
    width: ceilToGrid(contentWidth + side * 2),
    height: ceilToGrid(top + contentHeight + bottom),
  };
  const left = frame.x + (frame.width - contentWidth) / 2;
  const corners = new Map<string, { x: number; y: number }>();
  for (const cell of cells) {
    const at = placed.get(cell.id)!;
    corners.set(cell.id, { x: left + at.x + cell.inset.x, y: frame.y + top + at.y + cell.inset.y });
  }
  return { corners, frame };
}

/** The union of a box's painted rects: what a reader sees of it. */
function paintedFootprint(object: InteractiveCanvasObject, canvasStyle: OpContext["canvasStyle"]) {
  const rects = paintedRects(object, canvasStyle);
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y,
  };
}

export const arrangeSection = defineOperationTool({
  name: "arrange_section",
  description:
    "Lay a section's nodes out in the rows you name, then fit the frame around them. "
    + "Rows run top to bottom and each row left to right. Each row is centred in the frame, "
    + "and rows of the same length line up column by column. "
    + "The gaps come from the craft targets and each node's painted size (an icon's tile and caption), "
    + "and a gap a labelled wire crosses widens to fit its label, "
    + "so the call carries no coordinates. The frame keeps its top-left corner. "
    + "Children of the section you leave out stay where they are.",
  fields: ArrangeSectionParams.properties,
  validate: (ctx, p) => {
    const sectionErrors = ctx.requireSection(p.section, "section");
    if (sectionErrors.length > 0) return sectionErrors;
    const errors = [...ctx.requireUnlocked(p.section, "section")];
    const seen = new Set<string>();
    for (const id of p.rows.flat()) {
      if (seen.has(id)) {
        errors.push(`rows id "${id}" appears more than once — each node takes one cell.`);
        continue;
      }
      seen.add(id);
      errors.push(...rowIdErrors(ctx, p.section, id));
    }
    return errors;
  },
  apply: (ctx, p) => {
    const section = objectOf(ctx, p.section);
    const cells: Cell[] = p.rows.flatMap((row, rowIndex) =>
      row.map((id, column) => {
        const object = objectOf(ctx, id);
        const painted = paintedFootprint(object, ctx.canvasStyle);
        const hit = hitBoundsForObject(object, ctx.canvasStyle);
        const drawn = drawnRectOf(object, ctx.canvasStyle);
        return {
          id,
          row: rowIndex,
          column,
          inset: { x: object.geometry.x - painted.x, y: object.geometry.y - painted.y },
          footprint: { width: painted.width, height: painted.height },
          anchorY: drawn.y + drawn.height / 2 - painted.y,
          overhang: {
            left: Math.max(0, painted.x - hit.x),
            top: Math.max(0, painted.y - hit.y),
            right: Math.max(0, hit.x + hit.width - (painted.x + painted.width)),
            bottom: Math.max(0, hit.y + hit.height - (painted.y + painted.height)),
          },
        };
      }));
    // A labelled wire between two cells needs its chip's length along the
    // wire: its width across a row, its height down a column.
    const labelledGap: LabelledGaps = (a, b, axis) => {
      let need = 0;
      for (const connection of ctx.draft.connections) {
        const ends = [connection.from.objectId, connection.to.objectId];
        if (!connection.label?.trim() || !ends.includes(a) || !ends.includes(b) || a === b) continue;
        const chip = connectionLabelChipMetrics(connection.label, ctx.canvasStyle);
        need = Math.max(need, (axis === "across" ? chip.width : chip.height) + LABELLED_GAP_AIR_PX);
      }
      return need;
    };
    // The frame keeps its top-left corner, on the agent grid.
    const { corners, frame } = pitchCells(cells, snapRectOutward(section.geometry), labelledGap);

    const placed = cells.map((cell) => {
      const object = objectOf(ctx, cell.id);
      return { ...object, geometry: { ...object.geometry, ...corners.get(cell.id)! } };
    });

    const { document } = lowerGeometry(ctx.draft, [
      ...placed,
      { ...section, geometry: frame },
    ]);
    const listed = new Set(cells.map((cell) => cell.id));
    // The refit frame can outgrow its parent. The nodes, the frame and every
    // ancestor keep their parents, so the ancestors grow around it together.
    const held = new Map<string, string | null>([...listed].map((id) => [id, p.section]));
    for (let frameId: string | null = p.section; frameId; frameId = held.get(frameId)!) {
      held.set(frameId, objectOf(ctx, frameId).parentId ?? null);
    }

    const leftOut = ctx.draft.objects
      .filter((object) => object.parentId === p.section && !listed.has(object.id))
      .map((object) => object.id);
    const landed = new Map(document.objects.map((object) => [object.id, object.geometry]));
    const rowsLine = p.rows
      .map((row, index) =>
        `row ${index + 1}: `
        + row.map((id) => `${id} ${point(landed.get(id)!.x, landed.get(id)!.y)}`).join(", "))
      .join(" · ");
    const box = landed.get(p.section)!;
    return {
      status: "applied",
      draft: document,
      held,
      summary: `arrange_section ${p.section} → frame ${num(box.x)},${num(box.y)} `
        + `${num(box.width)}×${num(box.height)} · ${rowsLine}`,
      ...(leftOut.length > 0
        ? {
            notes: [
              `not arranged: ${leftOut.join(", ")} — they kept their place and can now sit outside or under`
              + " the frame; list them in rows, or move them out with move",
            ],
          }
        : {}),
    };
  },
});
