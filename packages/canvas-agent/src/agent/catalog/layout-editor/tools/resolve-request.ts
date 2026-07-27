/**
 * `resolve_request` — disposes one entry of the request queue. It changes the
 * queue, so ../state/rules/operations.ts logs it and ../state/render/requests.ts
 * renders the result.
 */
import { Type } from "@mariozechner/pi-ai";

import {
  requireRuntime,
  toToolResult,
  type ToolRegistration,
} from "./runtime";

export const registerResolveRequest: ToolRegistration = (pi, runtime) => {
  pi.registerTool({
    name: "resolve_request",
    label: "Resolve user request",
    description:
      "Dispose one entry of the request queue (the REQUESTS block / user_requests context). Use status \"done\" after you have answered the request by editing board content, or \"declined\" when you will not — the note says what you did or why not. The note is posted into the thread as your reply and closes it on the board, so the operator reads it there. Every user-authored request must be disposed before finalize can commit; a thread you opened yourself does not need disposing. Returns the updated REQUESTS block only; the id must name an open entry (e.g. \"R1\").",
    parameters: Type.Object({
      id: Type.String({ description: "The queue id of an open request, e.g. \"R1\"." }),
      status: Type.Union([Type.Literal("done"), Type.Literal("declined")], {
        description: "done = answered on the board; declined = consciously not doing it.",
      }),
      note: Type.String({
        description: "Required. One line for the operator: what you did, or why you declined.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).resolveRequest(
        params.id,
        params.status,
        params.note,
      )),
  });
};

export default registerResolveRequest;
