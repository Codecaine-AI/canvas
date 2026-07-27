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

import { formatRequestQueue } from "../../../loaders/user-requests";
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

/** A raster that was produced. The payload lives on the session view log. */
export interface ViewRef {
  turn: number;
  kind: "board" | "section";
  sectionId: string | null;
}

/** Spawn-time snapshots — the fallback when the live session is unreachable. */
export interface SeededBoard {
  /** formatEditorState(): frame, selection, boundary arrows, viewport. */
  editor: string;
  /** Description + full digest + full lint report, as of spawn. */
  board: string;
  /** formatRequestQueue(): the annotation-thread queue as of spawn. */
  requests: string;
  /** Finding counts at spawn — the "(was N)" the lint line reports against. */
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
  const instruction = str(editor?.instruction);
  const seeded: SeededBoard = {
    editor: formatEditorSnapshot(editor),
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

/**
 * The editor snapshot as text. Inlined rather than imported from the retired
 * editor-state loader's formatter so a shape change there cannot silently
 * reshape the state block; the fields are the ones the store puts on
 * sessionData.editorState.
 */
function formatEditorSnapshot(snapshot: Record<string, unknown> | undefined): string {
  if (!snapshot) return "";
  const lines: string[] = [];
  const canvasId = str(snapshot.canvasId);
  const baselineHash = str(snapshot.baselineHash);
  if (canvasId) {
    lines.push(`canvas: ${canvasId}${baselineHash ? ` (baseline ${baselineHash.slice(0, 12)})` : ""}`);
  }
  const frame = snapshot.frame as Record<string, number> | undefined;
  if (frame) {
    lines.push(`scope frame: x=${frame.x} y=${frame.y} w=${frame.width} h=${frame.height}`);
  }
  const selection = Array.isArray(snapshot.selection)
    ? (snapshot.selection as Array<Record<string, unknown>>)
    : [];
  lines.push(
    `selection (${selection.length} object${selection.length === 1 ? "" : "s"} in scope):`,
  );
  for (const item of selection) {
    lines.push(`- ${str(item.type)} ${JSON.stringify(str(item.text))} (${str(item.id)})`);
  }
  if (typeof snapshot.boundaryArrowCount === "number") {
    lines.push(`arrows crossing the scope edge: ${snapshot.boundaryArrowCount}`);
  }
  const viewport = snapshot.viewport as Record<string, unknown> | undefined;
  const rect = viewport?.rect as Record<string, number> | undefined;
  if (rect) {
    const zoom = typeof viewport?.zoom === "number" ? ` zoom=${viewport.zoom}` : "";
    lines.push(`user viewport: x=${rect.x} y=${rect.y} w=${rect.width} h=${rect.height}${zoom}`);
  }
  return lines.join("\n");
}
