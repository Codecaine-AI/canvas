/**
 * `set_board_title` — the TopBar rename, from the agent side. The twin of
 * update_description: same shape, same reporting, different document channel.
 *
 * Trimmed and non-empty, matching the human reducer
 * (canvas/state/actions/reducer.ts, canvas.updateDocumentTitle) — the reducer
 * silently no-ops an empty rename, and a silent no-op is the wrong answer to a
 * model that just spent a call, so an empty title is rejected here instead of
 * being swallowed. An identical title is the ordinary no-op.
 */
import { Type } from "@mariozechner/pi-ai";

import { formatDiagnostics, runDiagnostics } from "../../../../board/lints/run";
import { commitDraft } from "../../perception/live-draft-view";
import type { SessionEventSink } from "../../perception/perception";
import type { LayoutSession } from "../../store";
import type { LayoutToolTextResult } from "../runtime";
import { defineWorkflowTool } from "./workflow-tool";

export function toolSetBoardTitle(
  session: LayoutSession,
  title: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  const details = { operation: "set_board_title" };
  if (typeof title !== "string" || title.trim() === "") {
    return {
      isError: true,
      text: "set_board_title rejected: title must be a non-empty string — the board is never left nameless.",
    };
  }
  const next = title.trim();
  if (session.draft.title === next) {
    return {
      text: "NO-OP · set_board_title — the board is already called that.",
      details,
    };
  }

  const previous = session.draft.title;
  const label = "set_board_title";
  commitDraft(session, { ...session.draft, title: next }, label);
  const diagnostics = runDiagnostics(session.draft);
  emit(session, {
    type: "proposal",
    sessionId: session.id,
    n: session.proposalCount,
  });
  emit(session, {
    type: "delta",
    sessionId: session.id,
    n: session.proposalCount,
    delta: label,
    lint: formatDiagnostics(diagnostics),
  });
  return {
    text: [
      `APPLIED · ${label}`,
      `DELTA · title ${previous === undefined ? "none" : JSON.stringify(previous)} → ${JSON.stringify(next)}`,
    ].join("\n"),
    details,
  };
}

export const setBoardTitle = defineWorkflowTool({
  name: "set_board_title",
  label: "Set board title",
  description:
    "Rename the board — the name shown above it, not the description. Use it when the diagram's subject has moved on from the name it was created with; it pairs with update_description, which carries the standing account of what the board holds.",
  fields: {
    title: Type.String({
      description: "The board's new name — short, and what a person would call it.",
    }),
  },
  invoke: async (runtime, params) =>
    runtime.setBoardTitle(params.title),
});
