/**
 * Registration surface for the layout editor's workflow tools — everything on
 * the surface that is not a gesture: the deliberate perception call, the
 * description/title pair, the annotation-thread family, and the run-ending
 * finalize.
 *
 * `workflowTools` is the roster, in registration order — the order the model
 * meets these tools, after the 25 gestures: `look` first, `finalize` last and
 * alone in carrying `terminate`.
 */
import { addAnnotation } from "./add-annotation";
import { finalize } from "./finalize";
import { look } from "./look";
import { replyAnnotation } from "./reply-annotation";
import { resolveRequest } from "./resolve-request";
import { setBoardTitle } from "./set-board-title";
import { updateDescription } from "./update-description";
import type { WorkflowTool } from "./workflow-tool";

export const workflowTools: readonly WorkflowTool[] = [
  look,
  updateDescription,
  setBoardTitle,
  addAnnotation,
  replyAnnotation,
  resolveRequest,
  finalize,
];
