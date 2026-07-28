/**
 * `update_description` — replace the board's standing markdown account of what
 * it represents, its pieces, and how it reads. The description is document
 * content: replacing it counts as a proposal step and reports like one.
 */
import { Type } from "@mariozechner/pi-ai";

import { formatDiagnostics, runDiagnostics } from "../../../../board/lints/run";
import { commitDraft } from "../../perception/live-draft-view";
import type { SessionEventSink } from "../../perception/perception";
import type { LayoutSession } from "../../store";
import type { LayoutToolTextResult } from "../runtime";
import { defineWorkflowTool } from "./workflow-tool";

export function toolUpdateDescription(
  session: LayoutSession,
  description: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  const details = { operation: "update_description" };
  if (typeof description !== "string" || description.trim() === "") {
    return {
      isError: true,
      text: "update_description rejected: description must be a non-empty string.",
    };
  }
  if (session.draft.description === description) {
    return {
      text: "NO-OP · update_description — the board description already reads exactly this.",
      details,
    };
  }

  const previous = session.draft.description;
  const label = "updateDescription";
  commitDraft(session, { ...session.draft, description }, label);
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
      `DELTA · description ${previous === undefined ? "none" : previous.length} → ${description.length} chars`,
    ].join("\n"),
    details,
  };
}

export const updateDescription = defineWorkflowTool({
  name: "update_description",
  label: "Update description",
  description:
    "Rewrite the board's standing account of what the diagram represents, its pieces, and how it reads. The description is replaced whole with this markdown; a later run reads it to orientate before editing.",
  fields: {
    description: Type.String({
      description: "The full replacement markdown for the board description.",
    }),
  },
  invoke: async (runtime, params) =>
    runtime.updateDescription(params.description),
});
