/** Public import surface for layout-session lifecycle, helpers, and directly tested tools. */
export {
  emitSessionEvent,
  HttpError,
  LayoutSessionStore,
  type LayoutSession,
} from "./store";

export {
  boardStateSnapshot,
  draftWithPageFrame,
  wreckedDocumentError,
  type WreckedDocumentOptions,
} from "./context";

export {
  applyOperationBatch,
  applyOperationToDraft,
  describePatchOperation,
  operationValidationErrors,
} from "./apply-ops";

export {
  createLayoutToolState,
  toolApplyOps,
  toolApplyQuickfix,
  toolBoard,
  toolCommit,
  toolInspect,
  toolRenderDraft,
  type LayoutToolState,
} from "./tools";
