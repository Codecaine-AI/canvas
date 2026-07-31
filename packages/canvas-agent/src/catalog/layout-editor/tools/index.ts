/**
 * Registration mechanics — the catalog registers what the service defines.
 *
 * The tool surface itself lives in service/session/tools/: operations/ holds
 * the gesture descriptors (the board mutators) and workflow/ holds everything
 * else — the deliberate perception call, the description/title pair, the
 * annotation-thread family, and the run-ending finalize. Each descriptor
 * carries its own declaration (name, label, description, sealed parameter
 * schema), so no tool declares anything here: the two loops forward the
 * rosters to the kernel verbatim, in the order the model meets the tools —
 * the gestures first, then the workflow calls, `finalize` last — and install
 * a one-line dispatch into the runtime the harness binds at spawn time
 * (./runtime.ts). Registration is side-effect-free and runs without a bound
 * runtime, because the kernel dry-runs this module at boot to harvest the
 * tool allowlist.
 */
import { defineTools } from "@agent-kernel/kernel/agent-definition";

import { TOOL_CALL_CAP_OVERRIDE } from "../../../service/kernel";
import { operationTools } from "../../../service/session/tools/operations";
import { workflowTools } from "../../../service/session/tools/workflow";
import {
  requireRuntime,
  toToolResult,
  type LayoutToolRuntime,
} from "./runtime";

export type { ToolRegistration, ToolRegistrar } from "./runtime";

interface ToolResultEventWithDetails {
  details: unknown;
}

export function layoutToolErrorOverride(event: ToolResultEventWithDetails) {
  if (
    typeof event.details === "object"
    && event.details !== null
    && "isError" in event.details
    && event.details.isError === true
  ) {
    return { isError: true as const };
  }
  return undefined;
}

export const tools = defineTools<LayoutToolRuntime>((pi, runtime) => {
  /*
   * A tool's returned error bit is not the persisted message error bit. Runtime
   * failures are mirrored into details by toToolResult, then this sanctioned
   * result hook overrides only isError; omitted content/details keep the
   * executed tool result unchanged.
   */
  pi.on("tool_result", (event) => layoutToolErrorOverride(event));

  /*
   * The prompt's one-call cadence is enforced at the wire, not just asked
   * for: while the cap sits at its one-call default, every provider request
   * carries parallel_tool_calls=false, so the model cannot emit a second
   * tool call in the same assistant message. A raised cap
   * (CANVAS_AGENT_TOOL_CALL_CAP=2|3) keeps the provider default and leaves
   * batching judgment to the prompt.
   */
  if ((TOOL_CALL_CAP_OVERRIDE ?? 1) === 1) {
    pi.on("before_provider_request", (event) => ({
      ...(event.payload as Record<string, unknown>),
      parallel_tool_calls: false,
    }));
  }

  for (const tool of operationTools) {
    pi.registerTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      executionMode: tool.executionMode,
      execute: async (_toolCallId, params) =>
        toToolResult(requireRuntime(runtime).operation(
          tool.name,
          params as Record<string, unknown>,
        )),
    });
  }

  for (const tool of workflowTools) {
    pi.registerTool({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      executionMode: tool.executionMode,
      execute: async (_toolCallId, params) =>
        toToolResult(
          await tool.invoke(requireRuntime(runtime), params as Record<string, unknown>),
          tool.terminate,
        ),
    });
  }
});

export default tools;
