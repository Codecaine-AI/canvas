/**
 * Full-board raster ownership for a live layout session.
 *
 * The invariant: if `session.draft` changed, the current-board render was
 * updated. Every draft write goes through `commitDraft`, which assigns the
 * draft and captures fresh pixels in one move; `liveDraftView` re-renders
 * lazily whenever the retained pixels do not match the exact current draft,
 * so the state attachments always carry the board as it stands.
 */
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { rasterizeSvgToPng } from "../../render";
import type { CurrentBoardRender, LayoutSession } from "../store";
import { BOARD_VIEW_WIDTH, renderBoardView } from "./views";

/** Post-change rasters retained per session. Older entries drop off the front. */
export const CHANGE_RENDER_LOG_LIMIT = 512;

export interface LiveDraftView {
  kind: "current-board";
  png: Buffer;
  n: number;
  summary: string;
  at: string;
}

function renderBoardPng(session: LayoutSession): Buffer {
  const rendered = renderBoardView(session.draft, { width: BOARD_VIEW_WIDTH });
  return rasterizeSvgToPng(rendered.svg).png;
}

/** Install already-rasterized pixels as the eager render for the exact draft. */
export function storeCurrentBoardPng(
  session: LayoutSession,
  png: Buffer,
  summary: string,
  at = new Date().toISOString(),
): CurrentBoardRender {
  const current: CurrentBoardRender = {
    png,
    n: session.proposalCount,
    summary,
    at,
    forDraft: session.draft,
  };
  session.currentBoard = current;
  session.currentBoardRenderFailure = undefined;
  return current;
}

/**
 * Eagerly capture the exact current draft. A failed raster preserves the last
 * successful `currentBoard`, records a degradation note for `<views>`, and
 * returns null instead of failing the tool call.
 */
export function captureCurrentBoard(
  session: LayoutSession,
  summary: string,
  options: { recordChange?: boolean } = {},
): CurrentBoardRender | null {
  try {
    const png = renderBoardPng(session);
    const at = new Date().toISOString();
    const current = storeCurrentBoardPng(session, png, summary, at);

    if (options.recordChange) {
      const log = session.changeRenders ?? (session.changeRenders = []);
      // The current board and its history entry intentionally share one Buffer.
      log.push({ n: current.n, summary, png, at });
      if (log.length > CHANGE_RENDER_LOG_LIMIT) {
        log.splice(0, log.length - CHANGE_RENDER_LOG_LIMIT);
      }
    }
    return current;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.currentBoardRenderFailure = `render failed: board view — ${message}`;
    return null;
  }
}

/**
 * The one draft-commit choke point. Assigns the draft, then unconditionally
 * refreshes the current-board render for it, so no write can leave the state
 * attachments carrying pixels of a board that no longer exists. `recordChange`
 * additionally logs the raster into the change history — geometry-bearing
 * gestures record; bookkeeping writes (title, description, threads) do not.
 */
export function commitDraft(
  session: LayoutSession,
  draft: InteractiveCanvasDocument,
  summary: string,
  options: { recordChange?: boolean } = {},
): CurrentBoardRender | null {
  session.draft = draft;
  return captureCurrentBoard(session, summary, options);
}

/** Read the current-board render, re-rendering lazily whenever it is stale or absent. */
export function liveDraftView(session: LayoutSession): LiveDraftView {
  const current = session.currentBoard;
  if (current?.forDraft === session.draft) {
    return { kind: "current-board", ...current };
  }

  const captured = captureCurrentBoard(session, current?.summary ?? "session start");
  if (!captured) {
    throw new Error(
      session.currentBoardRenderFailure?.replace(/^render failed: board view — /, "")
        ?? "board render unavailable",
    );
  }
  return { kind: "current-board", ...captured };
}
