/** Public import surface for the layout session, its helpers, and directly tested tools. */
export {
  emitSessionEvent,
  type ChangeRender,
  type CurrentBoardRender,
  type LayoutSession,
} from "./session";

export {
  boardStateSnapshot,
  draftWithPageFrame,
  syncSessionRequests,
  userRequestsSnapshot,
  wreckedDocumentError,
  type WreckedDocumentOptions,
} from "./snapshots/context";

export {
  applyOperationToDraft,
  describePatchOperation,
  resolveFitSection,
  resolveSizeLike,
} from "./apply-ops";

export {
  boardDiffBlock,
  documentDelta,
  lookPerception,
  operationPerception,
  type DocumentDelta,
} from "./perception/perception";

export {
  describeSessionView,
  newestSessionViews,
  recordSessionView,
  VIEW_LOG_LIMIT,
  type SessionView,
} from "./perception/view-log";

export {
  captureCurrentBoard,
  CHANGE_RENDER_LOG_LIMIT,
  commitDraft,
  liveDraftView,
  storeCurrentBoardPng,
  type LiveDraftView,
} from "./perception/live-draft-view";

export {
  classifyDelta,
  DELTA_KINDS,
  deltaTargetId,
  entityKindOf,
  SHAPE_OBJECT_TYPES,
  type BoardDelta,
  type DeltaKind,
  type EntityKind,
} from "./perception/op-surface";

export {
  createLayoutToolState,
  createToolRuntime,
  toolAddAnnotation,
  toolDescribeBoard,
  toolFinalize,
  toolLook,
  toolOperation,
  toolReplyAnnotation,
  toolResolveRequest,
  type LayoutToolHost,
  type LayoutToolState,
} from "./tools";

export { vocabularyContactSheet } from "./perception/contact-sheet";

export {
  BOARD_VIEW_WIDTH,
  SECTION_VIEW_WIDTH,
  renderBoardView,
  renderSectionView,
  type RenderedView,
} from "./perception/views";
