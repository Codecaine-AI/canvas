/**
 * The one read of the live document, shared by every block below it.
 *
 * WHERE THE BOARD COMES FROM. `S` must be JSON-serializable, so it cannot hold
 * the canvas document — and the document already has one authority, the
 * session store's baseline/draft pair. Two ways to render a fresh board from
 * that were open:
 *
 *   (a) re-render the board text into `S` as strings on every board-mutating
 *       event, or
 *   (b) look the live session up at render time and derive the text then.
 *
 * (a) does not actually avoid the problem: `update` would need the document to
 * re-render it, and `update` has no more access to it than `render` does — the
 * SessionEvent union carries tool text, not documents. Both roads end at the
 * same seam, so this module takes (b), the one that cannot go stale: the
 * session store publishes container id → session (service/session/registry),
 * `RenderContext` carries the container id, and the draft is read directly.
 * Nothing is copied, and the board text in the request describes the document
 * as it stands at that instant.
 *
 * When the lookup misses — a unit test, a replay of a persisted state.json,
 * any process that is not the harness — each block falls back to the
 * spawn-time snapshot `seed` captured and says so in its tag. Degraded, never
 * wrong.
 */
import { formatRequestQueue } from "../../../../service/session/snapshots/user-requests";
import {
  formatBoardEdgesDigest,
  formatBoardObjectsDigest,
} from "../../../../board/digest";
import { diagnosticLines, runDiagnostics } from "../../../../board/lints/run";
import { boardDiffBlock } from "../../../../service/session/perception/perception";
import type { LayoutSession } from "../../../../service/session/store";

/** The board as it stands right now, read from the authoritative session. */
export interface LivePicture {
  descriptionMarkdown: string;
  objectsText: string;
  edgesText: string;
  objects: number;
  edges: number;
  /** One line per open finding, ids assigned, split by severity. */
  errorLines: string[];
  warningLines: string[];
  errors: number;
  warnings: number;
  requests: string;
  openRequests: number;
  diff: string;
}

/**
 * Derive the whole picture, or nothing.
 *
 * This runs on every provider request over a document the model is actively
 * rewriting, and a throw here would cost the request its entire state block —
 * the kernel's context hook would pass the request through untouched rather
 * than fail it. So a bad draft degrades to the seeded snapshot, clearly
 * labelled, instead of silently deleting section ③.
 */
export function tryLivePicture(session: LayoutSession): LivePicture | null {
  try {
    return livePicture(session);
  } catch {
    return null;
  }
}

function livePicture(session: LayoutSession): LivePicture {
  const draft = session.draft;
  const diagnostics = runDiagnostics(draft);
  const bySeverity = (severity: "error" | "warning"): string[] =>
    diagnostics
      .filter((finding) => finding.severity === severity)
      .flatMap((finding) => diagnosticLines(finding));
  return {
    descriptionMarkdown: draft.description?.trim() ? draft.description : "",
    objectsText: formatBoardObjectsDigest(draft),
    edgesText: formatBoardEdgesDigest(draft),
    objects: draft.objects.length,
    edges: draft.connections.length,
    errorLines: bySeverity("error"),
    warningLines: bySeverity("warning"),
    errors: diagnostics.filter((finding) => finding.severity === "error").length,
    warnings: diagnostics.filter((finding) => finding.severity === "warning").length,
    requests: formatRequestQueue(session.requests),
    openRequests: session.requests.filter((entry) => entry.status === "open").length,
    diff: boardDiffBlock(session),
  };
}
