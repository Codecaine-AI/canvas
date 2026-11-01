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
  forgetLayoutSession,
  layoutSessionForContainer,
  registerLayoutSession,
} from "./registry";

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
  toolFinalize,
  toolLook,
  toolOperation,
  toolReplyAnnotation,
  toolResolveRequest,
  toolSetBoardTitle,
  toolUpdateDescription,
  type LayoutToolHost,
  type LayoutToolState,
} from "./tools";

export {
  bootPerception,
  houseStyleExemplar,
  type BootImages,
  type BootPerception,
} from "./perception/boot";

export { vocabularyContactSheet } from "./perception/contact-sheet";

export {
  BOARD_VIEW_WIDTH,
  SECTION_VIEW_WIDTH,
  renderBoardView,
  renderSectionView,
  type RenderedView,
} from "./perception/views";
