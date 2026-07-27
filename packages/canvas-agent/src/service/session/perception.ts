/**
 * Model-facing perception for layout sessions: derives document changes,
 * cumulative edits, lint movement, routed paths, and requested raster views
 * from the session's authoritative documents.
 *
 * The standing picture — the whole board digest, the whole lint report, the
 * whole request queue — is NOT here. Since the state layer landed, section ③
 * re-derives all three from the current draft on every request (the agent
 * bundle's state/ sidecar), so what perception produces is strictly the per-call
 * reading: what this operation changed, what it cost in lints, and how the
 * wires it touched now route.
 */
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import {
  type CanvasGeometry,
  type InteractiveCanvasConnection,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import { routeConnection } from "../../../../canvas/src/connectors/routing";

import { targetText } from "../../agent/loaders/user-requests";
import { diffDocuments } from "../../board/doc-diff";
import type { Diagnostic } from "../../board/lints";
import { pathBoxViolationIds } from "../../board/lints/geometry";
import { diagnosticLines, formatDiagnostics, runDiagnostics } from "../../board/lints/run";
import type { AgentSessionEvent } from "../../protocol";
import { rasterizeSvgToPng } from "../render";
import type { LayoutToolRenderResult } from "../tool-runtime";
import { round2 } from "./context";
import { classifyOperation, operationTargetId } from "./op-surface";
import type { LayoutSession } from "./store";
import { recordSessionView } from "./view-log";
import {
  BOARD_VIEW_WIDTH,
  SECTION_VIEW_WIDTH,
  renderBoardView,
  renderSectionView,
} from "./views";

export type SessionEventSink = (session: LayoutSession, event: AgentSessionEvent) => void;

function fmtPos(geometry: CanvasGeometry): string {
  return `${round2(geometry.x)},${round2(geometry.y)}`;
}

function fmtSize(geometry: CanvasGeometry): string {
  return `${round2(geometry.width)}×${round2(geometry.height)}`;
}

function fmtChannelValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") {
    return /^[A-Za-z0-9_.-]+$/.test(value) ? value : JSON.stringify(value);
  }
  return JSON.stringify(value);
}

interface ChannelField {
  field: string;
  fallback?: string;
}

const OBJECT_CHANNEL_FIELDS: readonly ChannelField[] = [
  { field: "text" },
  { field: "color", fallback: "gray" },
  { field: "parentId" },
  { field: "style" },
  { field: "locked" },
];

const CONNECTION_CHANNEL_FIELDS: readonly ChannelField[] = [
  { field: "label" },
  { field: "style", fallback: "solid" },
  { field: "color", fallback: "gray" },
  { field: "arrow", fallback: "forward" },
  { field: "role" },
];

function channelDeltaLines(
  id: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly ChannelField[],
): string[] {
  const lines: string[] = [];
  for (const { field, fallback } of fields) {
    const previous = before[field];
    const next = after[field];
    if (JSON.stringify(previous ?? null) === JSON.stringify(next ?? null)) continue;
    const fmt = (value: unknown): string =>
      value === undefined || value === null ? (fallback ?? "—") : fmtChannelValue(value);
    lines.push(`${id}  ${field} ${fmt(previous)} → ${fmt(next)}`);
  }
  return lines;
}

export interface DocumentDelta {
  lines: string[];
  /** Object ids whose geometry changed (moved or resized). */
  movedObjectIds: Set<string>;
  /** Connections touched directly: added, endpoint reassigned, or steering changed. */
  touchedConnectionIds: Set<string>;
  /** Every object id added, changed, or removed. */
  touchedObjectIds: Set<string>;
}

function fmtEndpointAnchors(connection: InteractiveCanvasConnection): string {
  return `${connection.from.anchor ?? "auto"}→${connection.to.anchor ?? "auto"}`;
}

function fmtEndpointPositions(connection: InteractiveCanvasConnection): string {
  const fmtPosition = (position: readonly [number, number] | undefined): string =>
    position ? `${position[0]},${position[1]}` : "auto";
  return `${fmtPosition(connection.from.position)}→${fmtPosition(connection.to.position)}`;
}

function fmtWaypoints(connection: InteractiveCanvasConnection): string {
  const waypoints = connection.waypoints;
  if (!waypoints || waypoints.length === 0) return "none";
  return waypoints.map(([x, y]) => `${round2(x)},${round2(y)}`).join("→");
}

/** Derive touched channels and geometry from documents, never from operation payloads. */
export function documentDelta(
  before: InteractiveCanvasDocument,
  after: InteractiveCanvasDocument,
): DocumentDelta {
  const lines: string[] = [];
  const movedObjectIds = new Set<string>();
  const touchedConnectionIds = new Set<string>();
  const touchedObjectIds = new Set<string>();
  const beforeById = new Map(before.objects.map((object) => [object.id, object]));
  const afterIds = new Set(after.objects.map((object) => object.id));

  for (const object of after.objects) {
    const previous = beforeById.get(object.id);
    if (!previous) {
      lines.push(
        `+ ${object.id}  ${object.type} ${fmtPos(object.geometry)} `
        + `${fmtSize(object.geometry)} ${JSON.stringify(object.text)}`,
      );
      touchedObjectIds.add(object.id);
      continue;
    }
    const a = previous.geometry;
    const b = object.geometry;
    const moved = a.x !== b.x || a.y !== b.y;
    const resized = a.width !== b.width || a.height !== b.height;
    if (moved || resized) {
      lines.push(resized
        ? `${object.id}  ${fmtPos(a)} ${fmtSize(a)} → ${fmtPos(b)} ${fmtSize(b)}`
        : `${object.id}  ${fmtPos(a)} → ${fmtPos(b)}`);
      movedObjectIds.add(object.id);
      touchedObjectIds.add(object.id);
    }
    const channelLines = channelDeltaLines(
      object.id,
      previous as unknown as Record<string, unknown>,
      object as unknown as Record<string, unknown>,
      OBJECT_CHANNEL_FIELDS,
    );
    lines.push(...channelLines);
    if (channelLines.length > 0) touchedObjectIds.add(object.id);
  }
  for (const object of before.objects) {
    if (afterIds.has(object.id)) continue;
    lines.push(`− ${object.id}`);
    touchedObjectIds.add(object.id);
  }

  const beforeConnections = new Map(before.connections.map((connection) => [
    connection.id,
    connection,
  ]));
  const afterConnectionIds = new Set(after.connections.map((connection) => connection.id));

  for (const connection of after.connections) {
    const previous = beforeConnections.get(connection.id);
    if (!previous) {
      lines.push(`+ ${connection.id}  ${connection.from.objectId} → ${connection.to.objectId}`);
      touchedConnectionIds.add(connection.id);
      continue;
    }
    if (previous.from.objectId !== connection.from.objectId
      || previous.to.objectId !== connection.to.objectId) {
      lines.push(
        `${connection.id}  route ${previous.from.objectId}→${previous.to.objectId}`
        + ` → ${connection.from.objectId}→${connection.to.objectId}`,
      );
      touchedConnectionIds.add(connection.id);
    }
    // Steering channels reroute the wire, so they are geometric and route-reported.
    if (fmtEndpointAnchors(previous) !== fmtEndpointAnchors(connection)) {
      lines.push(
        `${connection.id}  anchors ${fmtEndpointAnchors(previous)}`
        + ` → ${fmtEndpointAnchors(connection)}`,
      );
      touchedConnectionIds.add(connection.id);
    }
    if (fmtEndpointPositions(previous) !== fmtEndpointPositions(connection)) {
      lines.push(
        `${connection.id}  pos ${fmtEndpointPositions(previous)}`
        + ` → ${fmtEndpointPositions(connection)}`,
      );
      touchedConnectionIds.add(connection.id);
    }
    if (fmtWaypoints(previous) !== fmtWaypoints(connection)) {
      lines.push(
        `${connection.id}  wp ${fmtWaypoints(previous)} → ${fmtWaypoints(connection)}`,
      );
      touchedConnectionIds.add(connection.id);
    }
    lines.push(...channelDeltaLines(
      connection.id,
      previous as unknown as Record<string, unknown>,
      connection as unknown as Record<string, unknown>,
      CONNECTION_CHANNEL_FIELDS,
    ));
  }
  for (const connection of before.connections) {
    if (afterConnectionIds.has(connection.id)) continue;
    lines.push(`− ${connection.id}`);
  }
  return { lines, movedObjectIds, touchedConnectionIds, touchedObjectIds };
}

/** The DELTA block; `DELTA · none` when nothing changed. */
export function deltaBlock(delta: DocumentDelta): string {
  return delta.lines.length > 0
    ? ["DELTA", ...delta.lines.map((line) => `  ${line}`)].join("\n")
    : "DELTA · none";
}

function diagnosticFingerprint(diagnostic: Diagnostic): string {
  return [diagnostic.rule, [...diagnostic.at].sort().join(","), diagnostic.message].join("\x00");
}

/**
 * The LINTS block as a delta against the diagnostics the previous result carried,
 * recording the new set on the session.
 *
 * The session's recorded set is a cache, not the definition: when it is absent
 * the baseline is derived from `before`, the document as it stood ahead of this
 * operation, so a delta means the same thing on every path into here.
 */
export function lintDeltaBlock(
  session: LayoutSession,
  diagnostics: Diagnostic[],
  before?: InteractiveCanvasDocument,
): string {
  const previous = session.lastDiagnostics
    ?? (before === undefined ? undefined : runDiagnostics(before));
  session.lastDiagnostics = diagnostics;
  if (previous === undefined) return formatDiagnostics(diagnostics);
  const previousPrints = new Set(previous.map(diagnosticFingerprint));
  const currentPrints = new Set(diagnostics.map(diagnosticFingerprint));
  const added = diagnostics.filter((item) => !previousPrints.has(diagnosticFingerprint(item)));
  const resolved = previous.filter((item) => !currentPrints.has(diagnosticFingerprint(item)));
  const header = `LINTS · +${added.length} −${resolved.length}`;
  if (added.length === 0 && resolved.length === 0) {
    return diagnostics.length === 0 ? "LINTS · clean" : `${header} (${diagnostics.length} open)`;
  }
  const lines = [header];
  for (const diagnostic of added) {
    const [entry, ...suggestedOps] = diagnosticLines(diagnostic);
    lines.push(`  + ${entry}`);
    lines.push(...suggestedOps.map((line) => `  ${line}`));
  }
  if (resolved.length > 0) {
    lines.push(
      `  ${resolved.map((item) => `− ${item.id} ${item.rule}`).join(", ")}  (resolved)`,
    );
  }
  return lines.join("\n");
}

/** Descriptor words for updateObject patch keys in the BOARD DIFF block. */
const OBJECT_DIFF_WORDS: Record<string, string> = {
  text: "retexted",
  color: "recolored",
  style: "restyled",
};

/** Descriptor words for updateConnection patch keys in the BOARD DIFF block. */
const CONNECTION_DIFF_WORDS: Record<string, string> = {
  label: "relabeled",
  style: "restyled",
  color: "recolored",
};

function updateObjectDescriptors(
  baseline: InteractiveCanvasDocument,
  operation: Extract<CanvasAgentPatchOperation, { type: "updateObject" }>,
): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(operation.patch)) {
    if (key === "geometry") {
      const previous = baseline.objects.find(
        (object) => object.id === operation.objectId,
      )?.geometry;
      const next = value as CanvasGeometry;
      if (!previous || previous.x !== next.x || previous.y !== next.y) parts.push("moved");
      if (!previous || previous.width !== next.width || previous.height !== next.height) {
        parts.push("resized");
      }
      continue;
    }
    parts.push(OBJECT_DIFF_WORDS[key] ?? key);
  }
  return parts;
}

function updateConnectionDescriptors(
  operation: Extract<CanvasAgentPatchOperation, { type: "updateConnection" }>,
): string[] {
  const parts: string[] = [];
  let rerouted = false;
  for (const key of Object.keys(operation.patch)) {
    if (key === "from" || key === "to") {
      if (!rerouted) parts.push("rerouted");
      rerouted = true;
      continue;
    }
    parts.push(CONNECTION_DIFF_WORDS[key] ?? key);
  }
  return parts;
}

/**
 * The cumulative base → draft diff, one compact line per document change,
 * rendered from the operations `diffDocuments` returns. Entity lines lead
 * with the model-facing operation name; the description and annotation-thread
 * lines name their document channel directly.
 */
export function boardDiffBlock(session: LayoutSession): string {
  const operations = diffDocuments(session.baseline, session.draft);
  if (operations.length === 0) return "BOARD DIFF · none";
  const suffix = operations.length === 1 ? "" : "s";
  const lines = [
    `BOARD DIFF · base → draft · ${operations.length} op${suffix}`,
  ];
  for (const operation of operations) {
    if (operation.type === "updateDescription") {
      const change = operation.description.trim() === ""
        ? "cleared"
        : `${operation.description.length} chars`;
      lines.push(`  updateDescription  ${change}`);
      continue;
    }
    if (operation.type === "addAnnotation") {
      const { annotation } = operation;
      lines.push(
        `  addAnnotation ${annotation.id}  ${targetText(annotation.target)}`
        + `  ${annotation.createdBy}`,
      );
      continue;
    }
    if (operation.type === "appendAnnotationReply") {
      lines.push(
        `  appendAnnotationReply ${operation.annotationId}  ${operation.reply.author}`,
      );
      continue;
    }
    if (operation.type === "setAnnotationStatus") {
      lines.push(`  setAnnotationStatus ${operation.annotationId}  ${operation.status}`);
      continue;
    }
    const model = classifyOperation(operation, session.baseline);
    const descriptors = operation.type === "updateObject"
      ? `  ${updateObjectDescriptors(session.baseline, operation).join(" · ")}`
      : operation.type === "updateConnection"
        ? `  ${updateConnectionDescriptors(operation).join(" · ")}`
        : "";
    lines.push(`  ${model.type} ${operationTargetId(model)}${descriptors}`);
  }
  return lines.join("\n");
}

function formatRoundedPolyline(points: ReadonlyArray<{ x: number; y: number }>): string {
  return points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(" → ");
}

/** Keep scoped and full-board route truth identical for each connection. */
function connectionRouteRow(
  document: InteractiveCanvasDocument,
  connection: InteractiveCanvasConnection,
  objectsById: ReadonlyMap<string, InteractiveCanvasObject>,
): string {
  const from = objectsById.get(connection.from.objectId);
  const to = objectsById.get(connection.to.objectId);
  if (!from || !to) {
    const missing = [
      !from ? connection.from.objectId : undefined,
      !to ? connection.to.objectId : undefined,
    ].filter((id): id is string => id !== undefined);
    const plural = missing.length === 1 ? "" : "s";
    return `  ${connection.id}  unroutable (missing endpoint${plural} ${missing.join(", ")})`;
  }
  const routed = routeConnection(from, to, connection, document.objects);
  const points = routed.points ?? [routed.start, routed.end];
  const violations = connection.from.objectId === connection.to.objectId
    ? []
    : pathBoxViolationIds(
      points,
      connection.from.objectId,
      connection.to.objectId,
      document.objects,
    );
  return (
    `  ${connection.id}  anchors ${routed.startAnchor}→${routed.endAnchor}`
    + `  path ${formatRoundedPolyline(points)}`
    + `  through ${violations.length > 0 ? violations.join(",") : "none"}`
  );
}

/** Routed truth for every connection the change touched. Null when none did. */
export function routesBlock(session: LayoutSession, delta: DocumentDelta): string | null {
  const touched = new Set(delta.touchedConnectionIds);
  for (const connection of session.draft.connections) {
    if (delta.movedObjectIds.has(connection.from.objectId)
      || delta.movedObjectIds.has(connection.to.objectId)) {
      touched.add(connection.id);
    }
  }
  if (touched.size === 0) return null;
  const byId = new Map(session.draft.objects.map((object) => [object.id, object]));
  const lines = ["ROUTES"];
  for (const connection of session.draft.connections) {
    if (!touched.has(connection.id)) continue;
    lines.push(connectionRouteRow(session.draft, connection, byId));
  }
  return lines.join("\n");
}

/** Routed truth for every connection on the draft. Null when the board has none. */
export function boardRoutesBlock(session: LayoutSession): string | null {
  if (session.draft.connections.length === 0) return null;
  const byId = new Map(session.draft.objects.map((object) => [object.id, object]));
  return [
    "ROUTES",
    ...session.draft.connections.map((connection) =>
      connectionRouteRow(session.draft, connection, byId)),
  ].join("\n");
}

export interface RenderOptions {
  /** Render the full board view. */
  board: boolean;
  /** Section id to render close-up. */
  view?: string;
  /** Sink for the board render (the CLI writes these to disk). */
  onRender?: (png: Buffer) => void;
}

/**
 * Rasterize the requested views. A raster failure never silently drops an
 * image. Every raster also lands on the session's view log, so the state
 * render can re-attach the newest few after the tool result that carried them
 * has scrolled out of the message tail.
 */
export function renderPerception(
  session: LayoutSession,
  options: RenderOptions,
): { pngs: Buffer[]; notes: string[] } {
  const pngs: Buffer[] = [];
  const notes: string[] = [];
  if (options.board) {
    try {
      const rendered = renderBoardView(session.draft, { width: BOARD_VIEW_WIDTH });
      const { png } = rasterizeSvgToPng(rendered.svg);
      pngs.push(png);
      recordSessionView(session, "board", null, png);
      options.onRender?.(png);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`render failed: board view — ${message}`);
    }
  }
  if (options.view !== undefined) {
    try {
      const rendered = renderSectionView(
        session.draft,
        options.view,
        { width: SECTION_VIEW_WIDTH },
      );
      const { png } = rasterizeSvgToPng(rendered.svg);
      pngs.push(png);
      recordSessionView(session, "section", options.view, png);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`render failed: view "${options.view}" — ${message}`);
    }
  }
  return { pngs, notes };
}

export interface PerceptionResult extends LayoutToolRenderResult {
  /** The full diagnostic set behind the lint block, for event payloads. */
  diagnostics: Diagnostic[];
}

export interface OperationPerceptionOptions {
  /** Observations the operation reported that do not fail it. */
  notes?: readonly string[];
  /** Section id the caller asked to render with the result. */
  view?: string;
  /** Sink for a rendered board view; unused while an operation renders only its close-up. */
  onRender?: (png: Buffer) => void;
  /** Structured detail passthrough for the tool result. */
  details?: Record<string, unknown>;
}

/**
 * The per-operation envelope: what changed and what it cost in lints, plus the
 * routed truth for every wire the change moved.
 *
 * Deliberately NOT here any more: the scoped digest rows and the REQUESTS
 * queue. Both existed to patch a context that went stale the moment the model
 * edited — the spawn-time <board_state> / <user_requests> blocks. Section ③
 * now re-renders the whole board digest and the whole queue on every request,
 * so restating them per operation would put the same text in the window twice.
 * The delta, the lint movement, and the routes are genuinely per-operation:
 * they say what THIS call did, which the board picture alone does not.
 */
export function operationPerception(
  session: LayoutSession,
  before: InteractiveCanvasDocument,
  headline: string,
  options?: OperationPerceptionOptions,
): PerceptionResult {
  const delta = documentDelta(before, session.draft);
  const diagnostics = runDiagnostics(session.draft);
  const lintText = lintDeltaBlock(session, diagnostics, before);
  const routes = routesBlock(session, delta);
  const perception = renderPerception(session, {
    board: false,
    view: options?.view,
    onRender: options?.onRender,
  });
  const noteLines = (options?.notes ?? []).flatMap((note) =>
    note.split("\n").map((line) => `  ${line}`));
  const blocks = [
    headline,
    ...noteLines,
    deltaBlock(delta),
    lintText,
    ...(routes ? [routes] : []),
    ...perception.notes,
  ];
  return {
    ...(perception.pngs.length > 0 ? { pngs: perception.pngs } : {}),
    text: blocks.join("\n"),
    ...(options?.details !== undefined ? { details: options.details } : {}),
    diagnostics,
  };
}

export interface LookPerceptionOptions {
  /** Section id to render close-up alongside the board view. */
  view?: string;
  /** Sink for the board render (the CLI writes these to disk). */
  onRender?: (png: Buffer) => void;
  /** Leading line for the result text. */
  headline?: string;
  /** Structured detail passthrough for the tool result. */
  details?: Record<string, unknown>;
}

/** What look says instead of restating text section ③ already carries. */
export const LOOK_STATE_POINTER =
  "The full BOARD digest, the cumulative BOARD DIFF, the DIAGNOSTICS list and the"
  + " REQUESTS queue are in the <state> block of this request, re-derived from the"
  + " current draft — read them there, not from an older turn.";

/**
 * The deliberate step back: fresh renders of the whole board (and a section
 * close-up when asked), the routed truth for every wire, and a pointer to the
 * state block.
 *
 * look used to restate the digest, the diff, the lint list and the queue,
 * because the only other copy was the spawn snapshot and that copy aged. With
 * section ③ re-rendering all four from the authoritative draft every request,
 * restating them here would mean the model reads the same board twice in one
 * window. What survives is what look alone produces: the rasters and the
 * routes.
 */
export function lookPerception(
  session: LayoutSession,
  options?: LookPerceptionOptions,
): PerceptionResult {
  const diagnostics = runDiagnostics(session.draft);
  session.lastDiagnostics = diagnostics;
  const routes = boardRoutesBlock(session);
  const perception = renderPerception(session, {
    board: true,
    view: options?.view,
    onRender: options?.onRender,
  });
  const blocks = [
    ...(options?.headline !== undefined ? [options.headline] : []),
    `LOOK · ${perception.pngs.length} render${perception.pngs.length === 1 ? "" : "s"}`
    + (options?.view !== undefined ? ` · close-up ${options.view}` : ""),
    ...(routes ? [routes] : []),
    LOOK_STATE_POINTER,
    ...perception.notes,
  ];
  return {
    ...(perception.pngs.length > 0 ? { pngs: perception.pngs } : {}),
    text: blocks.join("\n"),
    ...(options?.details !== undefined ? { details: options.details } : {}),
    diagnostics,
  };
}
