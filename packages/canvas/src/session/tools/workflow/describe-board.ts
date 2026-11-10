/**
 * `describe_board` — rename the board, replace its standing markdown account,
 * or both, in one call. The title is the TopBar rename from the agent side; the
 * description is the board's account of what it represents, its pieces, and how
 * it reads. Both are document content, so a change counts as a proposal step
 * and reports like one, lint delta included.
 *
 * Each field is optional and a null field counts as absent, so a client that
 * sends every key still sends only what it means. A call with neither is
 * refused. Both sent fields are checked before anything is written, and the
 * draft is committed once: a bad description never leaves a half-applied
 * rename behind.
 *
 * The title is trimmed and must be non-empty, matching the human reducer
 * (canvas/state/actions/reducer.ts, canvas.updateDocumentTitle) — the reducer
 * silently no-ops an empty rename, and a silent no-op is the wrong answer to a
 * model that just spent a call, so an empty title is rejected here instead of
 * being swallowed. The description is stored verbatim and must not be blank.
 * A field that already reads exactly what was sent is the ordinary no-op.
 */
import { Type } from "@mariozechner/pi-ai";

import { formatDiagnostics, sessionDiagnostics } from "../../../board/lints/run";
import { commitDraft } from "../../perception/live-draft-view";
import { lintDeltaBlock, type SessionEventSink } from "../../perception/perception";
import type { LayoutSession } from "../../session";
import type { LayoutToolTextResult } from "../runtime";
import { defineWorkflowTool } from "./workflow-tool";

/** What `describe_board` was sent. A null field counts as absent. */
export interface DescribeBoardFields {
  title?: string | null;
  description?: string | null;
}

export function toolDescribeBoard(
  session: LayoutSession,
  fields: DescribeBoardFields,
  emit: SessionEventSink,
): LayoutToolTextResult {
  const label = "describe_board";
  const details = { operation: label };
  const title = fields.title ?? undefined;
  const description = fields.description ?? undefined;

  const errors: string[] = [];
  if (title === undefined && description === undefined) {
    errors.push("send title, description or both.");
  }
  if (title !== undefined && (typeof title !== "string" || title.trim() === "")) {
    errors.push("title must be a non-empty string — the board is never left nameless.");
  }
  if (description !== undefined && (typeof description !== "string" || description.trim() === "")) {
    errors.push("description must be a non-empty string.");
  }
  if (errors.length > 0) {
    return {
      isError: true,
      text: errors.length === 1
        ? `${label} rejected: ${errors[0]}`
        : [`${label} rejected:`, ...errors.map((error) => `  - ${error}`)].join("\n"),
    };
  }

  const before = session.draft;
  const nextTitle = title?.trim();
  const retitle = nextTitle !== undefined && nextTitle !== before.title;
  const redescribe = description !== undefined && description !== before.description;
  if (!retitle && !redescribe) {
    const notes = [
      ...(nextTitle !== undefined ? ["the board is already called that"] : []),
      ...(description !== undefined ? ["the board description already reads exactly this"] : []),
    ];
    return { text: `NO-OP · ${label} — ${notes.join(", and ")}.`, details };
  }

  commitDraft(session, {
    ...before,
    ...(retitle ? { title: nextTitle } : {}),
    ...(redescribe ? { description } : {}),
  }, label);
  const diagnostics = sessionDiagnostics(session);
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
      ...(retitle
        ? [`DELTA · title ${before.title === undefined ? "none" : JSON.stringify(before.title)} → ${JSON.stringify(nextTitle)}`]
        : []),
      ...(redescribe
        ? [`DELTA · description ${before.description === undefined ? "none" : before.description.length} → ${description.length} chars`]
        : []),
      lintDeltaBlock(session, diagnostics, before),
    ].join("\n"),
    details,
  };
}

export const describeBoard = defineWorkflowTool({
  name: "describe_board",
  label: "Describe board",
  description:
    "Rename the board, rewrite its description, or both, in one call. Send title, description or both; a call with neither is refused, and a null field counts as absent. title is the name shown above the board, not the description: change it when the diagram's subject has moved on from the name it was created with. description is the board's standing account of what the diagram represents, its pieces, and how it reads, replaced whole with this markdown; a later run reads it to orientate before editing. Both fields are checked before anything is saved, and the board saves once.",
  fields: {
    title: Type.Optional(Type.Union([Type.String(), Type.Null()], {
      description: "The board's new name — short, and what a person would call it. Omit it, or send null, to keep the name.",
    })),
    description: Type.Optional(Type.Union([Type.String(), Type.Null()], {
      description: "The full replacement markdown for the board description. Omit it, or send null, to keep the description.",
    })),
  },
  invoke: async (runtime, params) =>
    runtime.describeBoard({ title: params.title, description: params.description }),
});
