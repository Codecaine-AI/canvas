/**
 * `tighten_wires` — the seventh Arrange gesture: slide every box toward what
 * it is wired to, from the layout as drawn (../tighten-wires.ts has the
 * method and the measurement behind it).
 *
 * The six gestures in arrange.ts move what the model names. This one moves
 * what the wires say should move, and only when the drawn wires get shorter
 * or straighter for it: nothing changes section, nothing lands on a box or a
 * wire, and a section travels as one body. It exists because total wire
 * length is what the layout score tracks, and a model placing thirty boxes by
 * estimate leaves a fifth of that length on the table.
 *
 * It ends in the straighten pass over every wire (../straighten-wires.ts):
 * the slide works on the 20px grid and keeps a move only for a real gain, so
 * it leaves the small jogs between boxes a few pixels off one axis.
 */
import { Type } from "@mariozechner/pi-ai";

import { reconcileConnectionWaypoints } from "../../../state/actions/waypoints";
import { applyOperationToDraft } from "../../apply-ops";
import { describeStraightening, straightenWires } from "../straighten-wires";
import { bends, routeAll, tightenWires, totalCrossings, totalLength } from "../tighten-wires";
import type { OpContext, OpOutcome } from "./op-context";
import { defineOperationTool } from "./operation-tool";

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

export const tightenWiresTool = defineOperationTool({
  name: "tighten_wires",
  description:
    "Slide boxes toward the boxes they are wired to, so the wires get shorter, run straight and cross less, keeping the "
    + "layout you drew: nothing changes section, nothing lands on another box or on a wire, a section moves "
    + "as one body, and two sections trade places only when that shortens the wires between them. A move "
    + "that makes a wire straight counts as a gain, also when the total length stays the same. It ends by "
    + "taking the small jogs out: a wire between two boxes a few pixels off one axis goes straight, also a wire "
    + "you routed by hand with such a jog. Every "
    + "move is checked against the real routes and kept only when it helps. Call it once after every wire is "
    + "drawn and before canvas_check; then move a box by hand only for a finding the check still reports. "
    + "The result reports the total wire length, the corners and the crossings before and after.",
  fields: {
    passes: Type.Optional(Type.Integer({
      minimum: 1,
      maximum: 4,
      description: "Rounds of section moves then node moves. Default 2.",
    })),
  },
  validate: (ctx) => {
    const errors: string[] = [];
    if (ctx.draft.connections.length === 0) errors.push("the board has no wires to tighten — connect first.");
    for (const object of ctx.draft.objects) {
      const locked = ctx.requireUnlocked(object.id);
      if (locked.length > 0) { errors.push(...locked); break; }
    }
    return errors;
  },
  apply: (ctx: OpContext, p): OpOutcome => {
    const result = tightenWires(ctx.draft, { canvasStyle: ctx.canvasStyle, passes: p.passes });
    let lowered = ctx.draft;
    for (const object of result.objects) {
      if (!result.movedIds.includes(object.id)) continue;
      lowered = applyOperationToDraft(lowered, {
        type: "updateObject",
        objectId: object.id,
        patch: { geometry: object.geometry },
      }).document;
    }
    // Hand routes settle for the slide the way the pipeline settles them, so
    // the straighten pass judges the routes the board will have.
    const straight = straightenWires(reconcileConnectionWaypoints(ctx.draft, lowered), { canvasStyle: ctx.canvasStyle });
    const was = new Map(ctx.draft.objects.map((object) => [object.id, object.geometry]));
    const moved = straight.document.objects.filter((object) => {
      const before = was.get(object.id)!;
      const after = object.geometry;
      return before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height;
    });
    if (moved.length === 0) {
      return {
        status: "noop",
        note: `no move shortens or straightens the wires — ${result.lengthBefore}px of wire, `
          + `${plural(result.bendsBefore, "corner")}, ${plural(result.crossingsBefore, "crossing")}.`,
      };
    }
    const routes = routeAll(straight.document, ctx.canvasStyle);
    const lengthAfter = Math.round(totalLength(routes));
    // A move that straightens a wire can add a little length, so the change has a sign.
    const change = result.lengthBefore > 0
      ? Math.round((100 * (lengthAfter - result.lengthBefore)) / result.lengthBefore)
      : 0;
    return {
      status: "applied",
      draft: straight.document,
      summary: `tighten_wires · ${plural(moved.length, "box", "boxes")} moved · wire ${result.lengthBefore}px → ${lengthAfter}px (${change > 0 ? "+" : "−"}${Math.abs(change)}%)`
        + ` · corners ${result.bendsBefore} → ${bends(routes.values())}`
        + ` · crossings ${result.crossingsBefore} → ${totalCrossings(routes)}`,
      ...(straight.moves.length > 0 ? { notes: straight.moves.map(describeStraightening) } : {}),
      straightened: true,
    };
  },
});
