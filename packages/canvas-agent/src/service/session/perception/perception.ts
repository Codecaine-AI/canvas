/**
 * Model-facing perception for layout sessions: derives document changes,
 * cumulative edits, lint movement, routed paths, region measurements, and
 * raster views from the session's authoritative documents.
 *
 * Two envelopes, sized to two different questions. An OPERATION result is the
 * per-call reading and text only: what this gesture changed, what it cost in
 * lints, how the wires it touched now route. A LOOK repeats the standing
 * picture in full and supplies the close-ups, crops, and measurements the model
 * asks for. State assembly reads the eager full-board render captured after
 * each applied gesture.
 */
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import {
  type CanvasGeometry,
  type InteractiveCanvasConnection,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import { routeConnection } from "../../../../../canvas/src/connectors/routing";
// Relative imports so the harness never loads the package's React surface.
import {
  connectionPaintedBounds,
  paintedBounds,
  unionRects,
} from "../../../../../canvas/src/render/painted-bounds";
import { renderDocumentToSvg } from "../../../../../canvas/src/render/static-svg";
import { sectionDescendantIds } from "../../../../../canvas/src/state/geometry";

import { formatRequestsBlock, targetText } from "../snapshots/user-requests";
import { formatBoardDigest } from "../../../board/digest";
import { diffDocuments } from "../../../board/doc-diff";
import { formatNumberedSegments, numberedSegmentsForPolyline } from "../../../board/edge-route";
import { kindOf } from "../../../board/helpers";
import type { Diagnostic } from "../../../board/lints";
import { pathBoxViolationIds } from "../../../board/lints/geometry";
import { diagnosticLines, formatDiagnostics, runDiagnostics } from "../../../board/lints/run";
import { formatRegionMeasures, measureRegion } from "../../../board/measure";
import type { Rect } from "../../../board/types";
import type { AgentSessionEvent } from "../../../protocol";
import { rasterizeSvgToPng } from "../../render";
import type { LayoutToolRenderResult } from "../tools/runtime";
import { documentWithinCrop, expandRect, renderCropError, round2 } from "../snapshots/context";
import { classifyDelta, deltaTargetId } from "./op-surface";
import { fromDocumentFields } from "../tools/placeable-types";
import type { LayoutSession } from "../store";
import { recordSessionView } from "./view-log";
import {
  CROP_VIEW_WIDTH,
  SECTION_VIEW_WIDTH,
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
  { field: "labelPosition" },
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

/**
 * The connection channels that describe the DRAWN WIRE rather than its
 * content: how the line is stroked, which ends carry an arrowhead, and where
 * the label chip is pinned along the route. These are what the Edges gestures
 * `style_edge` and `move_label` write, and a move on any of them re-reports the
 * edge's routed truth — `label` and `color` do not, because they are the
 * content gestures and say nothing about how the wire runs.
 */
const CONNECTION_WIRE_CHANNELS = ["style", "arrow", "labelPosition"] as const;

function wireChannelMoved(
  before: InteractiveCanvasConnection,
  after: InteractiveCanvasConnection,
): boolean {
  const previous = before as unknown as Record<string, unknown>;
  const next = after as unknown as Record<string, unknown>;
  return CONNECTION_WIRE_CHANNELS.some((field) =>
    JSON.stringify(previous[field] ?? null) !== JSON.stringify(next[field] ?? null));
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
        `+ ${object.id}  ${fromDocumentFields(object)} ${fmtPos(object.geometry)} `
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
    // `type` and `icon` are ONE channel to the model (./placeable-types.ts), so
    // a swap reports one folded name on both sides — a rectangle becoming a
    // glyph reads `rectangle → memory`, never `icon` with a glyph beside it.
    const previousType = fromDocumentFields(previous);
    const nextType = fromDocumentFields(object);
    if (previousType !== nextType) {
      lines.push(`${object.id}  type ${previousType} → ${nextType}`);
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
    const channelLines = channelDeltaLines(
      connection.id,
      previous as unknown as Record<string, unknown>,
      connection as unknown as Record<string, unknown>,
      CONNECTION_CHANNEL_FIELDS,
    );
    lines.push(...channelLines);
    // The Edges group's fresh-polyline contract: every edge gesture returns the
    // wire's numbered route, so a second call in the same turn chains off the
    // result instead of off a digest that aged. Two of the six move no geometry
    // at all — `style_edge` writes style/arrow, `move_label` writes
    // labelPosition — so their edges are marked touched here, from the channels
    // themselves. A `label` or `color` write is NOT one of these: those are the
    // content gestures, they say nothing about how the wire runs, and a routes
    // block under them would be noise.
    if (wireChannelMoved(previous, connection)) touchedConnectionIds.add(connection.id);
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

/**
 * Descriptor words for updateObject patch keys in the BOARD DIFF block.
 *
 * `type` and `icon` share one word on purpose: they are one channel to the
 * model (./placeable-types.ts), so a swap onto a glyph is "reshaped" once
 * rather than two lines, one of which would name a field the tool surface does
 * not have.
 */
const OBJECT_DIFF_WORDS: Record<string, string> = {
  text: "retexted",
  color: "recolored",
  style: "restyled",
  type: "reshaped",
  icon: "reshaped",
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
  // A type+icon swap maps both keys to the same word; say it once.
  return [...new Set(parts)];
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
 * rendered from the operations `diffDocuments` returns. Entity lines lead with
 * a DELTA verb (./op-surface.ts), not a tool name: a diff can say a box was
 * added, changed, or removed, and cannot say which gesture did it — `move_to`
 * and `align` leave the same trace. The description and annotation-thread
 * lines name their document channel directly. What was CALLED is the op
 * ledger's story, not this block's.
 */
export function boardDiffBlock(session: LayoutSession): string {
  const operations = diffDocuments(session.baseline, session.draft);
  if (operations.length === 0) return "BOARD DIFF · none";
  const suffix = operations.length === 1 ? "" : "s";
  const lines = [
    `BOARD DIFF · base → draft · ${operations.length} op${suffix}`,
  ];
  for (const operation of operations) {
    if (operation.type === "updateTitle") {
      lines.push(`  updateTitle  ${JSON.stringify(operation.title)}`);
      continue;
    }
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
    const delta = classifyDelta(operation, session.baseline);
    const descriptors = operation.type === "updateObject"
      ? `  ${updateObjectDescriptors(session.baseline, operation).join(" · ")}`
      : operation.type === "updateConnection"
        ? `  ${updateConnectionDescriptors(operation).join(" · ")}`
        : "";
    lines.push(`  ${delta.type} ${deltaTargetId(delta)}${descriptors}`);
  }
  return lines.join("\n");
}

/**
 * Fallback for a route that numbers to nothing (a polyline that collapsed to
 * a single point): the raw rounded points, so the row is never blank.
 */
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
  // Same numbered-segment string the digest prints and the routing ops
  // return, so `sN` means one thing everywhere the model can read it.
  const numbered = formatNumberedSegments(
    connection.from.objectId,
    connection.to.objectId,
    numberedSegmentsForPolyline(points),
  );
  return (
    `  ${connection.id}  anchors ${routed.startAnchor}→${routed.endAnchor}`
    + `  path ${numbered === "" ? formatRoundedPolyline(points) : numbered}`
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

/**
 * One ad-hoc world-rect crop to rasterize. `label` names the ids behind the
 * `view:` frame and rides in the failure note so a crop that dies says which
 * call produced it.
 */
export interface CropRequest {
  label: string;
  /** The rect the camera frames, already inflated where the caller inflates. */
  rect: Rect;
  /** Raster width in px; the standard crop width when absent. */
  width?: number;
}

export interface RenderOptions {
  /** Section id to render close-up. */
  view?: string;
  /** Ad-hoc world-rect crops, rendered after the close-up. */
  crops?: readonly CropRequest[];
  /** Sink for every rendered png (the CLI writes these to disk). */
  onRender?: (png: Buffer) => void;
}

/**
 * Rasterize the views requested by `look`. A raster failure never silently
 * drops an image. Every raster also lands on the session's view log for
 * bookkeeping; the result itself carries close-ups and crops through the
 * recent conversation tail.
 */
export function renderPerception(
  session: LayoutSession,
  options: RenderOptions,
): { pngs: Buffer[]; notes: string[] } {
  const pngs: Buffer[] = [];
  const notes: string[] = [];
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
      options.onRender?.(png);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`render failed: view "${options.view}" — ${message}`);
    }
  }
  for (const crop of options.crops ?? []) {
    const cropError = renderCropError(crop.rect);
    if (cropError) {
      notes.push(`render failed: framed ${crop.label} — ${cropError}`);
      continue;
    }
    try {
      // The draftSvg path: keep only what the crop can see, then let the
      // static renderer frame exactly the rect it was given.
      const rendered = renderDocumentToSvg(
        documentWithinCrop(session.draft, crop.rect),
        { cropRect: crop.rect, width: crop.width ?? CROP_VIEW_WIDTH },
      );
      const { png } = rasterizeSvgToPng(rendered.svg);
      pngs.push(png);
      recordSessionView(session, "crop", null, png, crop.rect);
      options.onRender?.(png);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`render failed: framed ${crop.label} — ${message}`);
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
  /** Structured detail passthrough for the tool result. */
  details?: Record<string, unknown>;
}

/**
 * The per-operation envelope: what changed and what it cost in lints, plus the
 * routed truth for every wire the change moved.
 *
 * An edit is text only. It says what THIS call did — the delta, the lint
 * movement, the routes — and nothing about the standing picture: section ③
 * re-derives the whole digest, the whole lint list, the whole queue, and reads
 * the eager board render for the current draft. `look` supplies framed
 * close-ups, crops, and measurements. An operation neither restates the board
 * nor renders it.
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
  const noteLines = (options?.notes ?? []).flatMap((note) =>
    note.split("\n").map((line) => `  ${line}`));
  const blocks = [
    headline,
    ...noteLines,
    deltaBlock(delta),
    lintText,
    ...(routes ? [routes] : []),
  ];
  return {
    text: blocks.join("\n"),
    ...(options?.details !== undefined ? { details: options.details } : {}),
    diagnostics,
  };
}

export interface LookPerceptionOptions {
  /** What to frame: one or more section, object, or connection ids. */
  view?: string | readonly string[];
  /** Sink for every rendered png (the CLI writes these to disk). */
  onRender?: (png: Buffer) => void;
  /** Leading line for the result text. */
  headline?: string;
  /** Structured detail passthrough for the tool result. */
  details?: Record<string, unknown>;
}

/**
 * Context ring around a frame's own bounds, so a `view:` close-up shows what
 * the named content sits AMONG, not just the content. Matches the ghost
 * preview's ring (store.ts CONTEXT_RING) — one number for "enough around it
 * to judge it".
 */
export const VIEW_CROP_RING = 128;

/**
 * Magnification ceiling for a framed close-up: one world unit never renders
 * wider than this many pixels, so a lone small object arrives readable
 * rather than absurdly enlarged.
 */
const MAX_VIEW_ZOOM = 4;

/**
 * Raster-height ceiling for a framed close-up. The rasterizer hard-clamps
 * each axis at 4096px; staying under that here keeps a tall union frame at
 * its true aspect instead of letterboxing.
 */
const MAX_VIEW_RASTER_HEIGHT = 4000;

/**
 * Raster width for a framed rect: the standard crop width, shrunk when the
 * rect is small enough to over-magnify or tall enough to overflow the
 * rasterizer.
 */
function framedRasterWidth(rect: Rect): number {
  const zoom = Math.min(
    CROP_VIEW_WIDTH / rect.width,
    MAX_VIEW_ZOOM,
    MAX_VIEW_RASTER_HEIGHT / rect.height,
  );
  return Math.max(1, Math.round(rect.width * zoom));
}

/** A region look framed, and what to call it in its MEASURES header. */
interface FramedRegion {
  label: string;
  rect: Rect;
  sectionId?: string;
}

/** Short name for an id set in headlines, crop labels, and failure notes. */
function idSetLabel(ids: readonly string[]): string {
  return ids.length <= 3 ? ids.join("+") : `${ids.length} ids`;
}

/**
 * Resolve the framing ids into crops to render and regions to measure.
 * An id that cannot be honored costs its part of the frame and nothing else:
 * the note says why and the rest of the look lands. `sectionView` is set when
 * the call named exactly one section, whose close-up has its own renderer.
 *
 * The crop and the measurement are deliberately not the same rect. The frame
 * is the union of everything named — painted extents, routed edges, and a
 * context ring — so the content is judged in place, but the measurement is of
 * the named content's own bounds: measuring the ring would measure nothing
 * the model asked about.
 */
function frameRegions(
  session: LayoutSession,
  options: LookPerceptionOptions,
): {
  crops: CropRequest[];
  regions: FramedRegion[];
  notes: string[];
  sectionView?: string;
} {
  const notes: string[] = [];
  const requested = [...new Set(
    (typeof options.view === "string" ? [options.view] : options.view ?? [])
      .filter((id) => id.trim().length > 0),
  )];

  const objectsById = new Map(session.draft.objects.map((object) => [object.id, object]));
  const connectionsById = new Map(
    session.draft.connections.map((connection) => [connection.id, connection]),
  );
  const known = requested.filter((id) => objectsById.has(id) || connectionsById.has(id));
  const unknown = requested.filter((id) => !objectsById.has(id) && !connectionsById.has(id));
  if (unknown.length > 0) {
    notes.push(
      `view: no section, object, or connection ${unknown.map((id) => `"${id}"`).join(", ")}`
      + " on the board; the digest in the state block carries the current ids.",
    );
  }
  if (known.length === 0) return { crops: [], regions: [], notes };

  const lone = known.length === 1 ? objectsById.get(known[0]!) : undefined;
  if (lone !== undefined && kindOf(lone) === "section") {
    return {
      crops: [],
      regions: [{ label: `section ${lone.id}`, rect: lone.geometry, sectionId: lone.id }],
      notes,
      sectionView: lone.id,
    };
  }

  // The union frame: everything named, with a context ring. A named section
  // brings its descendants, so its close-up shows its content, not its shell.
  const targets = new Set<string>(known);
  for (const id of known) {
    const object = objectsById.get(id);
    if (object !== undefined && kindOf(object) === "section") {
      for (const descendantId of sectionDescendantIds(session.draft, id)) {
        targets.add(descendantId);
      }
    }
  }
  const framed = expandRect(paintedBounds(session.draft, targets), VIEW_CROP_RING);
  const label = idSetLabel(known);
  const cropError = renderCropError(framed);
  if (cropError) {
    notes.push(`view: skipped — ${label} — ${cropError}`);
    return { crops: [], regions: [], notes };
  }

  let measured: Rect | null = null;
  for (const id of known) {
    const object = objectsById.get(id);
    const rect = object !== undefined
      ? object.geometry
      : connectionPaintedBounds(session.draft, connectionsById.get(id)!);
    if (rect !== null) measured = measured === null ? rect : unionRects(measured, rect);
  }
  return {
    crops: [{ label, rect: framed, width: framedRasterWidth(framed) }],
    regions: measured === null
      ? []
      : [{
          label: known.length === 1
            ? `${connectionsById.has(known[0]!) ? "edge" : "object"} ${known[0]!}`
            : `ids ${label}`,
          rect: measured,
        }],
    notes,
  };
}

/**
 * The deliberate close-up, and the one call that studies a single region in
 * detail: the framed region's raster and measurements, plus the standing text
 * truth — the whole digest, the cumulative base → draft diff, every open
 * finding, the routed truth for every wire, the open request queue. The board
 * render itself is not here: the state block attaches the current board on
 * every request, so a look only ever renders the region it framed.
 *
 * The standing text blocks are also re-derived into section ③ of every
 * request. That duplication is deliberate: the state block answers the
 * question the model did not ask, and a `look` answers the one it did, in one
 * result it can read without waiting for the next turn's context to be
 * assembled.
 */
export function lookPerception(
  session: LayoutSession,
  options?: LookPerceptionOptions,
): PerceptionResult {
  const diagnostics = runDiagnostics(session.draft);
  session.lastDiagnostics = diagnostics;
  const routes = boardRoutesBlock(session);
  const framed = frameRegions(session, options ?? {});
  const perception = renderPerception(session, {
    view: framed.sectionView,
    crops: framed.crops,
    onRender: options?.onRender,
  });
  const measures = framed.regions.map((region) => formatRegionMeasures(
    region.label,
    measureRegion(
      session.draft,
      region.rect,
      region.sectionId !== undefined ? { sectionId: region.sectionId } : undefined,
    ),
  ));
  const blocks = [
    ...(options?.headline !== undefined ? [options.headline] : []),
    `LOOK · ${perception.pngs.length} render${perception.pngs.length === 1 ? "" : "s"}`
    + (framed.sectionView !== undefined ? ` · close-up ${framed.sectionView}` : "")
    + framed.crops.map((crop) => ` · framed ${crop.label}`).join(""),
    formatBoardDigest(session.draft),
    boardDiffBlock(session),
    formatDiagnostics(diagnostics),
    ...(routes ? [routes] : []),
    formatRequestsBlock(session.requests),
    ...measures,
    ...framed.notes,
    ...perception.notes,
  ];
  return {
    ...(perception.pngs.length > 0 ? { pngs: perception.pngs } : {}),
    text: blocks.join("\n"),
    ...(options?.details !== undefined ? { details: options.details } : {}),
    diagnostics,
  };
}
