/**
 * The Delete group (docs/30-agent-layout/50-tool-surface/10-gestures §Delete)
 * — one gesture, one id,
 * three cascades.
 *
 * Deleting is the same motion whatever it lands on, so it is one tool rather
 * than three; what differs is what goes with the thing:
 *
 *   object     → the object and every edge attached to it
 *   section    → the frame and every descendant (and their edges), with the
 *                last-section guard still in force
 *   connection → the edge alone; the objects it joined stay
 *
 * All three cascades already live in the draft applier (../apply-ops.ts), which
 * is the same code the accept-time reducer runs, so this descriptor chooses the
 * internal op and reports what went — it never re-implements the removal.
 *
 * NAMING: the tool's model-facing name is the string "delete", which is a
 * reserved word in JS and cannot be a binding. The export is `deleteEntity`;
 * only the `name` field carries the real name, and that is the one the model
 * and the roster see.
 */
import { sectionDescendantIds } from "../../../../../../canvas/src/state/geometry";

import { defineOperationTool } from "./operation-tool";
import { entityKindOf } from "../../perception/op-surface";
import { DeleteParams } from "../schemas";

export const deleteEntity = defineOperationTool({
  name: "delete",
  description:
    "Remove one thing from the board. An object goes with every edge attached "
    + "to it; a section goes with everything inside it; an edge goes alone, "
    + "leaving the two objects it joined. The board always keeps at least one "
    + "section, so the last one is refused — put its replacement down first.",
  fields: DeleteParams.properties,
  validate: (ctx, p) => {
    const object = ctx.draft.objects.find((candidate) => candidate.id === p.id);
    if (object) {
      // Two guards, in the order they matter: a lock is a person's mark and
      // refuses the removal outright, and the board always keeps one section.
      // The lock gate reads the NAMED id — a delete that cascades into a locked
      // frame further down is refused by that frame's own lock only when the
      // frame is named, which is the same reach every other gesture has.
      return [...ctx.requireUnlocked(p.id), ...ctx.requireNotLastSection(p.id)];
    }
    if (ctx.draft.connections.some((connection) => connection.id === p.id)) {
      return ctx.requireUnlockedEdge(p.id);
    }
    return [`id "${p.id}" is not on the board.`];
  },
  apply: (ctx, p) => {
    const object = ctx.draft.objects.find((candidate) => candidate.id === p.id);
    if (!object) {
      return ctx.applyLowered(
        { type: "removeConnection", connectionId: p.id },
        `delete ${p.id} (connection)`,
      );
    }

    const kind = entityKindOf(object);
    // Read the cascade off the draft the way the applier will, so the summary
    // and the notes describe the removal that actually happens.
    const removedIds = new Set([p.id]);
    if (kind === "section") {
      for (const id of sectionDescendantIds(ctx.draft, p.id)) removedIds.add(id);
    }
    const droppedEdges = ctx.draft.connections
      .filter((connection) =>
        removedIds.has(connection.from.objectId) || removedIds.has(connection.to.objectId))
      .map((connection) => connection.id);

    const inside = removedIds.size - 1;
    const summary = kind === "section"
      ? `delete ${p.id} (section${inside > 0 ? ` + ${inside} inside` : ""})`
      : `delete ${p.id} (${kind})`;

    return ctx.applyLowered(
      { type: "removeObject", objectId: p.id },
      summary,
      droppedEdges.length > 0
        ? [`attached edges removed with it: ${droppedEdges.join(", ")}`]
        : undefined,
    );
  },
});
