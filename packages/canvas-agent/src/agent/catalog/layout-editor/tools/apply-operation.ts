/**
 * The board-mutating action surface: thirteen typed operations, one tool each
 * — add / update / remove per kind (sections, stickies, objects, connections)
 * plus fit_section, which sections alone have.
 *
 * They are one file because they are one concern with thirteen instances: the
 * specs (name, label, description, parameter schema, execution mode) are
 * declared once in service/session/operations/ and shared with the validator
 * and the <capabilities> block, so listing them here again would be a second
 * roster to keep in sync. What each of these makes true is
 * ../state/rules/operations.ts; how that truth is shown is
 * ../state/render/ops.ts (state-shapes.html §6, the tools↔rules↔render
 * symmetry).
 */
import { operationTools } from "../../../../service/session/operations";

import {
  requireRuntime,
  toToolResult,
  type ToolRegistration,
} from "./runtime";

export const registerApplyOperation: ToolRegistration = (pi, runtime) => {
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
};

export default registerApplyOperation;
