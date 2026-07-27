/**
 * `finalize` — the only tool that ends the run. It is the one tool whose
 * result terminates, and ../state/rules/operations.ts records the outcome it
 * carried.
 */
import { Type } from "@mariozechner/pi-ai";

import {
  requireRuntime,
  toToolResult,
  type ToolRegistration,
} from "./runtime";

export const registerFinalize: ToolRegistration = (pi, runtime) => {
  pi.registerTool({
    name: "finalize",
    label: "Finalize run",
    description:
      "End the run. outcome \"committed\" proposes the current draft for operator review: it is blocked (and the run continues) while error-tier diagnostics remain in the edited scope, any user request is still open, or the draft does not differ from the board — fix or dispose those first; warnings never block, but the message must name any flaw you knowingly ship. outcome \"none\" ends the run without a proposal, leaving the board untouched — the message tells the operator why; prefer partial fulfillment over an empty-handed exit. message is required for both outcomes: one plain-language line. A successful finalize ends your run.",
    parameters: Type.Object({
      outcome: Type.Union([Type.Literal("committed"), Type.Literal("none")], {
        description: "committed = propose the draft; none = end without a proposal.",
      }),
      message: Type.String({
        description: "committed: one-line summary of what you changed, e.g. \"Lined up the three steps and evened the gaps to 64px.\" none: the reason no proposal could be made.",
      }),
    }),
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toToolResult(requireRuntime(runtime).finalize(params.outcome, params.message), true),
  });
};

export default registerFinalize;
