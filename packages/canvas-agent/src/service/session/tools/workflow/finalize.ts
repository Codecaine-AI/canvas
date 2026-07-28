/**
 * `finalize` — the only run-ending call. `committed` re-runs the all-findings
 * lint gate and requires every user-authored request to be disposed before
 * proposing the draft; a thread the agent opened is non-blocking, so an
 * unanswered question never traps the run. `none` ends without a proposal.
 */
import { Type } from "@mariozechner/pi-ai";

import {
  formatRequestLine,
} from "../../snapshots/user-requests";
import type { AgentProposal } from "../../../../protocol";
import { diffDocuments } from "../../../../board/doc-diff";
import { FINISHING_RULES } from "../../../../board/lints";
import { formatDiagnostics, runDiagnostics } from "../../../../board/lints/run";
import { describePatchOperation } from "../../apply-ops";
import { scopedDiagnostics } from "../../snapshots/context";
import type { SessionEventSink } from "../../perception/perception";
import type { LayoutSession } from "../../store";
import type { LayoutToolTextResult } from "../runtime";
import { defineWorkflowTool } from "./workflow-tool";

export function toolFinalize(
  session: LayoutSession,
  outcome: "committed" | "none",
  message: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  if (outcome !== "committed" && outcome !== "none") {
    return { isError: true, text: 'finalize rejected: outcome must be "committed" or "none".' };
  }
  if (typeof message !== "string" || message.trim() === "") {
    return {
      isError: true,
      text: outcome === "committed"
        ? "finalize rejected: message must be a non-empty one-line summary of what you changed."
        : "finalize rejected: message must be a non-empty explanation for the operator.",
    };
  }

  if (outcome === "none") {
    session.status = "abandoned";
    emit(session, {
      type: "abandoned",
      sessionId: session.id,
      reason: message.trim(),
    });
    return {
      text: "Run ended without a proposal. The board is untouched.",
      details: { outcome },
    };
  }

  // The finishing registry adds the polish rules that would only nag mid-build.
  const diagnostics = runDiagnostics(session.draft, FINISHING_RULES);
  const scoped = scopedDiagnostics(session, diagnostics);
  const blocking = scoped;
  // A thread the agent opened is a question left for the user, answered on
  // their own time — it never gates the commit. User-authored requests do.
  const openRequests = session.requests.filter(
    (request) => request.status === "open" && request.createdBy !== "agent",
  );
  if (blocking.length > 0 || openRequests.length > 0) {
    return {
      isError: true,
      text: [
        "Finalize blocked; the run continues:",
        ...blocking.map((diagnostic) =>
          `- ${diagnostic.id} ${diagnostic.rule}: ${diagnostic.message}`
          + (diagnostic.suggestion ? ` (${diagnostic.suggestion})` : "")),
        ...openRequests.map((request) =>
          `- ${formatRequestLine(request)}  (dispose with resolve_request)`),
      ].join("\n"),
    };
  }

  const unresolvedWarnings = formatDiagnostics(
    scoped.filter((diagnostic) => diagnostic.severity === "warning"),
  );
  const operations = diffDocuments(session.baseline, session.draft);
  if (operations.length === 0 && session.proposal === null) {
    return { isError: true, text: "Nothing to commit — the draft matches the board." };
  }
  const proposal: AgentProposal = {
    n: Math.max(1, session.proposalCount),
    operations,
    summary: message.trim(),
    delta: operations.length > 0
      ? [
        "Document patch:",
        ...operations.map((operation) => `- ${describePatchOperation(operation)}`),
      ].join("\n")
      : "No changes.",
    lint: unresolvedWarnings,
  };
  session.proposal = proposal;
  session.status = "proposal-ready";
  emit(session, { type: "proposal-ready", sessionId: session.id, proposal });
  return {
    text: `Committed: ${proposal.summary} (${proposal.operations.length} patch operation${proposal.operations.length === 1 ? "" : "s"}). The proposal is now awaiting operator review.`,
    details: { outcome, operations: proposal.operations.length },
  };
}

export const finalize = defineWorkflowTool({
  name: "finalize",
  label: "Finalize run",
  description:
    "End the run. outcome \"committed\" proposes the current draft for operator review: it is blocked (and the run continues) while any lint finding (error or warning) remains in the edited scope, any user request is still open, or the draft does not differ from the board — fix or dispose those first. outcome \"none\" ends the run without a proposal, leaving the board untouched — the message tells the operator why; prefer partial fulfillment over an empty-handed exit. message is required for both outcomes: one plain-language line. A successful finalize ends your run.",
  fields: {
    outcome: Type.Union([Type.Literal("committed"), Type.Literal("none")], {
      description: "committed = propose the draft; none = end without a proposal.",
    }),
    message: Type.String({
      description: "committed: one-line summary of what you changed, e.g. \"Lined up the three steps and evened the gaps to 64px.\" none: the reason no proposal could be made.",
    }),
  },
  terminate: true,
  invoke: async (runtime, params) =>
    runtime.finalize(params.outcome, params.message),
});
