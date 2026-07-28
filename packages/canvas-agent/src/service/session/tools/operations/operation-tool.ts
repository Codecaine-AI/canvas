/**
 * Shared construction and execution pipeline for every mutating layout tool.
 * Operation specs contribute only their schema fields, state checks, and
 * mutation; perception and run-UX reporting stay consistent here.
 */
import { Type, type Static, type TSchema } from "@mariozechner/pi-ai";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import { reconcileConnectionWaypoints } from "../../../../../../canvas/src/state/actions/waypoints";
import { reconcileSectionMembership } from "../../../../../../canvas/src/state/section-membership";

import { formatNumberedRoute } from "../../../../board/edge-route";
import { formatDiagnostics } from "../../../../board/lints/run";
import type { LayoutToolRenderResult } from "../runtime";
import { commitDraft } from "../../perception/live-draft-view";
import type { OpContext, OpOutcome } from "./op-context";
import {
  operationPerception,
  type SessionEventSink,
} from "../../perception/perception";
import type { LayoutSession } from "../../store";

export type { OpOutcome } from "./op-context";

type OperationFields = Record<string, TSchema>;

/**
 * Decode the operation's Type.Object shape without importing TypeBox's
 * TObject or TProperties helpers, which pi-ai does not re-export.
 */
type FieldParams<TFields extends OperationFields> =
  Static<ReturnType<typeof Type.Object<TFields>>>;

/** The operation-specific portion of a mutating layout tool. */
export interface OperationSpec<TFields extends OperationFields> {
  /** Tool name, snake_case, matching resolve_request / finalize. */
  name: string;
  /** Consequences only — the schema carries shape, so never restate fields. */
  description: string;
  /** The operation's parameters, in full: a mutator's schema is exactly these. */
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
  for (const value of Object.values(params)) {
    if (typeof value === "string") return value;
  }
  for (const value of Object.values(params)) {
    if (value === null || typeof value !== "object") continue;
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

/**
 * A no-op on an edge still owes the model the wire's current shape: a routing
 * gesture that asked for what the edge already has is exactly the moment the
 * model needs the numbered polyline to aim its next call at. Object targets get
 * nothing extra — their geometry is not a polyline, and the digest already
 * carries it.
 */
function noopRouteLine(
  document: InteractiveCanvasDocument,
  target: string | undefined,
): string | null {
  if (target === undefined) return null;
  const connection = document.connections.find((entry) => entry.id === target);
  if (!connection) return null;
  const route = formatNumberedRoute(connection, document);
  return route === "" ? null : `  route ${route}`;
}

/** Run one validated operation through mutation, perception, and event reporting. */
export function runOperation<TFields extends OperationFields>(
  spec: OperationSpec<TFields>,
  params: FieldParams<TFields>,
  host: OperationHost,
): LayoutToolRenderResult {
  // The runtime validates the tool schema before execute; only state checks belong here.
  const session = host.currentSession();
  const before = session.draft;
  const ctx = host.context(before);
  const errors = spec.validate(ctx, params);
  const details = { operation: spec.name };

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
    const route = noopRouteLine(before, target);
    return {
      text: [`NO-OP · ${subject} — ${note}`, ...(route ? [route] : [])].join("\n"),
      details: { ...details, status: "noop" },
    };
  };
  if (outcome.status === "noop") return noop(outcome.note);

  // The two post-mutation choke points, in the reducer's own order
  // (reduceInteractiveCanvasState: waypoints for every document-changing
  // action, then membership).
  //
  // D6 — waypoints first. Explicit `connection.waypoints` are absolute world
  // coordinates, so a gesture that moves or resizes an endpoint owner leaves
  // them stale: the reducer translates them on a rigid same-delta move and
  // DROPS them on an asymmetric move or a resize, which is what a committed
  // proposal will do on replay. Running it here means the polylines this
  // result reports (the ROUTES block, the digest, every routing lint) are the
  // committed truth rather than a draft-only fiction.
  //
  // KNOWN GAP (D6, risk register): this reconcile is per-op, against the
  // previous draft, while a commit replays the whole proposal — so a sequence
  // whose steps are each rigid but whose NET movement is asymmetric can keep
  // waypoints here and drop them on replay.
  //
  // Membership follows geometry, so reconciliation derives state rather than
  // moving layout — and since it only writes `parentId`, it cannot disturb the
  // waypoint verdict taken above.
  const next = reconcileSectionMembership(
    reconcileConnectionWaypoints(before, outcome.draft),
  );
  // A patch that asks for what the board already holds is legal and did
  // nothing, which is the no-op class rather than an APPLIED line over an
  // empty delta.
  if (JSON.stringify(before) === JSON.stringify(next)) {
    return noop("the board already matches this, so nothing changed.");
  }
  session.proposalCount += 1;
  commitDraft(session, next, outcome.summary, { recordChange: true });
  const result = operationPerception(
    session,
    before,
    `APPLIED · ${outcome.summary}`,
    { notes: outcome.notes, details },
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

/**
 * Define one sequential mutator.
 *
 * The wire schema is exactly `spec.fields`, sealed: a mutator carries the
 * gesture's own arguments and nothing else, and a key the gesture does not
 * declare is rejected rather than silently dropped. Seeing the board is `look`'s
 * job — a close-up rides on `look view:`, not on an edit.
 */
export function defineOperationTool<TFields extends OperationFields>(
  spec: OperationSpec<TFields>,
) {
  return {
    name: spec.name,
    label: operationLabel(spec.name),
    description: spec.description,
    executionMode: "sequential" as const,
    parameters: Type.Object({ ...spec.fields }, { additionalProperties: false }),
    execute: (params: FieldParams<TFields>, ctx: OperationHost) =>
      runOperation(spec, params, ctx),
  };
}
