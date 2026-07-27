/**
 * `look` — the deliberate whole-board perception call. Changes nothing; it
 * produces renders, which ../state/rules/views.ts records as view refs and
 * ../state/render/views.ts attaches to the request.
 */
import { Type } from "@mariozechner/pi-ai";

import {
  requireRuntime,
  toToolResult,
  type ToolRegistration,
} from "./runtime";

export const registerLook: ToolRegistration = (pi, runtime) => {
  pi.registerTool({
    name: "look",
    label: "Look",
    description:
      "Step back and take in the whole board: the current digest, everything that has changed since the run began, every open lint, how each edge actually routes, the request queue, and a render of the board. Changes nothing. Name a section to get a close-up alongside the full board.",
    parameters: Type.Object({
      view: Type.Optional(Type.String({
        description: "A section id to see close up alongside the full board.",
      })),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).look(params.view)),
  });
};

export default registerLook;
