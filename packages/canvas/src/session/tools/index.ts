/**
 * Public import surface for the layout tool surface: the runtime contract and
 * its binding, the workflow roster, and the directly tested tool functions.
 * The path `session/tools` resolves here.
 */
export type {
  LayoutToolRenderResult,
  LayoutToolRuntime,
  LayoutToolTextResult,
  LookRequest,
} from "./runtime";

export {
  defineWorkflowTool,
  type WorkflowSpec,
  type WorkflowTool,
} from "./workflow/workflow-tool";

export { workflowTools } from "./workflow";

export { toolLook } from "./workflow/look";
export { toolDescribeBoard, type DescribeBoardFields } from "./workflow/describe-board";
export { toolAnnotate, type AnnotateFields } from "./workflow/annotate";
export { toolResolveRequest } from "./workflow/resolve-request";
export { toolFinalize } from "./workflow/finalize";

export {
  createLayoutToolState,
  createToolRuntime,
  toolOperation,
  type LayoutToolHost,
  type LayoutToolState,
} from "./create-runtime";
