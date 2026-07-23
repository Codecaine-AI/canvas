/**
 * The apply_ops pipeline, in order: validate the WHOLE batch against the six
 * op kinds (any invalid op rejects the batch — id existence, color roster,
 * geometry sanity, waypoint shape, locked-frame protection), mutate the
 * draft op by op, then run the shared `autoFitSectionsAfterAgentPatch` once
 * for the batch (sections whose children changed fit innermost-first; the
 * page frame and explicitly resized sections are exempt), re-run the five
 * lints, and assemble the result the model reads: APPLIED summary, DELTA
 * derived from documents (never from op payloads), the lint delta, and a
 * close-up PNG crop of the touched region.
 *
 * The auto-fit helper is imported from the canvas package so this draft
 * applier and studio's accept-time reducer produce identical geometry.
 */
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import { autoFitSectionsAfterAgentPatch } from "@codecaine-ai/canvas/agent-patch-auto-fit";
import {
  isCanvasColor,
  type CanvasGeometry,
  type InteractiveCanvasConnection,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import { renderDocumentToSvg } from "../../../../canvas/src/render/static-svg";
import { sectionDescendantIds } from "../../../../canvas/src/state/geometry";
import { nextId } from "../../../../canvas/src/state/actions/helpers";
import { mergeObjectPatch } from "../../../../canvas/src/state/actions/objects";
import { OBJECT_TYPE_DEFAULTS } from "../../../../canvas/src/state/schema/object-defaults";

import { formatDiagnostics, runDiagnostics } from "../../board/lints/run";
import type { Diagnostic } from "../../board/lints";
import type { AgentPatchOperation, AgentSessionEvent } from "../../protocol";
import type { Rect } from "../../board/types";
import { rasterizeSvgToPng } from "../render";
import type { LayoutToolRenderResult } from "../tool-runtime";
import {
  documentWithinCrop, expandRect, finiteGeometry, renderCropError, round2,
} from "./context";
import type { LayoutSession } from "./store";

const CLOSE_UP_RING = 96;
const CLOSE_UP_WIDTH = 800;
const OBJECT_TYPES = new Set<string>(Object.keys(OBJECT_TYPE_DEFAULTS));

export type SessionEventSink = (session: LayoutSession, event: AgentSessionEvent) => void;

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function describePatchOperation(operation: CanvasAgentPatchOperation): string {
  switch (operation.type) {
    case "addObject": return `addObject ${operation.object.id}`;
    case "updateObject":
      return `updateObject ${operation.objectId} (${Object.keys(operation.patch).join(", ")})`;
    case "removeObject": return `removeObject ${operation.objectId}`;
    case "addConnection": return `addConnection ${operation.connection.id}`;
    case "updateConnection":
      return `updateConnection ${operation.connectionId} (${Object.keys(operation.patch).join(", ")})`;
    case "removeConnection": return `removeConnection ${operation.connectionId}`;
  }
}

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

interface ChannelField { field: string; fallback?: string }

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

interface DocumentDelta {
  lines: string[];
  geometric: boolean;
  regions: Rect[];
}

/** Derive touched channels and geometry from documents, never from operation payloads. */
function documentDelta(
  before: InteractiveCanvasDocument,
  after: InteractiveCanvasDocument,
): DocumentDelta {
  const lines: string[] = [];
  const regions: Rect[] = [];
  let geometric = false;
  const beforeById = new Map(before.objects.map((object) => [object.id, object]));
  const afterIds = new Set(after.objects.map((object) => object.id));

  for (const object of after.objects) {
    const previous = beforeById.get(object.id);
    if (!previous) {
      lines.push(
        `+ ${object.id}  ${object.type} ${fmtPos(object.geometry)} ${fmtSize(object.geometry)} ${JSON.stringify(object.text)}`,
      );
      regions.push(object.geometry);
      geometric = true;
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
      regions.push(a, b);
      geometric = true;
    }
    lines.push(...channelDeltaLines(
      object.id,
      previous as unknown as Record<string, unknown>,
      object as unknown as Record<string, unknown>,
      OBJECT_CHANNEL_FIELDS,
    ));
  }
  for (const object of before.objects) {
    if (afterIds.has(object.id)) continue;
    lines.push(`− ${object.id}`);
    regions.push(object.geometry);
    geometric = true;
  }

  const endpointRect = (id: string): Rect | undefined =>
    after.objects.find((object) => object.id === id)?.geometry ?? beforeById.get(id)?.geometry;
  const pushEndpointRegions = (...ids: string[]): void => {
    for (const id of new Set(ids)) {
      const rect = endpointRect(id);
      if (rect) regions.push(rect);
    }
  };
  const beforeConnections = new Map(before.connections.map((connection) => [
    connection.id,
    connection,
  ]));
  const afterConnectionIds = new Set(after.connections.map((connection) => connection.id));

  for (const connection of after.connections) {
    const previous = beforeConnections.get(connection.id);
    if (!previous) {
      lines.push(`+ ${connection.id}  ${connection.from.objectId} → ${connection.to.objectId}`);
      pushEndpointRegions(connection.from.objectId, connection.to.objectId);
      geometric = true;
      continue;
    }
    if (previous.from.objectId !== connection.from.objectId
      || previous.to.objectId !== connection.to.objectId) {
      lines.push(
        `${connection.id}  route ${previous.from.objectId}→${previous.to.objectId}`
        + ` → ${connection.from.objectId}→${connection.to.objectId}`,
      );
      pushEndpointRegions(
        previous.from.objectId,
        previous.to.objectId,
        connection.from.objectId,
        connection.to.objectId,
      );
      geometric = true;
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
    pushEndpointRegions(connection.from.objectId, connection.to.objectId);
    geometric = true;
  }
  return { lines, geometric, regions };
}

export function operationValidationErrors(
  session: LayoutSession,
  operations: readonly AgentPatchOperation[],
): string[] {
  const objectIds = new Set(session.draft.objects.map((object) => object.id));
  const connectionIds = new Set(session.draft.connections.map((connection) => connection.id));
  const endpointIds = new Set(objectIds);
  for (const operation of operations) {
    const record = recordOf(operation);
    const object = recordOf(record?.object);
    if (record?.type === "addObject" && typeof object?.id === "string") endpointIds.add(object.id);
  }

  const errors: string[] = [];
  const add = (index: number, message: string): void => {
    errors.push(`op ${index + 1}: ${message}`);
  };
  const validateColor = (index: number, value: unknown): void => {
    if (value !== undefined && !isCanvasColor(value)) {
      add(index, `color ${JSON.stringify(value)} is outside the canvas color roster.`);
    }
  };
  const validateEndpoint = (index: number, label: "from" | "to", value: unknown): void => {
    const endpoint = recordOf(value);
    const id = endpoint?.objectId;
    if (typeof id !== "string") {
      add(index, `${label} must have the shape { objectId: string }.`);
    } else if (!endpointIds.has(id)) {
      add(index, `${label} references unknown object "${id}".`);
    }
  };
  const validateWaypoints = (index: number, value: unknown): void => {
    if (value === undefined) return;
    const valid = Array.isArray(value) && value.every((point) =>
      Array.isArray(point)
      && point.length === 2
      && point.every((entry) => typeof entry === "number" && Number.isFinite(entry)));
    if (!valid) {
      add(index, "waypoints must be an array of [x, y] finite-number pairs.");
    }
  };

  operations.forEach((operation, index) => {
    const record = recordOf(operation);
    const kind = record?.type;
    if (typeof kind !== "string" || ![
      "addObject", "updateObject", "removeObject",
      "addConnection", "updateConnection", "removeConnection",
    ].includes(kind)) {
      add(index, `unknown operation kind ${JSON.stringify(kind)}.`);
      return;
    }
    const payload = record as Record<string, unknown>;
    if (kind === "addObject") {
      const object = recordOf(payload.object);
      if (!object || typeof object.id !== "string") {
        add(index, "addObject.object must include a string id.");
      }
      if (!object || typeof object.type !== "string" || !OBJECT_TYPES.has(object.type)) {
        add(index, `addObject type ${JSON.stringify(object?.type)} is invalid.`);
      }
      if (!object || !finiteGeometry(object.geometry)) {
        add(index, "addObject geometry must contain finite x/y/width/height numbers.");
      }
      validateColor(index, object?.color);
      return;
    }
    if (kind === "updateObject") {
      if (typeof payload.objectId !== "string") {
        add(index, "updateObject.objectId must be a string.");
      } else if (!objectIds.has(payload.objectId)) {
        add(index, `updateObject id "${payload.objectId}" is not in the draft.`);
      }
      const patch = recordOf(payload.patch);
      if (!patch) add(index, "updateObject.patch must be an object.");
      else validateColor(index, patch.color);
      return;
    }
    if (kind === "removeObject") {
      if (typeof payload.objectId !== "string") {
        add(index, "removeObject.objectId must be a string.");
      } else if (!objectIds.has(payload.objectId)) {
        add(index, `removeObject id "${payload.objectId}" is not in the draft.`);
      } else {
        const object = session.draft.objects.find((item) => item.id === payload.objectId);
        if (object?.type === "section" && object.locked === "background") {
          add(index, `removeObject id "${payload.objectId}" is a locked background frame.`);
        }
      }
      return;
    }
    if (kind === "addConnection") {
      const connection = recordOf(payload.connection);
      if (!connection || typeof connection.id !== "string") {
        add(index, "addConnection.connection must include a string id.");
      }
      validateEndpoint(index, "from", connection?.from);
      validateEndpoint(index, "to", connection?.to);
      validateColor(index, connection?.color);
      validateWaypoints(index, connection?.waypoints);
      return;
    }
    if (kind === "updateConnection") {
      if (typeof payload.connectionId !== "string") {
        add(index, "updateConnection.connectionId must be a string.");
      } else if (!connectionIds.has(payload.connectionId)) {
        add(index, `updateConnection id "${payload.connectionId}" is not in the draft.`);
      }
      const patch = recordOf(payload.patch);
      if (!patch) {
        add(index, "updateConnection.patch must be an object.");
      } else {
        if (patch.from !== undefined) validateEndpoint(index, "from", patch.from);
        if (patch.to !== undefined) validateEndpoint(index, "to", patch.to);
        validateColor(index, patch.color);
        validateWaypoints(index, patch.waypoints);
      }
      return;
    }
    if (typeof payload.connectionId !== "string") {
      add(index, "removeConnection.connectionId must be a string.");
    } else if (!connectionIds.has(payload.connectionId)) {
      add(index, `removeConnection id "${payload.connectionId}" is not in the draft.`);
    }
  });
  return errors;
}

export function applyOperationToDraft(
  document: InteractiveCanvasDocument,
  operation: AgentPatchOperation,
): { document: InteractiveCanvasDocument; summary: string; touched: string[] } {
  switch (operation.type) {
    case "addObject": {
      const object = operation.object as unknown as InteractiveCanvasObject;
      if (document.objects.some((candidate) => candidate.id === object.id)) {
        return {
          document,
          summary: `addObject ${object.id}: skipped (id already exists)`,
          touched: [object.id],
        };
      }
      return {
        document: { ...document, objects: [...document.objects, { ...object, parentId: null }] },
        summary: `addObject ${object.id}`,
        touched: [object.id],
      };
    }
    case "updateObject": {
      const { parentId: _ignored, ...patch } = operation.patch as Record<string, unknown>;
      return {
        document: {
          ...document,
          objects: document.objects.map((object) => object.id === operation.objectId
            ? mergeObjectPatch(object, patch as Partial<Omit<InteractiveCanvasObject, "id">>)
            : object),
        },
        summary: `updateObject ${operation.objectId}`,
        touched: [operation.objectId],
      };
    }
    case "removeObject": {
      const existing = document.objects.find((object) => object.id === operation.objectId)!;
      const removedIds = new Set([operation.objectId]);
      if (existing.type === "section") {
        sectionDescendantIds(document, operation.objectId).forEach((id) => removedIds.add(id));
      }
      const removedConnectionIds = new Set(document.connections
        .filter((connection) => removedIds.has(connection.from.objectId)
          || removedIds.has(connection.to.objectId))
        .map((connection) => connection.id));
      return {
        document: {
          ...document,
          objects: document.objects.filter((object) => !removedIds.has(object.id)),
          connections: document.connections.filter(
            (connection) => !removedConnectionIds.has(connection.id),
          ),
          annotations: document.annotations?.filter((annotation) => {
            if (annotation.target.kind === "object") {
              return !removedIds.has(annotation.target.objectId);
            }
            if (annotation.target.kind === "connection") {
              return !removedConnectionIds.has(annotation.target.connectionId);
            }
            return true;
          }),
        },
        summary: `removeObject ${operation.objectId}`,
        touched: [...removedIds],
      };
    }
    case "addConnection": {
      const requested = operation.connection as unknown as InteractiveCanvasConnection;
      if (requested.from.objectId === requested.to.objectId) {
        return {
          document,
          summary: `addConnection ${requested.id}: skipped — self-loops are not yet supported by the connector router; `
            + "represent the loop another way (e.g. a labeled badge or sticky on the state) or leave it out and say so",
          touched: [requested.from.objectId],
        };
      }
      const valid = document.objects.some((object) => object.id === requested.from.objectId)
        && document.objects.some((object) => object.id === requested.to.objectId);
      if (!valid) {
        return {
          document,
          summary: `addConnection ${requested.id}: skipped (endpoints unavailable after earlier ops)`,
          touched: [requested.from.objectId, requested.to.objectId],
        };
      }
      const id = document.connections.some((connection) => connection.id === requested.id)
        ? nextId("connection", document.connections.map((connection) => connection.id))
        : requested.id;
      const duplicateOf = document.connections.find((connection) =>
        connection.from.objectId === requested.from.objectId
        && connection.to.objectId === requested.to.objectId);
      return {
        document: { ...document, connections: [...document.connections, { ...requested, id }] },
        summary: duplicateOf
          ? `addConnection ${id} — WARNING: possible duplicate of ${duplicateOf.id}; use updateConnection to restyle an existing edge`
          : `addConnection ${id}`,
        touched: [requested.from.objectId, requested.to.objectId],
      };
    }
    case "updateConnection": {
      const existing = document.connections.find(
        (connection) => connection.id === operation.connectionId,
      )!;
      const updated = {
        ...existing,
        ...operation.patch,
      } as InteractiveCanvasConnection;
      return {
        document: {
          ...document,
          connections: document.connections.map((connection) =>
            connection.id === operation.connectionId ? updated : connection),
        },
        summary: `updateConnection ${operation.connectionId}`,
        touched: [
          existing.from.objectId,
          existing.to.objectId,
          updated.from.objectId,
          updated.to.objectId,
        ],
      };
    }
    case "removeConnection": {
      const existing = document.connections.find(
        (connection) => connection.id === operation.connectionId,
      );
      return {
        document: {
          ...document,
          connections: document.connections.filter(
            (connection) => connection.id !== operation.connectionId,
          ),
          annotations: document.annotations?.filter((annotation) =>
            annotation.target.kind !== "connection"
            || annotation.target.connectionId !== operation.connectionId),
        },
        summary: `removeConnection ${operation.connectionId}`,
        touched: existing ? [existing.from.objectId, existing.to.objectId] : [],
      };
    }
  }
}

export function applyOperationBatch(
  session: LayoutSession,
  operations: readonly AgentPatchOperation[],
): { summaryText: string } {
  const before = session.draft;
  let document = before;
  const summaries: string[] = [];
  const explicitlyResizedSectionIds = new Set<string>();
  operations.forEach((operation, index) => {
    const patchedGeometry = operation.type === "updateObject"
      ? recordOf(operation.patch.geometry)
      : null;
    if (operation.type === "updateObject" && patchedGeometry) {
      const existing = document.objects.find((object) => object.id === operation.objectId);
      if (existing?.type === "section"
        && (patchedGeometry.width !== existing.geometry.width
          || patchedGeometry.height !== existing.geometry.height)) {
        explicitlyResizedSectionIds.add(operation.objectId);
      }
    }
    const applied = applyOperationToDraft(document, operation);
    document = applied.document;
    summaries.push(`${index + 1}. ${applied.summary}`);
  });
  session.draft = autoFitSectionsAfterAgentPatch(
    before,
    document,
    explicitlyResizedSectionIds,
  ).document;
  return {
    summaryText: summaries.length > 0 ? summaries.join("\n") : "No operations in the batch.",
  };
}

function diagnosticFingerprint(diagnostic: Diagnostic): string {
  return [diagnostic.rule, [...diagnostic.at].sort().join(","), diagnostic.message].join("\x00");
}

function lintsDeltaText(session: LayoutSession, diagnostics: Diagnostic[]): string {
  const previous = session.lastDiagnostics;
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
    const suggestion = diagnostic.suggestion ? ` (${diagnostic.suggestion})` : "";
    const quickfix = diagnostic.quickfixAvailable ? " [quickfix]" : "";
    lines.push(`  + ${diagnostic.id} ${diagnostic.rule}: ${diagnostic.message}${suggestion}${quickfix}`);
  }
  if (resolved.length > 0) {
    lines.push(
      `  ${resolved.map((item) => `− ${item.id} ${item.rule}`).join(", ")}  (resolved)`,
    );
  }
  return lines.join("\n");
}

function unionRects(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

function perceptionCloseUp(session: LayoutSession, regions: readonly Rect[]): Buffer | undefined {
  const finite = regions.filter((rect) => finiteGeometry(rect));
  if (finite.length === 0 || session.draft.objects.length === 0) return undefined;
  const ring = expandRect(unionRects(finite), CLOSE_UP_RING);
  const board = expandRect(
    unionRects(session.draft.objects.map((object) => object.geometry)),
    CLOSE_UP_RING,
  );
  const crop = intersectRects(ring, board) ?? ring;
  if (renderCropError(crop)) return undefined;
  try {
    const rendered = renderDocumentToSvg(documentWithinCrop(session.draft, crop), {
      cropRect: crop,
      width: CLOSE_UP_WIDTH,
    });
    return rasterizeSvgToPng(rendered.svg).png;
  } catch {
    return undefined;
  }
}

export function assembleApplyResult(
  session: LayoutSession,
  before: InteractiveCanvasDocument,
  headline: string,
  summaryText: string,
  details: Record<string, unknown>,
  emit: SessionEventSink,
): LayoutToolRenderResult {
  const delta = documentDelta(before, session.draft);
  const diagnostics = runDiagnostics(session.draft);
  const lintText = lintsDeltaText(session, diagnostics);
  emit(session, { type: "proposal", sessionId: session.id, n: session.proposalCount });
  emit(session, {
    type: "delta",
    sessionId: session.id,
    n: session.proposalCount,
    delta: summaryText,
    lint: formatDiagnostics(diagnostics),
  });
  const deltaBlock = delta.lines.length > 0
    ? ["DELTA", ...delta.lines.map((line) => `  ${line}`)].join("\n")
    : "DELTA · none";
  const png = delta.geometric ? perceptionCloseUp(session, delta.regions) : undefined;
  const indentedSummary = summaryText.split("\n").map((line) => `  ${line}`).join("\n");
  return {
    ...(png ? { png } : {}),
    text: [headline, indentedSummary, deltaBlock, lintText].join("\n"),
    details,
  };
}
