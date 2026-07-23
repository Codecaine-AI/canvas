/**
 * The seven layout-tool implementations behind the runtime (board,
 * apply_ops, apply_quickfix, render_draft, inspect, commit, abandon) and
 * `createToolRuntime`, which binds them to the store's current session.
 *
 * Perception here is truth-only: `board` returns the digest + diagnostics
 * (house exemplar image on first call), `inspect` on a connection reports
 * the PRODUCTION router's chosen anchor sides, routed polyline, and any
 * through-boxes alongside the stored fields, and `commit` re-runs the
 * E-tier gate before producing the doc-diff proposal.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import { routeConnection } from "../../../../canvas/src/connectors/routing";
import { renderDocumentToSvg } from "../../../../canvas/src/render/static-svg";

import { diffDocuments } from "../../board/doc-diff";
import { pathBoxViolationIds } from "../../board/lints/geometry";
import { formatDiagnostics, runDiagnostics } from "../../board/lints/run";
import { LAYOUT_RULES } from "../../board/lints";
import type {
  AgentPatchOperation,
  AgentProposal,
  AgentSessionEvent,
} from "../../protocol";
import { CANVASES_DIR } from "../kernel";
import { rasterizeSvgToPng } from "../render";
import type {
  LayoutRenderRequest,
  LayoutToolRenderResult,
  LayoutToolRuntime,
  LayoutToolTextResult,
} from "../tool-runtime";
import {
  applyOperationBatch,
  assembleApplyResult,
  describePatchOperation,
  operationValidationErrors,
  type SessionEventSink,
} from "./apply-ops";
import {
  boardReport,
  documentWithinCrop,
  expandRect,
  renderCropError,
  scopedDiagnostics,
  solvedFrame,
} from "./context";
import type { LayoutSession } from "./store";

const CONTEXT_RING = 128;
const DEFAULT_RENDER_WIDTH = 2000;
const MIN_RENDER_WIDTH = 200;
const MAX_RENDER_WIDTH = 4096;
const EXEMPLAR_CANVAS_ID = "gc-decomp-harness";

export interface LayoutToolState {
  renderCount: number;
  /** undefined = not attempted, null = missing/unrenderable, Buffer = cached. */
  exemplarPng: Buffer | null | undefined;
}

export interface LayoutToolHost {
  currentSession(): LayoutSession;
  emit(session: LayoutSession, event: AgentSessionEvent): void;
  onRender(sessionId: string, png: Buffer, index: number): void;
}

export function createLayoutToolState(): LayoutToolState {
  return { renderCount: 0, exemplarPng: undefined };
}

function houseStyleExemplar(state: LayoutToolState): Buffer | null {
  if (state.exemplarPng !== undefined) return state.exemplarPng;
  const path = join(CANVASES_DIR, `${EXEMPLAR_CANVAS_ID}.canvas.json`);
  if (!existsSync(path)) {
    state.exemplarPng = null;
    return null;
  }
  try {
    const document = JSON.parse(readFileSync(path, "utf8")) as InteractiveCanvasDocument;
    const pageFrame = document.objects.find(
      (object) => object.type === "section" && object.locked === "background",
    );
    const rendered = renderDocumentToSvg(document, {
      ...(pageFrame ? { sectionId: pageFrame.id } : {}),
      fit: "content",
      padding: 16,
      width: 1400,
    });
    state.exemplarPng = rasterizeSvgToPng(rendered.svg).png;
  } catch {
    state.exemplarPng = null;
  }
  return state.exemplarPng;
}

export function toolBoard(
  session: LayoutSession,
  state: LayoutToolState,
): LayoutToolRenderResult {
  const attachExemplar = !session.exemplarShown;
  session.exemplarShown = true;
  const report = boardReport(session);
  const sections = [report.digest, "", report.diagnosticsText];
  const png = attachExemplar ? houseStyleExemplar(state) : null;
  if (png) {
    sections.push(
      "",
      "Reference board (house style): note section tinting, labeled edges, dashed vs solid flows, and margin notes. Aim for this level of finish.",
    );
  }
  const errors = report.diagnostics.filter((item) => item.severity === "error").length;
  return {
    ...(png ? { png } : {}),
    text: sections.join("\n"),
    details: { errors, warnings: report.diagnostics.length - errors },
  };
}

export function toolApplyOps(
  session: LayoutSession,
  operations: AgentPatchOperation[],
  emit: SessionEventSink,
): LayoutToolRenderResult {
  if (!Array.isArray(operations)) {
    return { isError: true, text: "apply_ops rejected:\n- ops must be an array." };
  }
  const errors = operationValidationErrors(session, operations);
  if (errors.length > 0) {
    return {
      isError: true,
      text: [
        "apply_ops rejected; no operations were applied:",
        ...errors.map((error) => `- ${error}`),
      ].join("\n"),
    };
  }
  const before = session.draft;
  const { summaryText } = applyOperationBatch(session, operations);
  return assembleApplyResult(
    session,
    before,
    `APPLIED · ${operations.length} op${operations.length === 1 ? "" : "s"}`,
    summaryText,
    { operations: operations.length },
    emit,
  );
}

export function toolApplyQuickfix(
  session: LayoutSession,
  diagnosticId: string,
  emit: SessionEventSink,
): LayoutToolRenderResult {
  if (typeof diagnosticId !== "string" || diagnosticId.trim() === "") {
    return {
      isError: true,
      text: "apply_quickfix rejected: diagnosticId must be a non-empty string.",
    };
  }
  const id = diagnosticId.trim();
  const diagnostics = runDiagnostics(session.draft);
  const diagnostic = diagnostics.find((entry) => entry.id === id);
  if (!diagnostic) {
    return {
      isError: true,
      text: `apply_quickfix rejected: no diagnostic "${id}" on the current draft. `
        + "Ids reset whenever the draft changes — call board and use a current id.",
    };
  }
  const rule = LAYOUT_RULES.find((entry) => entry.id === diagnostic.rule);
  if (!diagnostic.quickfixAvailable || !rule?.quickfix) {
    return {
      isError: true,
      text: `Diagnostic ${id} (${diagnostic.rule}) offers no quickfix — resolve it with apply_ops instead.`,
    };
  }
  const operations = rule.quickfix(session.draft, diagnostic);
  if (operations.length === 0) {
    return {
      isError: true,
      text: `Diagnostic ${id} (${diagnostic.rule}) produced no quickfix operations for the current draft.`,
    };
  }
  const validationErrors = operationValidationErrors(session, operations);
  if (validationErrors.length > 0) {
    return {
      isError: true,
      text: [
        `apply_quickfix ${id} rejected; no operations were applied:`,
        ...validationErrors.map((error) => `- ${error}`),
      ].join("\n"),
    };
  }
  const before = session.draft;
  const { summaryText } = applyOperationBatch(session, operations);
  return assembleApplyResult(
    session,
    before,
    `APPLIED · quickfix ${id} (${diagnostic.rule}) · ${operations.length} op${operations.length === 1 ? "" : "s"}`,
    summaryText,
    { diagnosticId: id, operations: operations.length },
    emit,
  );
}

export function toolRenderDraft(
  session: LayoutSession,
  request: LayoutRenderRequest,
  emit: SessionEventSink,
  state: LayoutToolState,
  onRender?: (sessionId: string, png: Buffer, index: number) => void,
): LayoutToolRenderResult {
  const crop = request.crop ?? expandRect(solvedFrame(session), CONTEXT_RING);
  const cropError = renderCropError(crop);
  if (cropError) return { isError: true, text: cropError };
  if (request.pixelWidth !== undefined && !Number.isFinite(request.pixelWidth)) {
    return { isError: true, text: "Raster width must be a finite number." };
  }
  const pixelWidth = Math.round(Math.min(
    MAX_RENDER_WIDTH,
    Math.max(MIN_RENDER_WIDTH, request.pixelWidth ?? DEFAULT_RENDER_WIDTH),
  ));
  emit(session, { type: "rendering", sessionId: session.id, n: session.proposalCount });
  try {
    const rendered = renderDocumentToSvg(documentWithinCrop(session.draft, crop), {
      cropRect: crop,
      width: pixelWidth,
    });
    const { png, width, height } = rasterizeSvgToPng(rendered.svg);
    state.renderCount += 1;
    onRender?.(session.id, png, state.renderCount);
    return {
      png,
      text: `Rendered the current draft: world crop x=${Math.round(crop.x)} y=${Math.round(crop.y)} ${Math.round(crop.width)}×${Math.round(crop.height)} at ${width}×${height}px.`,
      details: { crop, width, height },
    };
  } catch (error) {
    return {
      isError: true,
      text: `Rasterization failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function toolInspect(
  session: LayoutSession,
  objectIds: string[],
): LayoutToolTextResult {
  const byId = new Map(session.draft.objects.map((object) => [object.id, object]));
  const connections = new Map(session.draft.connections.map((connection) => [
    connection.id,
    connection,
  ]));
  const lines: string[] = [];
  for (const id of objectIds) {
    const object = byId.get(id);
    if (!object) {
      const connection = connections.get(id);
      if (connection) {
        const from = byId.get(connection.from.objectId);
        const to = byId.get(connection.to.objectId);
        lines.push(
          `connection ${id}`,
          `  stored: from=${connection.from.objectId} anchor=${connection.from.anchor ?? "auto"}`
          + ` → to=${connection.to.objectId} anchor=${connection.to.anchor ?? "auto"}`
          + `; waypoints=${formatStoredWaypoints(connection.waypoints)}`
          + `; label=${connection.label === undefined ? "—" : JSON.stringify(connection.label)}`
          + ` style=${connection.style ?? "solid"} color=${connection.color ?? "gray"}`
          + ` arrow=${connection.arrow ?? "forward"}`,
        );
        if (!from || !to) {
          const missing = [
            !from ? connection.from.objectId : undefined,
            !to ? connection.to.objectId : undefined,
          ].filter((objectId): objectId is string => objectId !== undefined);
          lines.push(`  routed: unavailable (missing endpoint${missing.length === 1 ? "" : "s"} ${missing.join(", ")})`);
          continue;
        }
        const routed = routeConnection(from, to, connection, session.draft.objects);
        const points = routed.points ?? [routed.start, routed.end];
        const violations = connection.from.objectId === connection.to.objectId
          ? []
          : pathBoxViolationIds(
            points,
            connection.from.objectId,
            connection.to.objectId,
            session.draft.objects,
          );
        lines.push(
          `  routed: anchors=${routed.startAnchor}→${routed.endAnchor}`
          + `; path=${formatRoundedPolyline(points)}`
          + `; through=${violations.length > 0 ? violations.join(",") : "none"}`,
        );
        continue;
      }
      lines.push(`${id}: not present in the current draft.`);
      continue;
    }
    const { x, y, width, height } = object.geometry;
    lines.push(`${object.type} ${id}: x=${x} y=${y} w=${width} h=${height}`);
    lines.push(`  text: ${JSON.stringify(object.text)}`);
  }
  return { text: lines.length > 0 ? lines.join("\n") : "No object refs given." };
}

function formatStoredWaypoints(
  waypoints: ReadonlyArray<readonly [number, number]> | undefined,
): string {
  if (!waypoints || waypoints.length === 0) return "none";
  return waypoints.map(([x, y]) => `${x},${y}`).join(" → ");
}

function formatRoundedPolyline(
  points: ReadonlyArray<{ x: number; y: number }>,
): string {
  return points.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(" → ");
}

export function toolCommit(
  session: LayoutSession,
  summary: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  const report = boardReport(session);
  const scoped = scopedDiagnostics(session, report.diagnostics);
  const blocking = scoped.filter((diagnostic) => diagnostic.severity === "error");
  if (blocking.length > 0) {
    return {
      isError: true,
      text: [
        `Commit blocked: ${blocking.length} error-tier diagnostic${blocking.length === 1 ? "" : "s"} must be resolved first:`,
        ...blocking.map((diagnostic) =>
          `- ${diagnostic.id} ${diagnostic.rule}: ${diagnostic.message}`
          + (diagnostic.suggestion ? ` (${diagnostic.suggestion})` : "")),
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
    summary: summary.trim() || `Edited ${session.scopeIds.size} objects.`,
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
    details: { operations: proposal.operations.length },
  };
}

export function toolAbandon(
  session: LayoutSession,
  reason: string,
  emit: SessionEventSink,
): LayoutToolTextResult {
  session.status = "abandoned";
  emit(session, {
    type: "abandoned",
    sessionId: session.id,
    reason: reason.trim() || "No reason given.",
  });
  return { text: "Session abandoned. The board is untouched." };
}

export function createToolRuntime(host: LayoutToolHost): LayoutToolRuntime {
  const state = createLayoutToolState();
  return {
    board: () => toolBoard(host.currentSession(), state),
    applyOps: (operations) => toolApplyOps(host.currentSession(), operations, host.emit),
    applyQuickfix: (id) => toolApplyQuickfix(host.currentSession(), id, host.emit),
    renderDraft: (request) => toolRenderDraft(
      host.currentSession(),
      request,
      host.emit,
      state,
      host.onRender,
    ),
    inspect: (ids) => toolInspect(host.currentSession(), ids),
    commit: (summary) => toolCommit(host.currentSession(), summary, host.emit),
    abandon: (reason) => toolAbandon(host.currentSession(), reason, host.emit),
  };
}
