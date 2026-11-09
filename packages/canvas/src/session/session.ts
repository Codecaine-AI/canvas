/**
 * The layout session: one board being edited through the gesture and
 * workflow tools. The toolkit (../toolkit) opens one straight from a
 * `canvases/<id>.canvas.json` file; every tool, perception block and snapshot
 * helper takes it as-is.
 */
import type { InteractiveCanvasDocument } from "../state/schema";

import type { ScopeResolution } from "../board/scope";
import type { Diagnostic } from "../board/lints";
import type { DetailVerdict } from "../board/detail-value";
import type {
  AgentProposal,
  AgentSessionAnnotation,
  AgentSessionEvent,
  AgentSessionStatus,
  AgentSessionViewport,
} from "./protocol";

import type { CanvasStyle } from "./canvas-style";
import type { RequestQueueEntry } from "./snapshots/user-requests";
import type { SessionView } from "./perception/view-log";

/** The eager full-board raster for the session's exact current draft. */
export interface CurrentBoardRender {
  png: Buffer;
  /** Applied-change ordinal; zero for the spawn render. */
  n: number;
  /** Gesture summary that produced this board, or the spawn label. */
  summary: string;
  at: string;
  /** Identity guard: immutable draft replacement invalidates these pixels. */
  forDraft: InteractiveCanvasDocument;
}

/** One retained post-change full-board raster. */
export interface ChangeRender {
  n: number;
  summary: string;
  png: Buffer;
  at: string;
}

export interface LayoutSession {
  id: string;
  canvasId: string;
  canvasPath: string;
  baseline: InteractiveCanvasDocument;
  baselineHash: string;
  /** Baseline scope geometry and membership, frozen for rebase checks. */
  scopeResolution: ScopeResolution;
  /** Resolved Ring-0 ids (baseline scope; draft-created ids never join). */
  scopeIds: Set<string>;
  draft: InteractiveCanvasDocument;
  proposalCount: number;
  proposal: AgentProposal | null;
  status: AgentSessionStatus;
  error: string | null;
  instruction: string;
  annotations: AgentSessionAnnotation[];
  viewport: AgentSessionViewport | undefined;
  containerId: string;
  sessionDir: string;
  events: AgentSessionEvent[];
  subscribers: Set<(event: AgentSessionEvent) => void>;
  /** Resolves when the current agent run settles. */
  runPromise: Promise<void> | null;
  /**
   * The user-request queue with session-level statuses (document + invoke
   * annotations merged at open; resolve_request disposes entries).
   */
  requests: RequestQueueEntry[];
  /** Diagnostics attached to the previous apply result, for LINTS delta reporting. */
  lastDiagnostics?: Diagnostic[];
  /**
   * Rasters returned by look, newest last (./perception/view-log). Their
   * lightweight state refs describe recent tool results; the images
   * themselves ride the recent conversation tail.
   */
  views: SessionView[];
  /** Monotonic capture counter behind SessionView.seq. */
  viewCount: number;
  /** Eager in-memory full-board render, valid only for its immutable draft. */
  currentBoard?: CurrentBoardRender;
  /** Applied-change rasters, oldest first and bounded by CHANGE_RENDER_LOG_LIMIT. */
  changeRenders: ChangeRender[];
  /** Latest eager current-board raster failure, shown in the state <views> block. */
  currentBoardRenderFailure?: string;
  /**
   * The workspace canvas style (corner radii, border widths) read from
   * `canvases/canvas-style.json` when the session opened (./canvas-style).
   * Every static render and border/chip-dependent measurement the session
   * makes resolves through it; absent means the defaults.
   */
  canvasStyle?: CanvasStyle;
  /**
   * Jev's verdicts on node details (board/detail-value), keyed by
   * `detailKey`, filled by canvas_check. The finishing lints read them, so
   * finalize blocks on a known `remove` without calling the network.
   */
  detailVerdicts?: Map<string, DetailVerdict>;
}

/** Record an event and fan it out without letting a dead subscriber fail the session. */
export function emitSessionEvent(session: LayoutSession, event: AgentSessionEvent): void {
  session.events.push(event);
  for (const listener of session.subscribers) {
    try {
      listener(event);
    } catch {
      // A dead subscriber never takes the session down.
    }
  }
}
