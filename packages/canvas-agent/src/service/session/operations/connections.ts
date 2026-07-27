/**
 * The three connection operation descriptors behind the layout runtime —
 * add_connection routes an edge, update_connection re-routes or restyles one,
 * and remove_connection deletes one — with their connection-specific schemas,
 * endpoint validation, and mutations.
 *
 * The shared operation factory owns the execution pipeline around these thin
 * descriptors, including diffing, linting, routed truth, rendering, and event
 * emission.
 */
import { defineOperationTool } from "../operation-tool";
import {
  ConnectionPatch,
  ConnectionPayload,
  Id,
} from "../schemas";

export const addConnection = defineOperationTool({
  name: "add_connection",
  description:
    "Route an edge between two objects. A second edge over an existing from→to pair applies with a duplicate warning; prefer restyling the existing edge.",
  fields: { connection: ConnectionPayload },
  validate: (ctx, p) => [
    ...ctx.requireFreeId(p.connection.id),
    ...ctx.requireEndpoint("from", p.connection.from),
    ...ctx.requireEndpoint("to", p.connection.to),
    ...ctx.requireDistinctEndpoints(p.connection.from, p.connection.to),
  ],
  apply: (ctx, p) => ctx.insertConnection(p.connection),
});

export const updateConnection = defineOperationTool({
  name: "update_connection",
  description:
    "Re-route or restyle an existing edge. Repointing an endpoint moves the edge alone — neither the object it leaves nor the object it lands on changes.",
  fields: { connectionId: Id, patch: ConnectionPatch },
  validate: (ctx, p) => {
    // A patch usually carries one endpoint, so distinctness has to be judged
    // against the edge as it will stand: the side being repointed against the
    // side already stored. Comparing the patch to itself would let an edge
    // land on the object its other end already occupies.
    const stored = ctx.draft.connections.find((edge) => edge.id === p.connectionId);
    return [
      ...ctx.requireConnection(p.connectionId),
      ...ctx.requireEndpoint("from", p.patch.from),
      ...ctx.requireEndpoint("to", p.patch.to),
      ...ctx.requireDistinctEndpoints(p.patch.from ?? stored?.from, p.patch.to ?? stored?.to),
    ];
  },
  apply: (ctx, p) => ctx.mergeConnection(p.connectionId, p.patch),
});

export const removeConnection = defineOperationTool({
  name: "remove_connection",
  description: "Delete an edge. The objects it joined stay on the board.",
  fields: { connectionId: Id },
  validate: (ctx, p) => ctx.requireConnection(p.connectionId),
  apply: (ctx, p) => ctx.removeConnection(p.connectionId),
});
