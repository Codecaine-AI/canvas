/**
 * Shared construction and execution pipeline for every mutating layout tool.
 * Operation specs contribute only their schema fields, state checks, and
 * mutation; perception and run-UX reporting stay consistent here.
 */
import { Type, type Static, type TSchema } from "@mariozechner/pi-ai";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import { reconcileSectionMembership } from "../../../../canvas/src/state/section-membership";

import { formatDiagnostics } from "../../board/lints/run";
import type { LayoutToolRenderResult } from "../tool-runtime";
import type { OpContext, OpOutcome } from "./op-context";
import {
  operationPerception,
  type SessionEventSink,
} from "./perception";
import type { LayoutSession } from "./store";

export type { OpOutcome } from "./op-context";

type OperationFields = Record<string, TSchema>;

/**
 * Decode the operation's Type.Object shape without importing TypeBox's
 * TObject or TProperties helpers, which pi-ai does not re-export.
 */
type FieldParams<TFields extends OperationFields> =
  Static<ReturnType<typeof Type.Object<TFields>>>;

type OperationParams<TFields extends OperationFields> = FieldParams<TFields> & {
  view?: string;
};

/** The operation-specific portion of a mutating layout tool. */
export interface OperationSpec<TFields extends OperationFields> {
  /** Tool name, snake_case, matching resolve_request / finalize. */
  name: string;
  /** Consequences only — the schema carries shape, so never restate fields. */
  description: string;
  /** Operation-specific parameters, without the shared view mixin. */
  fields: TFields;
  /** State-dependent checks only. An empty array means valid. */
  validate(ctx: OpContext, params: FieldParams<TFields>): string[];
  /** The mutation. Only runs when validate returned nothing. */
  apply(ctx: OpContext, params: FieldParams<TFields>): OpOutcome;
}

/** Everything an operation needs from the harness to run. */
export interface OperationHost {
  /** The layout session this call belongs to. */
  currentSession(): LayoutSession;
  /** Build the operation's view of a draft. */
  context(draft: InteractiveCanvasDocument): OpContext;
  /** Sink for run-UX events. */
  emit: SessionEventSink;
  /** Sink for rendered views (the CLI writes these to disk). */
  onRender?: (png: Buffer) => void;
}

function operationLabel(name: string): string {
  const words = name.replaceAll("_", " ");
  return words.length > 0 ? words[0].toUpperCase() + words.slice(1) : words;
}

/**
 * Anchor a legal no-op to the entity the model named without making target
 * metadata part of every operation spec.
 */
function operationTarget(params: Record<string, unknown>): string | undefined {
  for (const [key, value] of Object.entries(params)) {
    if (key !== "view" && typeof value === "string") return value;
  }
  for (const [key, value] of Object.entries(params)) {
    if (key === "view" || value === null || typeof value !== "object") continue;
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

/** Run one validated operation through mutation, perception, and event reporting. */
export function runOperation<TFields extends OperationFields>(
  spec: OperationSpec<TFields>,
  params: OperationParams<TFields>,
  host: OperationHost,
): LayoutToolRenderResult {
  // The runtime validates the tool schema before execute; only state checks belong here.
  const session = host.currentSession();
  const before = session.draft;
  const ctx = host.context(before);
  const errors = spec.validate(ctx, params);
  const details = {
    operation: spec.name,
    ...(params.view !== undefined ? { view: params.view } : {}),
  };

  if (errors.length > 0) {
    const text = errors.length === 1
      ? `ERROR · ${spec.name} — ${errors[0]}`
      : [
          `ERROR · ${spec.name}`,
          ...errors.map((error) => `  - ${error}`),
        ].join("\n");
    return { isError: true, text, details };
  }

  const outcome = spec.apply(ctx, params);
  const noop = (note: string): LayoutToolRenderResult => {
    const target = operationTarget(params as Record<string, unknown>);
    const subject = target === undefined ? spec.name : `${spec.name} ${target}`;
    return {
      text: `NO-OP · ${subject} — ${note}`,
      details: { ...details, status: "noop" },
    };
  };
  if (outcome.status === "noop") return noop(outcome.note);

  // Membership follows geometry, so reconciliation derives state rather than moving layout.
  const next = reconcileSectionMembership(outcome.draft);
  // A patch that asks for what the board already holds is legal and did
  // nothing, which is the no-op class rather than an APPLIED line over an
  // empty delta.
  if (JSON.stringify(before) === JSON.stringify(next)) {
    return noop("the board already matches this, so nothing changed.");
  }
  session.draft = next;
  const result = operationPerception(
    session,
    before,
    `APPLIED · ${outcome.summary}`,
    {
      notes: outcome.notes,
      view: params.view,
      details,
      onRender: host.onRender,
    },
  );

  host.emit(session, {
    type: "proposal",
    sessionId: session.id,
    n: session.proposalCount,
  });
  host.emit(session, {
    type: "delta",
    sessionId: session.id,
    n: session.proposalCount,
    delta: outcome.summary,
    lint: formatDiagnostics(result.diagnostics),
  });
  return result;
}

/** Define one sequential mutator with the shared optional section render. */
export function defineOperationTool<TFields extends OperationFields>(
  spec: OperationSpec<TFields>,
) {
  return {
    name: spec.name,
    label: operationLabel(spec.name),
    description: spec.description,
    executionMode: "sequential" as const,
    parameters: Type.Object({
      ...spec.fields,
      view: Type.Optional(
        Type.String({ description: "Section id to render with the result." }),
      ),
    }),
    execute: (params: OperationParams<TFields>, ctx: OperationHost) =>
      runOperation(spec, params, ctx),
  };
}
