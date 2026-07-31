/**
 * The request queue: the annotation threads on this board, tracked with a
 * session-level status per entry. Every entry starts `open`; the agent answers
 * a user-authored one by editing board content and then disposes it with
 * resolve_request (done/declined + note), which also writes the disposition
 * into the thread on the draft document.
 *
 * A thread the agent itself opened rides the same queue so the model can see
 * its own outstanding questions, labelled by author; only user-authored
 * threads gate a committed finalize.
 *
 * This module renders the queue in its two homes: section ③'s <requests>
 * block, re-rendered from the live queue on every request by the
 * layout-editor's state/ sidecar (and seeded from the store's pre-formatted
 * `sessionData.userRequests` when the live session is out of reach), and the
 * REQUESTS block that resolve_request / add_annotation return. Both render the
 * thread: the opening post with its author, then one indented line per reply,
 * oldest first.
 *
 * The `user-requests` context loader that used to own the first of those
 * retired with the state layer: the queue moves while the agent works, so it
 * belongs to the re-rendered section, not to a pinned spawn block.
 */
import type {
  AgentRect,
  AgentSessionAnnotation,
  AgentSessionAnnotationReply,
} from "../../../protocol";

export const USER_REQUESTS_EMPTY = "(none — no user comments or requests on this board)";

export type RequestStatus = "open" | "done" | "declined";

export type RequestAuthor = "human" | "agent" | "system";

/** One queue entry: an annotation thread plus its session-level disposition. */
export interface RequestQueueEntry {
  /** Session-stable model-facing id: R1, R2, … in queue order. */
  alias: string;
  /** The underlying annotation id (document or invoke annotation). */
  annotationId: string;
  target: AgentSessionAnnotation["target"];
  intent: string;
  /** The thread's opening post. */
  body: string;
  /** Who opened the thread. Only non-agent threads gate a committed finalize. */
  createdBy: RequestAuthor;
  /** Everything said since the opening post, oldest first. */
  replies: AgentSessionAnnotationReply[];
  status: RequestStatus;
  /** The resolve_request note, set when the entry is disposed. */
  note?: string;
}

function fmt(value: number): string {
  return String(Math.round(value));
}

function regionText(region: AgentRect): string {
  return `${fmt(region.x)},${fmt(region.y)} ${fmt(region.width)}×${fmt(region.height)}`;
}

export function targetText(target: AgentSessionAnnotation["target"]): string {
  switch (target.kind) {
    case "object":
      return `object:${target.objectId}`;
    case "connection":
      return `connection:${target.connectionId}`;
    case "region":
      return `region:${regionText(target.region)}`;
  }
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * One compact queue line: open entries carry target, opening author, and full
 * body; disposed entries carry the disposition note.
 */
export function formatRequestLine(entry: RequestQueueEntry): string {
  if (entry.status === "open") {
    return `${entry.alias} open  ${targetText(entry.target)}  ${entry.createdBy}`
      + ` — ${JSON.stringify(oneLine(entry.body))}`;
  }
  return `${entry.alias} ${entry.status} ${JSON.stringify(oneLine(entry.note ?? ""))}`;
}

/**
 * The entry rendered as its thread: the queue line, then one author-labeled
 * line per reply, oldest first. A disposed entry is a closed thread — its line
 * already carries the disposition, so it renders alone.
 */
export function formatRequestThread(entry: RequestQueueEntry): string[] {
  if (entry.status !== "open") return [formatRequestLine(entry)];
  return [
    formatRequestLine(entry),
    ...entry.replies.map((reply) =>
      `    ↳ ${reply.author} — ${JSON.stringify(oneLine(reply.body))}`),
  ];
}

/** Section ③'s <requests> body: one thread per entry, or the empty marker. */
export function formatRequestQueue(entries: readonly RequestQueueEntry[]): string {
  if (entries.length === 0) return USER_REQUESTS_EMPTY;
  return entries.flatMap((entry) => formatRequestThread(entry)).join("\n");
}

/**
 * The REQUESTS block for tool results: disposal tally plus the queue threads.
 * Finalize (committed) requires every user-authored entry to be disposed.
 */
export function formatRequestsBlock(entries: readonly RequestQueueEntry[]): string {
  if (entries.length === 0) return "REQUESTS · none";
  const disposed = entries.filter((entry) => entry.status !== "open").length;
  return [
    `REQUESTS · ${disposed}/${entries.length} disposed`,
    ...entries.flatMap((entry) =>
      formatRequestThread(entry).map((line) => `  ${line}`)),
  ].join("\n");
}
