/**
 * Registration surface for the layout editor's workflow tools — everything on
 * the surface that is not a gesture: the deliberate perception call, the
 * board's title and description, the annotation-thread family, and the
 * run-ending finalize.
 *
 * `workflowTools` is the roster, in registration order — the order the model
 * meets these tools, after the 19 gestures: `look` first, `finalize` last and
 * alone in carrying `terminate`.
 */
import { annotate } from "./annotate";
import { describeBoard } from "./describe-board";
import { finalize } from "./finalize";
import { look } from "./look";
import { resolveRequest } from "./resolve-request";
import type { WorkflowTool } from "./workflow-tool";

export const workflowTools: readonly WorkflowTool[] = [
  look,
  describeBoard,
  annotate,
  resolveRequest,
  finalize,
];
