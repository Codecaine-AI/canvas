/**
 * `tighten_wires` — the seventh Arrange gesture: slide every box toward what
 * it is wired to, from the layout as drawn (../tighten-wires.ts has the
 * method and the measurement behind it).
 *
 * The six gestures in arrange.ts move what the model names. This one moves
 * what the wires say should move, and only when the drawn wires get shorter
 * for it: nothing changes section, nothing lands on a box or a wire, and a
 * section travels as one body. It exists because total wire length is what
 * the layout score tracks, and a model placing thirty boxes by estimate
 * leaves a fifth of that length on the table.
 */
import { Type } from "@mariozechner/pi-ai";

import { applyOperationToDraft } from "../../apply-ops";
import { tightenWires } from "../tighten-wires";
import type { OpContext, OpOutcome } from "./op-context";
import { defineOperationTool } from "./operation-tool";

function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`;
}

export const tightenWiresTool = defineOperationTool({
  name: "tighten_wires",
  description:
    "Slide boxes toward the boxes they are wired to, so the wires get shorter and cross less, keeping the "
    + "layout you drew: nothing changes section, nothing lands on another box or on a wire, a section moves "
    + "as one body, and two sections trade places only when that shortens the wires between them. Every "
    + "move is checked against the real routes and kept only when it helps. Call it once after every wire is "
    + "drawn and before canvas_check; then move a box by hand only for a finding the check still reports. "
    + "The result reports the total wire length and the crossings before and after.",
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
    if (result.movedIds.length === 0) {
      return { status: "noop", note: `no move shortens the wires — ${result.lengthBefore}px of wire, ${plural(result.crossingsBefore, "crossing")}.` };
    }
    let document = ctx.draft;
    for (const object of result.objects) {
      if (!result.movedIds.includes(object.id)) continue;
      document = applyOperationToDraft(document, {
        type: "updateObject",
        objectId: object.id,
        patch: { geometry: object.geometry },
      }).document;
    }
    const saved = result.lengthBefore - result.lengthAfter;
    const percent = result.lengthBefore > 0 ? Math.round((100 * saved) / result.lengthBefore) : 0;
    return {
      status: "applied",
      draft: document,
      summary: `tighten_wires · ${plural(result.movedIds.length, "box", "boxes")} moved · wire ${result.lengthBefore}px → ${result.lengthAfter}px (−${percent}%)`
        + ` · crossings ${result.crossingsBefore} → ${result.crossingsAfter}`,
    };
  },
});
