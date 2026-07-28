/**
 * The state type `S` and its seed — board v1 (state-shapes.html §5, D93).
 *
 * `S` must be JSON-serializable, so it cannot hold the canvas document, and it
 * does not try to: it holds the work AROUND the document — the ask, the scope
 * as it stood at spawn, the op ledger, which renders were taken, the counters,
 * the outcome. The document itself has one authority, the session store's
 * baseline/draft pair, and ../render reads it live every request.
 *
 * The spawn-time snapshots in `seeded` are the fallback for when that live read
 * is impossible (a unit test, a replay of a persisted state.json, any process
 * that is not the harness). Degraded, never wrong.
 */
import type { SpawnContext } from "@agent-kernel/kernel/context";

import { formatRequestQueue } from "../../../service/session/snapshots/user-requests";
import { OPS_LOG_LIMIT } from "./policy";

export type OpStatus = "applied" | "noop" | "error" | "note";

/** One tool result, reduced to the line the model needs to recall it. */
export interface OpLine {
  turn: number;
  tool: string;
  target: string | null;
  status: OpStatus;
  summary: string;
}

/** A `look` raster ref; its payload rides the tool result and session view log. */
export interface ViewRef {
  turn: number;
  kind: "section" | "crop";
  sectionId: string | null;
  /**
   * What a union frame covered, said the way the call said it:
   * `ids <a>+<b>+…`. Crops only — a lone-id ref is already fully described by
   * its kind and id.
   */
  region?: string;
}

/** Spawn-time snapshots — the fallback when the live session is unreachable. */
export interface SeededBoard {
  /** Description + full digest + full lint report, as of spawn. */
  board: string;
  /** formatRequestQueue(): the annotation-thread queue as of spawn. */
  requests: string;
  /** Finding counts at spawn — the <lints> attrs when the live read fails. */
  lints: { errors: number; warnings: number };
}

export interface BoardWorkState {
  kind: "board-v1";
  boardId: string;
  containerId: string | null;
  sessionId: string | null;
  /** The operator instruction, then any steering that followed. */
  instructions: string[];
  seeded: SeededBoard;
  ops: OpLine[];
  views: ViewRef[];
  /**
   * Tool calls awaiting their result, by tool-call id. A tool_result event
   * carries the tool's name but not its arguments, and the op log wants the
   * entity the call named — so the call's input waits here for its result.
   */
  pending: Record<string, { tool: string; input: Record<string, unknown> }>;
  turns: number;
  toolCalls: number;
  toolErrors: number;
  userMessages: number;
  /** Set once finalize succeeds. */
  outcome: { outcome: string; message: string } | null;
  lastEventSeq: number;
}

// ─── Primitives shared by the seed and the update rules ────────────────────

/** A sessionData value as text, or "" — never undefined inside `S`. */
export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Keep the newest `limit` entries of a bounded list. */
export function capped<T>(items: T[], limit: number): T[] {
  return items.length > limit ? items.slice(items.length - limit) : items;
}

function counts(value: unknown): { errors: number; warnings: number } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const n = (raw: unknown): number =>
    typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  return { errors: n(record.errors), warnings: n(record.warnings) };
}

// ─── Seed ──────────────────────────────────────────────────────────────────

/**
 * Build the initial state from the same sessionData the retired board-state /
 * editor-state / user-requests loaders read. `prior` is a previous run's final
 * state, handed in explicitly by the caller — the run-scoped work log carries
 * over, the spawn snapshots are re-taken because the board moved on.
 */
export function seedBoardWork(
  ctx: SpawnContext,
  prior?: BoardWorkState,
): BoardWorkState {
  const data = (ctx.sessionData ?? {}) as Record<string, unknown>;
  const editor = data.editorState as Record<string, unknown> | undefined;
  // Trimmed to match recordSteering's trim: the harness sends the same string
  // as the spawn user message, and the dedupe there is exact equality.
  const instruction = str(editor?.instruction).trim();
  const seeded: SeededBoard = {
    board: str(data.boardState),
    requests: str(data.userRequests) || formatRequestQueue([]),
    lints: counts(data.boardLints),
  };
  return {
    kind: "board-v1",
    boardId: str(editor?.canvasId) || str(data.sessionId) || ctx.agentName,
    containerId: str(data.containerId) || null,
    sessionId: str(data.sessionId) || null,
    instructions: instruction.length > 0 ? [instruction] : [],
    seeded,
    ops: prior?.ops ? prior.ops.slice(-OPS_LOG_LIMIT) : [],
    views: [],
    pending: {},
    turns: 0,
    toolCalls: prior?.toolCalls ?? 0,
    toolErrors: prior?.toolErrors ?? 0,
    userMessages: 0,
    outcome: null,
    lastEventSeq: -1,
  };
}
