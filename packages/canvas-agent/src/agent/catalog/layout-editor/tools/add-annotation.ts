/**
 * `add_annotation` — opens one question thread anchored to an object. It puts
 * an entry on the request queue, so ../state/rules/operations.ts logs it and
 * ../state/render/requests.ts shows the queue it changed.
 */
import { Type } from "@mariozechner/pi-ai";

import {
  requireRuntime,
  toToolResult,
  type ToolRegistration,
} from "./runtime";

export const registerAddAnnotation: ToolRegistration = (pi, runtime) => {
  pi.registerTool({
    name: "add_annotation",
    label: "Ask about an object",
    description:
      "Anchor a question to one object as an annotation thread the user answers on their own time. Use it only where the answer would genuinely change the diagram and you cannot settle it yourself — one or two per run at most; a question on every object is noise, not care. This never waits: leave the question, proceed on your best reading, and name any open thread in the finalize message. Returns the applied line and the updated REQUESTS block.",
    parameters: Type.Object({
      objectId: Type.String({
        description: "The id of the object the question is about.",
      }),
      body: Type.String({
        description: "The question, in plain language, specific enough to answer without further context.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).addAnnotation(params.objectId, params.body)),
  });
};

export default registerAddAnnotation;
