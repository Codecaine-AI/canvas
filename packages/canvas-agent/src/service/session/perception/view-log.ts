/**
 * The session's rendered-view log for `look` results.
 *
 * Rasters are the one part of the working picture that cannot live in the
 * agent's state object: `S` must stay JSON-serializable (it snapshots to
 * state.json), and a PNG is neither small nor meaningful there. So the
 * payloads live beside the authoritative documents on the session, exactly
 * like the draft itself, and the state sidecar holds only lightweight refs
 * describing which view was taken when.
 *
 * Every raster a `look` call returns passes through here for bookkeeping. The
 * tool result carries those images in the recent conversation tail; state
 * attachments instead come from `currentBoard` and `changeRenders`.
 */
import type { Rect } from "../../../board/types";
import type { LayoutSession } from "../store";

/** One rendered raster the model was shown, with what it depicts. */
export interface SessionView {
  kind: "section" | "crop";
  /** The section rendered close up; null for crop views. */
  sectionId: string | null;
  /** The world rect the camera was cropped to; crop views only. */
  crop?: Rect;
  png: Buffer;
  /** 0-based order of capture within the session. */
  seq: number;
  at: string;
}

/** Rasters retained per session. Older entries drop off the front. */
export const VIEW_LOG_LIMIT = 8;

/**
 * Record one raster. Tolerates a session built before the log existed (the
 * unit-test sessions), because a missing log must never fail a render.
 */
export function recordSessionView(
  session: LayoutSession,
  kind: SessionView["kind"],
  sectionId: string | null,
  png: Buffer,
  crop?: Rect,
): SessionView {
  const log = session.views ?? (session.views = []);
  const view: SessionView = {
    kind,
    sectionId,
    ...(crop !== undefined ? { crop } : {}),
    png,
    seq: session.viewCount ?? 0,
    at: new Date().toISOString(),
  };
  session.viewCount = view.seq + 1;
  log.push(view);
  if (log.length > VIEW_LOG_LIMIT) log.splice(0, log.length - VIEW_LOG_LIMIT);
  return view;
}

/** The `count` most recently captured views, newest first. */
export function newestSessionViews(
  session: LayoutSession,
  count: number,
): SessionView[] {
  const log = session.views ?? [];
  if (count <= 0) return [];
  return log.slice(Math.max(0, log.length - count)).reverse();
}

/** One-line label for a view, for the caption that rides with the images. */
export function describeSessionView(view: SessionView): string {
  if (view.kind === "section") return `a close-up of section ${view.sectionId ?? "?"}`;
  if (!view.crop) return "a cropped region of the board";
  const { x, y, width, height } = view.crop;
  return `a crop of the region ${Math.round(x)},${Math.round(y)}`
    + ` ${Math.round(width)}×${Math.round(height)}`;
}
