/**
 * `update_description` — replaces the board's standing account of what the
 * diagram represents. It changes the document, so ../state/rules/operations.ts
 * logs it on the op ledger alongside the typed mutators.
 */
import { Type } from "@mariozechner/pi-ai";

import {
  requireRuntime,
  toToolResult,
  type ToolRegistration,
} from "./runtime";

export const registerUpdateDescription: ToolRegistration = (pi, runtime) => {
  pi.registerTool({
    name: "update_description",
    label: "Update description",
    description:
      "Rewrite the board's standing account of what the diagram represents, its pieces, and how it reads. The description is replaced whole with this markdown; a later run reads it to orientate before editing.",
    parameters: Type.Object({
      description: Type.String({
        description: "The full replacement markdown for the board description.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).updateDescription(params.description)),
  });
};

export default registerUpdateDescription;
