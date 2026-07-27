/**
 * The session's rendered-view log — the working picture's image half.
 *
 * Rasters are the one part of the working picture that cannot live in the
 * agent's state object: `S` must stay JSON-serializable (it snapshots to
 * state.json), and a PNG is neither small nor meaningful there. So the
 * payloads live beside the authoritative documents on the session, exactly
 * like the draft itself, and the state/ sidecar holds only lightweight refs describing
 * which view was taken when.
 *
 * Every raster the harness produces for the model passes through here: the
 * spawn-time full-board render and every render a `look` or a `view=` call
 * returns. `render(state)` attaches the newest few as images on the state
 * side, so a view the model asked for survives longer than the short message
 * tail that carried it.
 */
import type { LayoutSession } from "./store";

/** One rendered raster the model was shown, with what it depicts. */
export interface SessionView {
  kind: "board" | "section";
  /** The section rendered close up; null for the full-board view. */
  sectionId: string | null;
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
): SessionView {
  const log = session.views ?? (session.views = []);
  const view: SessionView = {
    kind,
    sectionId,
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
  return view.kind === "board"
    ? "the full board"
    : `a close-up of section ${view.sectionId ?? "?"}`;
}
