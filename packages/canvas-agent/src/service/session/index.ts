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
} from "./context";

export {
  applyOperationToDraft,
  describePatchOperation,
  resolveFitSection,
} from "./apply-ops";

export {
  boardDiffBlock,
  documentDelta,
  lookPerception,
  operationPerception,
  scopedDigestBlock,
  type DocumentDelta,
} from "./perception";

export {
  classifyOperation,
  entityKindOf,
  MODEL_OPERATION_KINDS,
  operationTargetId,
  SHAPE_OBJECT_TYPES,
  type EntityKind,
  type ModelOperation,
  type ModelOperationKind,
} from "./op-surface";

export {
  createLayoutToolState,
  createToolRuntime,
  toolAddAnnotation,
  toolFinalize,
  toolOperation,
  toolResolveRequest,
  toolUpdateDescription,
  type LayoutToolHost,
  type LayoutToolState,
} from "./tools";

export { toolLook } from "./look";

export {
  bootPerception,
  houseStyleExemplar,
  type BootImages,
  type BootPerception,
} from "./boot";

export { vocabularyContactSheet } from "./contact-sheet";

export {
  BOARD_VIEW_WIDTH,
  SECTION_VIEW_WIDTH,
  renderBoardView,
  renderSectionView,
  type RenderedView,
} from "./views";
