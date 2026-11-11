/**
 * `arrange` · flow — the gesture over flowLayout (../flow.ts).
 *
 * `arrange {ids, flow: {axis, gap?}}` lays sibling sections and free nodes out
 * in the reading order they sit in, every gutter one gap, the empty space
 * packed out. It is the one call for a board that filled up: `move` and
 * `arrange` `space` shift one box or one run, and a section that grew has
 * pushed its neighbours (state/section-grow.ts, makeRoom), so the gutters end
 * up every width. Flow sets them all in one edit.
 *
 * The rules it shares with the rest of the Arrange group (./arrange.ts): a
 * section travels whole, every corner it writes lands on the agent grid, and a
 * lock on a listed box refuses the call. Three are its own:
 *
 * - SIBLINGS ONLY. The listed boxes share one parent and keep it: the parent
 *   grows to hold the block (`held`), and makes room when that grow runs into
 *   a neighbour.
 * - AN UNLISTED SIBLING IS NOT MOVED, so a flow that would put a box over one,
 *   or further over one it already touches, is refused with its name. Laying
 *   half a row out over the other half would pull the unlisted boxes into the
 *   listed sections.
 * - THE WIRES ROUTE AGAIN. The commit path keeps the waypoints of a wire whose
 *   two ends moved together and drops the rest (reconcileConnectionWaypoints).
 */
import { StringEnum, Type } from "@mariozechner/pi-ai";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../../state/schema";
import { moveClosureIds, moveRootIds } from "../../../state/geometry";

import { CRAFT_TARGETS } from "../../../authoring/style-guide/craft-targets";
import { applyOperationToDraft } from "../../apply-ops";
import { flowLayout, type FlowResult } from "../flow";
import { snapGap } from "../grid";
import type { OpContext, OpOutcome } from "./op-context";
import { nullableNumber } from "../schemas";

export const FLOW_AXES = ["x", "y"] as const;

export const ArrangeFlow = Type.Object(
  {
    axis: StringEnum([...FLOW_AXES], {
      description:
        "The reading direction. x keeps the rows the boxes sit in and reads each left to right; y keeps the columns and reads each top to bottom.",
    }),
    gap: nullableNumber(
      "The clear space between neighbouring boxes, along and across the axis, in board units. Omit it for the house gutter: 200 when a section is listed, 100 for free nodes.",
    ),
  },
  { additionalProperties: false },
);

export type ArrangeFlowParams = { axis: (typeof FLOW_AXES)[number]; gap?: number | null };

/** The gutter a flow leaves when the call names none: the craft target for what it lays out. */
function flowGap(document: InteractiveCanvasDocument, roots: readonly string[], asked?: number | null): number {
  if (asked != null) return snapGap(asked);
  const sections = new Set(document.objects.filter((object) => object.type === "section").map((object) => object.id));
  return roots.some((id) => sections.has(id))
    ? CRAFT_TARGETS.sectionGutterSideBySide
    : CRAFT_TARGETS.nodeGapColumn;
}

function laidOut(ctx: OpContext, ids: readonly string[], flow: ArrangeFlowParams): { gap: number; result: FlowResult | null } {
  const gap = flowGap(ctx.draft, moveRootIds(ctx.draft, ids), flow.gap);
  return { gap, result: flowLayout(ctx.draft, ids, { axis: flow.axis, gap }) };
}

/** The area two frames share, 0 when they are clear of each other. */
function shared(a: InteractiveCanvasObject, b: InteractiveCanvasObject): number {
  const width = Math.min(a.geometry.x + a.geometry.width, b.geometry.x + b.geometry.width) - Math.max(a.geometry.x, b.geometry.x);
  const height = Math.min(a.geometry.y + a.geometry.height, b.geometry.y + b.geometry.height) - Math.max(a.geometry.y, b.geometry.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** What a flow cannot lay out: boxes of two parents, or a block that lands on a sibling the call left out. */
export function flowErrors(ctx: OpContext, ids: readonly string[], flow: ArrangeFlowParams): string[] {
  const byId = new Map(ctx.draft.objects.map((object) => [object.id, object]));
  const roots = moveRootIds(ctx.draft, ids);
  const parents = [...new Set(roots.map((id) => byId.get(id)!.parentId ?? null))];
  if (parents.length > 1) {
    const where = parents.map((parent) =>
      `${roots.filter((id) => (byId.get(id)!.parentId ?? null) === parent).join(", ")} ${parent === null ? "at the top level" : `in ${parent}`}`);
    return [
      `flow lays out boxes that share one parent, and these do not: ${where.join("; ")}. Flow the boxes of one section, or the sections of one level, per call.`,
    ];
  }
  const { result } = laidOut(ctx, ids, flow);
  if (!result) return [];
  const listed = moveClosureIds(ctx.draft, roots);
  const landed = new Map(result.objects.map((object) => [object.id, object]));
  const covered = ctx.draft.objects
    .filter((object) => !listed.has(object.id) && (object.parentId ?? null) === parents[0])
    .flatMap((sibling) => {
      // An overlap the board already has is not the flow's to refuse, unless the flow deepens it.
      const over = roots.filter((id) => shared(landed.get(id)!, sibling) > shared(byId.get(id)!, sibling));
      return over.length > 0 ? [`${over.join(", ")} over ${sibling.id}`] : [];
    });
  return covered.length === 0
    ? []
    : [
        `flow would put ${covered.join("; ")}, which the call does not list. List every sibling the block reaches, or move ${covered.length === 1 ? "it" : "them"} clear first.`,
      ];
}

/** The `flow` mode: the listed siblings in reading order, every gutter one gap. */
export function flowRun(ctx: OpContext, ids: readonly string[], flow: ArrangeFlowParams): OpOutcome {
  const { gap, result } = laidOut(ctx, ids, flow);
  if (!result || result.movedIds.length === 0) {
    return { status: "noop", note: `the boxes already sit in flow with a ${gap} gap, so nothing moved.` };
  }
  // One `updateObject` per box that moved, through the draft applier: the one
  // mutation door, so the accept-time diff replays the same numbers.
  const before = new Map(ctx.draft.objects.map((object) => [object.id, object]));
  let document = ctx.draft;
  let carried = 0;
  const roots = new Set(result.movedIds);
  for (const object of result.objects) {
    const was = before.get(object.id)!.geometry;
    if (was.x === object.geometry.x && was.y === object.geometry.y) continue;
    document = applyOperationToDraft(document, {
      type: "updateObject",
      objectId: object.id,
      patch: { geometry: object.geometry },
    }).document;
    if (!roots.has(object.id)) carried += 1;
  }
  const lines = result.lines.map((line) => line.join(" | ")).join(" // ");
  return {
    status: "applied",
    draft: document,
    summary: `arrange flow ${flow.axis} gap ${gap} · ${flow.axis === "x" ? "rows" : "columns"} ${lines}`
      + (carried > 0 ? ` (carrying ${carried})` : ""),
    held: new Map(moveRootIds(ctx.draft, ids).map((id) => [id, before.get(id)!.parentId ?? null])),
  };
}
