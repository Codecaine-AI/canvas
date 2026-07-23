/**
 * Layout session store (HARNESS-SETUP-PLAN §3) — the harness's workflow
 * state and the implementation behind the five layout tools.
 *
 * A LayoutSession holds: the baseline document (read from repo-root
 * `canvases/` — READ-ONLY, the harness never writes a canvas file), its
 * hash, the fitted scope, the current draft document (the board as it would
 * be if the proposal were accepted), the proposal history, and the SSE
 * subscriber fanout. Kernel identity: one container of kind "layout-session"
 * with key [canvasId, sessionId]; one kernel agent session per layout
 * session, each instruction a new run (refine = follow-up run into the same
 * Pi session).
 *
 * Rebase-on-accept (KERNEL-PROPOSAL §2.5): on accept the live file is
 * rehashed; if it changed, the scope is checked against the live document and
 * the accepted program is re-solved onto it. A scope object that was
 * hand-moved or deleted mid-session fails the accept with a 409 and a
 * plain-language message.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { updateContainerStatus, type KernelDatabase } from "@agent-kernel/db";
import { getRunContext, type KernelInstance } from "@agent-kernel/kernel";

import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import {
  isCanvasColor,
  type CanvasGeometry,
  type InteractiveCanvasAnnotation,
  type InteractiveCanvasConnection,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
// Relative import (not the package root) so the harness never loads the
// package's React surface — same rule as studio's server (canvas-file-api.ts).
import { renderDocumentToSvg } from "../../../canvas/src/render/static-svg";
import {
  fitSectionToChildren,
  sectionDescendantIds,
} from "../../../canvas/src/state/geometry";
import { reconcileSectionMembership } from "../../../canvas/src/state/section-membership";
import { nextId } from "../../../canvas/src/state/actions/helpers";
import { mergeObjectPatch } from "../../../canvas/src/state/actions/objects";
import { OBJECT_TYPE_DEFAULTS } from "../../../canvas/src/state/schema/object-defaults";

import {
  diffPrograms,
  diffDocuments,
  documentToOccupancyAscii,
  expandSketch,
  fitScope,
  formatDeltaReport,
  formatLintReport,
  MINIMUM_SECTION_DIMENSIONS,
  minimumDimensionsForItem,
  parseSketch,
  type DiffResult,
  type FitScopeResult,
  type Sketch,
  type SketchNode,
  type SketchRect,
} from "../pipeline";

import { buildBoardModel, formatBoardDigest } from "../digest/board-model";
import { formatDiagnostics, runDiagnostics } from "../diagnostics/run";
import { LAYOUT_RULES } from "../rules";
import type { Diagnostic } from "../rules/types";

import type {
  AcceptAgentSessionResponse,
  AgentProposal,
  AgentPatchOperation,
  AgentSessionAnnotation,
  AgentSessionEvent,
  AgentSessionState,
  AgentSessionStatus,
  AgentSessionViewport,
  CreateAgentSessionRequest,
} from "../protocol";

import { CANVASES_DIR, REPO_ROOT, AGENT_KERNEL_DIR, createLayoutKernel } from "./kernel";
import type { EditorStateSnapshot } from "./loaders/editor-state";
import { rasterizeSvgToPng } from "./render";
import type {
  LayoutRenderRequest,
  LayoutToolRenderResult,
  LayoutToolRuntime,
  LayoutToolTextResult,
} from "./tool-runtime";

const AGENT_NAME = "layout-editor";
/** World-space context ring around the scope frame for the camera + inspect. */
const CONTEXT_RING = 128;
/** Default raster width for render_draft (v4: big images are an accepted cost). */
const DEFAULT_RENDER_WIDTH = 2000;
const MIN_RENDER_WIDTH = 200;
/** Requests may use the full raster cap (render.ts MAX_RASTER_DIMENSION). */
const MAX_RENDER_WIDTH = 4096;
/** Raster width for the operator-facing ghost-preview SVG feed. */
const GHOST_PREVIEW_WIDTH = 1400;
/** A generous world-space bound that rejects overflow/memory-bomb crops. */
const MAX_RENDER_CROP_DIMENSION = 1_000_000;
const MAX_RENDER_WORLD_COORDINATE = 1_000_000_000;
const SESSION_DIR_ROOT = join(AGENT_KERNEL_DIR, "layout-sessions");
const EXEMPLAR_CANVAS_ID = "gc-decomp-harness";
/** World ring around the touched region for the auto close-up (v5 §2). */
const CLOSE_UP_RING = 96;
/** Raster width for the apply-result close-up crop (v5 §2, ~800px). */
const CLOSE_UP_WIDTH = 800;
const SOLVE_LAYOUT_PADDING = 16;
const DOCUMENT_ITEM_MINIMUM = { width: 32, height: 24 } as const;

const OBJECT_TYPES = new Set<string>(Object.keys(OBJECT_TYPE_DEFAULTS));

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface LayoutSession {
  id: string;
  canvasId: string;
  canvasPath: string;
  baseline: InteractiveCanvasDocument;
  baselineHash: string;
  /** The invoke request's scope (pre-resolution). */
  requestedScopeIds: string[];
  /** The fit of the BASELINE scope — frozen for rebase checks. */
  baselineFit: FitScopeResult;
  /** The latest fit the model saw (drifts with the draft across proposals). */
  currentFit: FitScopeResult;
  /** Resolved Ring-0 ids (baseline scope; draft-created ids never join). */
  scopeIds: Set<string>;
  draft: InteractiveCanvasDocument;
  /** The last successfully solved proposal's sketch (re-solved on rebase). */
  lastSketch: Sketch | null;
  proposalCount: number;
  proposal: AgentProposal | null;
  status: AgentSessionStatus;
  error: string | null;
  instruction: string;
  annotations: AgentSessionAnnotation[];
  viewport: AgentSessionViewport | undefined;
  containerId: string;
  sessionDir: string;
  events: AgentSessionEvent[];
  subscribers: Set<(event: AgentSessionEvent) => void>;
  /** Resolves when the current agent run settles (CLI awaits this). */
  runPromise: Promise<void> | null;
  /** The house-style exemplar is attached to at most the first `board` result. */
  exemplarShown?: boolean;
  /**
   * The diagnostics attached to the previous apply_ops/apply_quickfix result
   * — the LINTS-delta baseline (v5 §2). Undefined until the first apply of
   * the session, which therefore reports the full list instead of a delta.
   */
  lastDiagnostics?: Diagnostic[];
}

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function expandRect(rect: SketchRect, margin: number): SketchRect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

function renderCropError(crop: SketchRect): string | null {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)) {
    return "Render crop x, y, width, and height must all be finite numbers.";
  }
  if (!(crop.width > 0) || !(crop.height > 0)) {
    return "Render crop must have positive width and height.";
  }
  if (crop.width > MAX_RENDER_CROP_DIMENSION || crop.height > MAX_RENDER_CROP_DIMENSION) {
    return `Render crop width and height must not exceed ${MAX_RENDER_CROP_DIMENSION}px.`;
  }
  if (Math.abs(crop.x) > MAX_RENDER_WORLD_COORDINATE
    || Math.abs(crop.y) > MAX_RENDER_WORLD_COORDINATE) {
    return "Render crop x and y are outside the supported world range.";
  }
  if (!Number.isFinite(crop.x + crop.width) || !Number.isFinite(crop.y + crop.height)) {
    return "Render crop bounds must remain finite.";
  }
  return null;
}

function rectsOverlap(a: SketchRect, b: SketchRect): boolean {
  if (![a.x, a.y, a.width, a.height].every(Number.isFinite)) return false;
  if (!(a.width > 0) || !(a.height > 0)) return false;
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function intersectionArea(a: SketchRect, b: SketchRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

function finiteGeometry(value: unknown): value is CanvasGeometry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const geometry = value as Record<string, unknown>;
  return [geometry.x, geometry.y, geometry.width, geometry.height].every(
    (entry) => typeof entry === "number" && Number.isFinite(entry),
  );
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function gateRelevant(
  restrictToIds: ReadonlySet<string> | undefined,
  ...ids: string[]
): boolean {
  return !restrictToIds || ids.some((id) => restrictToIds.has(id));
}

export interface WreckedDocumentOptions {
  restrictToIds?: ReadonlySet<string>;
  mode?: "error" | "warning";
}

/**
 * Sketch-free document gate. Unlike wreckedLayoutError, this works for
 * drafts authored through id-addressed operations and selection solves.
 */
export function wreckedDocumentError(
  draft: InteractiveCanvasDocument,
  options: WreckedDocumentOptions = {},
): string | null {
  const { restrictToIds } = options;
  const problems: string[] = [];
  const sections = draft.objects.filter((object) => object.type === "section");

  for (const section of sections) {
    const { geometry } = section;
    if (gateRelevant(restrictToIds, section.id)
      && (!finiteGeometry(geometry)
        || geometry.width < MINIMUM_SECTION_DIMENSIONS.width
        || geometry.height < MINIMUM_SECTION_DIMENSIONS.height)) {
      problems.push(
        `section "${section.id}" is ${round2(geometry.width)}×${round2(geometry.height)}, `
        + `below its minimum ${MINIMUM_SECTION_DIMENSIONS.width}×${MINIMUM_SECTION_DIMENSIONS.height}.`,
      );
    }

    const children = draft.objects.filter((object) => object.parentId === section.id);
    if (children.length === 0
      || !gateRelevant(restrictToIds, section.id, ...children.map((child) => child.id))) {
      continue;
    }
    const childLeft = Math.min(...children.map((child) => child.geometry.x));
    const childTop = Math.min(...children.map((child) => child.geometry.y));
    const childRight = Math.max(...children.map(
      (child) => child.geometry.x + child.geometry.width,
    ));
    const childBottom = Math.max(...children.map(
      (child) => child.geometry.y + child.geometry.height,
    ));
    if (!finiteGeometry(geometry)
      || geometry.x > childLeft
      || geometry.y > childTop
      || geometry.x + geometry.width < childRight
      || geometry.y + geometry.height < childBottom) {
      problems.push(
        `section "${section.id}" does not contain its parentId children `
        + `(child bounds ${round2(childRight - childLeft)}×${round2(childBottom - childTop)}).`,
      );
    }
  }

  for (const object of draft.objects) {
    if (object.type === "section" || object.type === "annotation-marker") continue;
    if (!gateRelevant(restrictToIds, object.id)) continue;
    const { geometry } = object;
    if (!finiteGeometry(geometry)
      || geometry.width < DOCUMENT_ITEM_MINIMUM.width
      || geometry.height < DOCUMENT_ITEM_MINIMUM.height) {
      problems.push(
        `object "${object.id}" is ${round2(geometry.width)}×${round2(geometry.height)}, `
        + `below its minimum ${DOCUMENT_ITEM_MINIMUM.width}×${DOCUMENT_ITEM_MINIMUM.height}.`,
      );
    }
  }

  const overlapCandidates = draft.objects.filter((object) => (
    object.type !== "section"
    && object.type !== "sticky"
    && object.type !== "annotation-marker"
  ));
  for (let index = 0; index < overlapCandidates.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < overlapCandidates.length; otherIndex += 1) {
      const a = overlapCandidates[index]!;
      const b = overlapCandidates[otherIndex]!;
      if ((a.parentId ?? null) !== (b.parentId ?? null)) continue;
      if (!gateRelevant(restrictToIds, a.id, b.id)) continue;
      const smallerArea = Math.min(
        a.geometry.width * a.geometry.height,
        b.geometry.width * b.geometry.height,
      );
      if (!(smallerArea > 0)) continue;
      const overlapPct = intersectionArea(a.geometry, b.geometry) / smallerArea * 100;
      if (overlapPct > 25) {
        problems.push(
          `siblings "${a.id}" and "${b.id}" overlap across ${round2(overlapPct)}% `
          + "of the smaller object (maximum 25%).",
        );
      }
    }
  }

  const lockedFrames = sections.filter((section) => section.locked === "background");
  const pageFrame = lockedFrames.find((section) => section.parentId == null) ?? lockedFrames[0];
  if (pageFrame) {
    const frame = pageFrame.geometry;
    for (const object of draft.objects) {
      if (object.id === pageFrame.id
        || !gateRelevant(restrictToIds, pageFrame.id, object.id)) continue;
      const overflow = Math.max(
        frame.x - object.geometry.x,
        frame.y - object.geometry.y,
        object.geometry.x + object.geometry.width - (frame.x + frame.width),
        object.geometry.y + object.geometry.height - (frame.y + frame.height),
      );
      if (overflow > 16) {
        problems.push(
          `object "${object.id}" extends ${round2(overflow)}px past locked page frame `
          + `"${pageFrame.id}" (maximum 16px).`,
        );
      }
    }
  }

  if (problems.length === 0) return null;
  return [
    options.mode === "warning" ? "Document gate warnings:" : "Wrecked document rejected:",
    ...problems.map((problem) => `- ${problem}`),
  ].join("\n");
}

/**
 * resvg 2.6 aborts when a filtered or nested-SVG object is wholly outside
 * the viewport and its clip intersection is empty. Static crop rendering
 * deliberately retains the whole document, so select visible content here
 * before the SVG ever reaches the native rasterizer.
 */
function documentWithinCrop(
  document: InteractiveCanvasDocument,
  crop: SketchRect,
): InteractiveCanvasDocument {
  const objects = document.objects.filter((object) => rectsOverlap(object.geometry, crop));
  const objectIds = new Set(objects.map((object) => object.id));
  const connections = document.connections.filter((connection) =>
    objectIds.has(connection.from.objectId) && objectIds.has(connection.to.objectId));
  return { ...document, objects, connections };
}

/** Strip the parser's duplicate-name uniquification suffix ("name#2" → "name"). */
function stripUniquification(id: string): string {
  const match = /^(.*)#([1-9]\d*)$/.exec(id);
  return match && Number(match[2]) >= 2 ? match[1]! : id;
}

function collectSketchObjectIds(node: SketchNode, into: string[] = []): string[] {
  if (node.kind === "split") {
    node.children.forEach((child) => collectSketchObjectIds(child, into));
  } else if (node.kind === "section") {
    into.push(node.id);
    collectSketchObjectIds(node.child, into);
  } else {
    node.items.forEach((item) => into.push(item.id));
  }
  return into;
}

function describePatchOperation(operation: CanvasAgentPatchOperation): string {
  switch (operation.type) {
    case "addObject": return `addObject ${operation.object.id}`;
    case "updateObject": return `updateObject ${operation.objectId} (${Object.keys(operation.patch).join(", ")})`;
    case "removeObject": return `removeObject ${operation.objectId}`;
    case "addConnection": return `addConnection ${operation.connection.id}`;
    case "updateConnection": return `updateConnection ${operation.connectionId} (${Object.keys(operation.patch).join(", ")})`;
    case "removeConnection": return `removeConnection ${operation.connectionId}`;
    case "addAnnotation": return `addAnnotation ${operation.annotation.id}`;
    case "removeAnnotation": return `removeAnnotation ${operation.annotationId}`;
    case "fitSectionToChildren": return `fitSectionToChildren ${operation.sectionId}`;
  }
}

// ---------------------------------------------------------------------------
// Per-turn perception: the DELTA block (v5 §2). Derived from before/after
// documents — never from the op payloads — so membership reconciliation's
// parentId moves and cascade deletes show up honestly.
// ---------------------------------------------------------------------------

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
  /** Rendered when the value is absent (the canvas default, e.g. gray). */
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

interface DocumentDelta {
  lines: string[];
  /** True iff anything add/remove/move/resize/re-route happened — channel-only batches stay false. */
  geometric: boolean;
  /** World rects of the touched geometry (old + new positions) for the close-up crop. */
  regions: SketchRect[];
}

/** One line per touched object/connection: `id  old → new` (v5 §2). */
function documentDelta(
  before: InteractiveCanvasDocument,
  after: InteractiveCanvasDocument,
): DocumentDelta {
  const lines: string[] = [];
  const regions: SketchRect[] = [];
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

  const endpointRect = (id: string): SketchRect | undefined =>
    after.objects.find((object) => object.id === id)?.geometry
    ?? beforeById.get(id)?.geometry;
  const pushEndpointRegions = (...ids: string[]): void => {
    for (const id of new Set(ids)) {
      const rect = endpointRect(id);
      if (rect) regions.push(rect);
    }
  };

  const beforeConnectionById = new Map(before.connections.map((connection) => [connection.id, connection]));
  const afterConnectionIds = new Set(after.connections.map((connection) => connection.id));

  for (const connection of after.connections) {
    const previous = beforeConnectionById.get(connection.id);
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

function unionRects(rects: readonly SketchRect[]): SketchRect {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

function intersectRects(a: SketchRect, b: SketchRect): SketchRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/**
 * Stable identity for LINTS-delta matching across applies: diagnostic ids
 * (E1/W2…) renumber every run, so resolved-vs-new is matched by
 * (rule, at-set, message) instead (v5 §2).
 */
function diagnosticFingerprint(diagnostic: Diagnostic): string {
  return [diagnostic.rule, [...diagnostic.at].sort().join(","), diagnostic.message].join("\x00");
}

/**
 * Reject geometry that is too small to remain readable or breaks the
 * section hierarchy. This is deliberately a hard harness gate rather than a
 * lint finding: a wrecked draft must never become a committable proposal.
 */
function wreckedLayoutError(
  sketch: Sketch,
  draft: InteractiveCanvasDocument,
): string | null {
  const byId = new Map(draft.objects.map((object) => [object.id, object]));
  const problems: string[] = [];

  const visit = (node: SketchNode): string[] => {
    if (node.kind === "split") {
      return node.children.flatMap(visit);
    }

    if (node.kind === "section") {
      const descendantIds = visit(node.child);
      const section = byId.get(node.id);
      if (!section) {
        problems.push(`section "${node.id}" has no solved object.`);
        return [node.id, ...descendantIds];
      }

      const geometry = section.geometry;
      if (!Number.isFinite(geometry.width) || !Number.isFinite(geometry.height)
        || geometry.width < MINIMUM_SECTION_DIMENSIONS.width
        || geometry.height < MINIMUM_SECTION_DIMENSIONS.height) {
        problems.push(
          `section "${node.id}" solved to ${round2(geometry.width)}×${round2(geometry.height)}, `
          + `below its legibility minimum ${MINIMUM_SECTION_DIMENSIONS.width}×${MINIMUM_SECTION_DIMENSIONS.height}.`,
        );
      }

      const descendants = descendantIds
        .map((id) => byId.get(id))
        .filter((object): object is InteractiveCanvasObject => object !== undefined);
      if (descendants.length > 0) {
        const childLeft = Math.min(...descendants.map((object) => object.geometry.x));
        const childTop = Math.min(...descendants.map((object) => object.geometry.y));
        const childRight = Math.max(...descendants.map(
          (object) => object.geometry.x + object.geometry.width,
        ));
        const childBottom = Math.max(...descendants.map(
          (object) => object.geometry.y + object.geometry.height,
        ));
        if (geometry.x > childLeft
          || geometry.y > childTop
          || geometry.x + geometry.width < childRight
          || geometry.y + geometry.height < childBottom) {
          problems.push(
            `section "${node.id}" (${round2(geometry.width)}×${round2(geometry.height)}) `
            + `does not contain its children (bounds ${round2(childRight - childLeft)}×${round2(childBottom - childTop)}).`,
          );
        }
      }
      return [node.id, ...descendantIds];
    }

    const items = node.items;
    for (const item of items) {
      const object = byId.get(item.id);
      if (!object) {
        problems.push(`item "${item.id}" has no solved object.`);
        continue;
      }
      const minimum = minimumDimensionsForItem(item);
      const minimumWidth = Math.round(minimum.width);
      const minimumHeight = Math.round(minimum.height);
      const { width, height } = object.geometry;
      if (!Number.isFinite(width) || !Number.isFinite(height)
        || width < minimumWidth || height < minimumHeight) {
        problems.push(
          `item "${item.id}" solved to ${round2(width)}×${round2(height)}, `
          + `below its ${item.size} minimum ${minimumWidth}×${minimumHeight}.`,
        );
      }
    }
    return items.map((item) => item.id);
  };

  visit(sketch.root);
  if (problems.length === 0) return null;
  return [
    "Wrecked layout rejected:",
    ...problems.map((problem) => `- ${problem}`),
    "Grow the containing section/frame or revise the structure; size-class content cannot be scaled down.",
  ].join("\n");
}

export class LayoutSessionStore {
  readonly kernel: KernelInstance<LayoutToolRuntime>;

  /** Optional sink for render_draft PNGs (the CLI writes them to disk). */
  onRender: ((sessionId: string, png: Buffer, index: number) => void) | null = null;
  private renderCount = 0;
  /** undefined = not attempted, null = missing/unrenderable, Buffer = cached. */
  private exemplarPng: Buffer | null | undefined;

  private readonly db: KernelDatabase;
  private readonly sessions = new Map<string, LayoutSession>();
  private readonly byContainer = new Map<string, LayoutSession>();

  constructor(db: KernelDatabase) {
    this.db = db;
    this.kernel = createLayoutKernel(db, this.createToolRuntime());
  }

  // -------------------------------------------------------------------------
  // Session lifecycle (HTTP surface)
  // -------------------------------------------------------------------------

  get(sessionId: string): LayoutSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new HttpError(404, `Unknown layout session: ${sessionId}`);
    return session;
  }

  list(): LayoutSession[] {
    return [...this.sessions.values()];
  }

  stateOf(session: LayoutSession): AgentSessionState {
    return {
      sessionId: session.id,
      canvasId: session.canvasId,
      status: session.status,
      instruction: session.instruction,
      scopeObjectIds: [...session.scopeIds],
      frame: session.baselineFit.frame,
      baselineHash: session.baselineHash,
      proposalCount: session.proposalCount,
      proposal: session.proposal,
      error: session.error,
    };
  }

  async createSession(request: CreateAgentSessionRequest): Promise<LayoutSession> {
    const canvasId = request.canvasId;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(canvasId)) {
      throw new HttpError(400, `Invalid canvas id: ${JSON.stringify(canvasId)}`);
    }
    const canvasPath = join(CANVASES_DIR, `${canvasId}.canvas.json`);
    if (!existsSync(canvasPath)) {
      throw new HttpError(404, `Canvas not found: ${canvasId}`);
    }
    if (!Array.isArray(request.scopeObjectIds) || request.scopeObjectIds.length === 0) {
      throw new HttpError(400, "scopeObjectIds must name at least one object.");
    }
    if (typeof request.instruction !== "string" || request.instruction.trim() === "") {
      throw new HttpError(400, "instruction must be a non-empty string.");
    }

    const raw = readFileSync(canvasPath);
    const baseline = JSON.parse(raw.toString("utf8")) as InteractiveCanvasDocument;
    const baselineHash = sha256(raw);

    let fit: FitScopeResult;
    try {
      fit = fitScope(baseline, request.scopeObjectIds);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }

    const sessionId = randomUUID();
    const sessionDir = join(SESSION_DIR_ROOT, sessionId);
    mkdirSync(sessionDir, { recursive: true });

    const container = await this.kernel.container({
      kind: "layout-session",
      key: [canvasId, sessionId],
      label: `Layout: ${request.instruction.slice(0, 72)}`,
      workingDir: REPO_ROOT,
      metadata: {
        app: "canvas-agent",
        canvasId,
        sessionId,
        instruction: request.instruction,
        scopeObjectIds: fit.scopeObjectIds,
      },
    });

    const session: LayoutSession = {
      id: sessionId,
      canvasId,
      canvasPath,
      baseline,
      baselineHash,
      requestedScopeIds: [...request.scopeObjectIds],
      baselineFit: fit,
      currentFit: fit,
      scopeIds: new Set(fit.scopeObjectIds),
      draft: baseline,
      lastSketch: null,
      proposalCount: 0,
      proposal: null,
      status: "running",
      error: null,
      instruction: request.instruction,
      annotations: request.annotations ?? [],
      viewport: request.viewport,
      containerId: container.id,
      sessionDir,
      events: [],
      subscribers: new Set(),
      runPromise: null,
      exemplarShown: false,
    };
    this.sessions.set(sessionId, session);
    this.byContainer.set(container.id, session);

    await updateContainerStatus(this.db, container.id, "active", {
      startedAt: new Date().toISOString(),
    });

    this.emit(session, {
      type: "fitted",
      sessionId,
      program: fit.program,
      frame: fit.frame,
      scopeObjectIds: fit.scopeObjectIds,
      boundaryArrowCount: fit.boundary.connections.length,
    });

    session.runPromise = this.runAgent(session, request.instruction, false);
    return session;
  }

  /** Refine: a follow-up instruction into the same kernel agent session. */
  message(sessionId: string, instruction: string, snapshot?: {
    annotations?: AgentSessionAnnotation[];
    viewport?: AgentSessionViewport;
  }): LayoutSession {
    const session = this.get(sessionId);
    if (session.status === "accepted" || session.status === "rejected") {
      throw new HttpError(409, `Session is already ${session.status}.`);
    }
    if (typeof instruction !== "string" || instruction.trim() === "") {
      throw new HttpError(400, "instruction must be a non-empty string.");
    }
    session.instruction = instruction;
    if (snapshot?.annotations) session.annotations = snapshot.annotations;
    if (snapshot?.viewport) session.viewport = snapshot.viewport;
    session.status = "running";
    session.error = null;
    this.emit(session, { type: "status", sessionId, status: "running" });
    session.runPromise = this.runAgent(session, instruction, true);
    return session;
  }

  /** Accept: rebase-check against the live file, then hand over the patch. */
  accept(sessionId: string): AcceptAgentSessionResponse {
    const session = this.get(sessionId);
    switch (session.status) {
      case "accepted":
        throw new HttpError(409, "This proposal was already applied.");
      case "rejected":
        throw new HttpError(409, "This session was discarded.");
      case "running":
        throw new HttpError(409, "The agent is still working.");
      case "error":
        throw new HttpError(409, "The session failed; nothing to apply.");
      case "proposal-ready":
      case "abandoned":
        break;
    }
    const proposal = session.proposal;
    if (!proposal) {
      throw new HttpError(409, "No committed proposal to accept yet.");
    }

    const liveRaw = readFileSync(session.canvasPath);
    const liveHash = sha256(liveRaw);
    if (liveHash === session.baselineHash) {
      session.status = "accepted";
      this.emit(session, { type: "status", sessionId, status: "accepted" });
      return { operations: proposal.operations as CanvasAgentPatchOperation[], summary: proposal.summary, rebased: false };
    }

    // Rebase = refit (§2.5): the live document changed under the session.
    const live = JSON.parse(liveRaw.toString("utf8")) as InteractiveCanvasDocument;
    const liveById = new Map(live.objects.map((object) => [object.id, object]));
    const moved: string[] = [];
    const deleted: string[] = [];
    for (const id of session.baselineFit.scopeObjectIds) {
      const baselineObject = session.baseline.objects.find((object) => object.id === id)!;
      const liveObject = liveById.get(id);
      if (!liveObject) {
        deleted.push(id);
        continue;
      }
      const a = baselineObject.geometry;
      const b = liveObject.geometry;
      if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) {
        moved.push(id);
      }
    }
    if (deleted.length > 0 || moved.length > 0) {
      const parts: string[] = [];
      if (deleted.length > 0) parts.push(`deleted (${deleted.join(", ")})`);
      if (moved.length > 0) parts.push(`moved or resized (${moved.join(", ")})`);
      throw new HttpError(
        409,
        `The board changed while the agent was working: objects in the agent's scope were ${parts.join(" and ")}. `
        + "The proposal can't be applied safely — reject it and run the agent again on the current board.",
      );
    }

    if (session.lastSketch === null) {
      session.status = "accepted";
      this.emit(session, { type: "status", sessionId, status: "accepted" });
      return {
        operations: proposal.operations as CanvasAgentPatchOperation[],
        summary: proposal.summary,
        rebased: true,
      };
    }

    // Scope untouched: refit the scope from the live document and re-solve the
    // accepted program against it, so ops land on live reality.
    const rebasedDraft = this.buildDraft(session, live, session.lastSketch, session.baselineFit.frame);
    const diff = diffPrograms(live, rebasedDraft, {
      legend: session.baselineFit.legend,
      frame: session.baselineFit.frame,
      scopeObjectIds: this.lintScopeIds(session, rebasedDraft),
    });
    session.status = "accepted";
    this.emit(session, { type: "status", sessionId, status: "accepted" });
    return { operations: diff.operations, summary: proposal.summary, rebased: true };
  }

  reject(sessionId: string): void {
    const session = this.get(sessionId);
    session.status = "rejected";
    this.emit(session, { type: "status", sessionId, status: "rejected" });
  }

  /** The ghost-preview feed: current draft, scope frame + context ring. */
  draftSvg(sessionId: string): { svg: string; width: number; height: number } {
    const session = this.get(sessionId);
    const crop = expandRect(this.solvedFrame(session), CONTEXT_RING);
    const cropError = renderCropError(crop);
    if (cropError) throw new Error(cropError);
    const rendered = renderDocumentToSvg(documentWithinCrop(session.draft, crop), {
      cropRect: crop,
      width: GHOST_PREVIEW_WIDTH,
    });
    return rendered;
  }

  subscribe(sessionId: string, listener: (event: AgentSessionEvent) => void): () => void {
    const session = this.get(sessionId);
    for (const event of session.events) listener(event);
    session.subscribers.add(listener);
    return () => session.subscribers.delete(listener);
  }

  // -------------------------------------------------------------------------
  // Agent run plumbing
  // -------------------------------------------------------------------------

  private async runAgent(session: LayoutSession, instruction: string, refine: boolean): Promise<void> {
    try {
      await this.kernel.spawnAgent(AGENT_NAME, instruction, null, {
        containerId: session.containerId,
        trigger: "operator",
        sessionDir: session.sessionDir,
        workingDir: REPO_ROOT,
        displayLabel: "Layout Editor",
        reuseExistingSession: refine,
        sessionData: {
          editorState: this.editorSnapshot(session),
          boardState: this.boardStateSnapshot(session),
        },
      });
      if (session.status === "running") {
        // The model ended its run without commit/abandon — surface it.
        session.status = "error";
        session.error = "The agent ended its run without committing or abandoning.";
        this.emit(session, { type: "error", sessionId: session.id, message: session.error });
        this.markContainer(session, "error");
      } else if (session.status === "proposal-ready" || session.status === "abandoned") {
        this.markContainer(session, "done");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.status = "error";
      session.error = message;
      this.emit(session, { type: "error", sessionId: session.id, message });
      this.markContainer(session, "error");
    }
  }

  private markContainer(session: LayoutSession, status: string): void {
    void updateContainerStatus(this.db, session.containerId, status, {
      endedAt: new Date().toISOString(),
    }).catch((error) => {
      console.error("canvas-agent container status update failed:", error);
    });
  }

  /**
   * The spawn-time <board_state> payload (v5 §2): full digest + full lint
   * report over the current draft, as one string. Recomputed per run so
   * refinements get a fresh snapshot. Phase B's board-state context loader
   * renders this string into the kernel <board_state> block.
   */
  private boardStateSnapshot(session: LayoutSession): string {
    const model = buildBoardModel(session.draft);
    return `${formatBoardDigest(model)}\n\n${formatDiagnostics(runDiagnostics(model))}`;
  }

  private editorSnapshot(session: LayoutSession): EditorStateSnapshot {
    const byId = new Map(session.baseline.objects.map((object) => [object.id, object]));
    return {
      canvasId: session.canvasId,
      instruction: session.instruction,
      baselineHash: session.baselineHash,
      frame: session.baselineFit.frame,
      selection: session.baselineFit.scopeObjectIds.map((id) => {
        const object = byId.get(id);
        return { id, type: object?.type ?? "unknown", text: object?.text ?? "" };
      }),
      boundaryArrowCount: session.baselineFit.boundary.connections.length,
      viewport: session.viewport,
      annotations: session.annotations,
    };
  }

  private emit(session: LayoutSession, event: AgentSessionEvent): void {
    session.events.push(event);
    for (const listener of session.subscribers) {
      try {
        listener(event);
      } catch {
        // A dead subscriber never takes the session down.
      }
    }
  }

  // -------------------------------------------------------------------------
  // The layout tools (bound to tools.ts through the kernel toolRuntime slot)
  // -------------------------------------------------------------------------

  private createToolRuntime(): LayoutToolRuntime {
    return {
      board: () => this.toolBoard(),
      fitScope: () => this.toolFitScope(),
      applyOps: (ops) => this.toolApplyOps(ops),
      applyQuickfix: (diagnosticId) => this.toolApplyQuickfix(diagnosticId),
      solveLayout: (objectIds, program) => this.toolSolveLayout(objectIds, program),
      proposeProgram: (program) => this.toolProposeProgram(program),
      renderDraft: (request) => this.toolRenderDraft(request),
      inspect: (objectIds) => this.toolInspect(objectIds),
      commit: (summary) => this.toolCommit(summary),
      abandon: (reason) => this.toolAbandon(reason),
    };
  }

  private currentSession(): LayoutSession {
    const ctx = getRunContext();
    const session = this.byContainer.get(ctx.containerId);
    if (!session) {
      throw new Error(`No layout session for container ${ctx.containerId}.`);
    }
    return session;
  }

  private houseStyleExemplar(): Buffer | null {
    if (this.exemplarPng !== undefined) return this.exemplarPng;
    const path = join(CANVASES_DIR, `${EXEMPLAR_CANVAS_ID}.canvas.json`);
    if (!existsSync(path)) {
      this.exemplarPng = null;
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
      this.exemplarPng = rasterizeSvgToPng(rendered.svg).png;
    } catch {
      this.exemplarPng = null;
    }
    return this.exemplarPng;
  }

  /**
   * The board digest + diagnostics for the current draft — the model's
   * structural view (v4 design §3a). The house-style exemplar PNG rides on
   * the first call of a session.
   */
  private toolBoard(): LayoutToolRenderResult {
    const session = this.currentSession();
    const attachExemplar = !session.exemplarShown;
    session.exemplarShown = true;
    const report = this.boardReport(session);
    const sections = [report.digest, "", report.diagnosticsText];
    const png = attachExemplar ? this.houseStyleExemplar() : null;
    if (png) {
      sections.push(
        "",
        "Reference board (house style): note section tinting, labeled edges, dashed vs solid flows, margin annotations. Aim for this level of finish.",
      );
    }
    const errors = report.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
    return {
      ...(png ? { png } : {}),
      text: sections.join("\n"),
      details: { errors, warnings: report.diagnostics.length - errors },
    };
  }

  /** Digest + diagnostics over the current draft (one build per tool result). */
  private boardReport(session: LayoutSession): {
    digest: string;
    diagnostics: Diagnostic[];
    diagnosticsText: string;
  } {
    const model = buildBoardModel(session.draft);
    const diagnostics = runDiagnostics(model);
    return {
      digest: formatBoardDigest(model),
      diagnostics,
      diagnosticsText: formatDiagnostics(diagnostics),
    };
  }

  private toolFitScope(): LayoutToolRenderResult {
    const session = this.currentSession();
    const presentScopeIds = [...session.scopeIds].filter((id) =>
      session.draft.objects.some((object) => object.id === id));
    // Draft-created objects re-enter the fit so refined programs keep them.
    const createdIds = session.draft.objects
      .filter((object) => !session.baseline.objects.some((b) => b.id === object.id))
      .map((object) => object.id);
    const ids = [...presentScopeIds, ...createdIds];
    if (ids.length === 0) {
      return { isError: true, text: "Every scoped object has been deleted from the draft — nothing to fit." };
    }
    const fit = fitScope(session.draft, ids);
    session.currentFit = fit;

    const legendLines = fit.legend.items.map((entry) =>
      `  ${entry.ordinal}. ${entry.type} ${JSON.stringify(entry.text)} (id=${entry.id}, ${Math.round(entry.width)}×${Math.round(entry.height)})`);
    const outsideLines = fit.legend.outside.map((ref) =>
      `  ${JSON.stringify(ref.id)} — ${ref.type} ${JSON.stringify(ref.text)}, ${ref.side === "inside" ? "overlapping the frame" : `${ref.side} of the frame`}`);
    const arrowLines = fit.boundary.connections.map((connection) =>
      `  ${connection.direction === "outbound"
        ? `${connection.insideId} → ${JSON.stringify(connection.outsideId)}`
        : `${JSON.stringify(connection.outsideId)} → ${connection.insideId}`}`);
    const neighborLines = fit.boundary.neighbors.map((neighbor) =>
      `  ${neighbor.side}: ${neighbor.type} ${JSON.stringify(neighbor.text)} (${neighbor.id}), ${Math.round(neighbor.distance)}px from the frame edge`);

    const sections = [
      "Scoped layout program (rewrite the WHOLE program in propose_program; a number you omit is a DELETION):",
      "```",
      fit.program,
      "```",
      "Legend (declaration order = program numbers; text= tokens are object ids):",
      ...legendLines,
      outsideLines.length > 0
        ? ["Outside references (quoted ids — pinned; you may route arrows to them, never move them):", ...outsideLines].join("\n")
        : "Outside references: none.",
      `Frame (the solve area): x=${fit.frame.x} y=${fit.frame.y} ${Math.round(fit.frame.width)}×${Math.round(fit.frame.height)}`,
      arrowLines.length > 0
        ? ["Arrows crossing the scope edge:", ...arrowLines].join("\n")
        : "Arrows crossing the scope edge: none.",
      neighborLines.length > 0
        ? ["Nearest outside neighbors:", ...neighborLines].join("\n")
        : "Nearest outside neighbors: none.",
      this.connectionInventoryText(session, new Set(ids)),
    ];
    return {
      text: sections.join("\n"),
      details: { frame: fit.frame, scopeObjectIds: fit.scopeObjectIds },
    };
  }

  /**
   * Connection inventory for tool results: every draft connection with at
   * least one endpoint among `ids`, with its editable channels. This is how
   * the agent learns connection ids for updateConnection — without it, edge
   * restyles get re-added as duplicates.
   */
  private connectionInventoryText(session: LayoutSession, ids: Set<string>): string {
    const lines = session.draft.connections
      .filter((connection) => ids.has(connection.from.objectId) || ids.has(connection.to.objectId))
      .map((connection) =>
        `  ${connection.id}: ${connection.from.objectId} → ${connection.to.objectId}`
        + ` label=${connection.label ? JSON.stringify(connection.label) : "—"}`
        + ` style=${connection.style ?? "solid"} color=${connection.color ?? "gray"}`);
    return lines.length > 0
      ? ["Connections (use updateConnection with these ids to relabel/restyle; never add a duplicate edge):", ...lines].join("\n")
      : "Connections: none in scope.";
  }

  /** Build a full draft document from a proposed sketch (pure of session state). */
  private buildDraft(
    session: LayoutSession,
    baseDocument: InteractiveCanvasDocument,
    sketch: Sketch,
    frame: SketchRect,
  ): InteractiveCanvasDocument {
    const expanded = expandSketch(sketch, {
      mode: "natural",
      width: frame.width,
      height: frame.height,
    });
    const baseById = new Map(baseDocument.objects.map((object) => [object.id, object]));
    const draftById = new Map(session.draft.objects.map((object) => [object.id, object]));
    const expandedById = new Map(expanded.objects.map((object) => [object.id, object]));
    const scopeIds = session.scopeIds;

    const translate = (rect: SketchRect): SketchRect => ({
      x: round2(rect.x + frame.x),
      y: round2(rect.y + frame.y),
      width: round2(rect.width),
      height: round2(rect.height),
    });

    // Semantic validation beyond the parser.
    const problems: string[] = [];
    for (const object of expanded.objects) {
      if (baseById.has(object.id) && !scopeIds.has(object.id)) {
        problems.push(
          `"${object.id}" is outside the scope — you may reference it in arrows (quoted) but never place or move it.`,
        );
      }
    }
    const knownIds = new Set<string>([
      ...expanded.objects.map((object) => object.id),
      ...baseDocument.objects.map((object) => object.id),
    ]);
    for (const edge of sketch.edges) {
      for (const endpoint of [edge.from, edge.to]) {
        if (!knownIds.has(endpoint)) {
          problems.push(`arrow endpoint "${endpoint}" matches no placed item and no existing object id.`);
        }
      }
    }
    if (problems.length > 0) {
      throw new Error(`Program rejected:\n- ${problems.join("\n- ")}`);
    }

    // Objects: scoped objects follow the proposal (present = solved geometry,
    // absent = deleted); everything else rides through untouched; new numbers
    // become new objects.
    const objects: InteractiveCanvasObject[] = [];
    for (const object of baseDocument.objects) {
      if (!scopeIds.has(object.id)) {
        objects.push(object);
        continue;
      }
      const solved = expandedById.get(object.id);
      if (!solved) continue; // Omission = deletion (D1).
      const propertySource = draftById.get(object.id) ?? object;
      objects.push({ ...propertySource, geometry: translate(solved.geometry) });
    }
    const removedIds = new Set(
      baseDocument.objects
        .filter((object) => scopeIds.has(object.id) && !expandedById.has(object.id))
        .map((object) => object.id),
    );
    for (const object of expanded.objects) {
      if (baseById.has(object.id)) continue;
      const propertySource = draftById.get(object.id);
      if (propertySource) {
        objects.push({ ...propertySource, geometry: translate(object.geometry) });
        continue;
      }
      objects.push({
        id: object.id,
        type: object.type,
        text: object.label ?? stripUniquification(object.id),
        geometry: translate(object.geometry),
      });
    }

    // No edges means no connection instructions: preserve every existing
    // connection whose endpoints survived, including its editable channels,
    // and mint nothing. baseDocument is deliberate here because it is the live
    // document during rebase; session.draft supplies any in-session channel
    // edits for matching connections.
    if (sketch.edges.length === 0) {
      const presentIds = new Set(objects.map((object) => object.id));
      const draftConnectionById = new Map(
        session.draft.connections.map((connection) => [connection.id, connection]),
      );
      const connections = baseDocument.connections
        .filter((connection) =>
          presentIds.has(connection.from.objectId) && presentIds.has(connection.to.objectId))
        .map((connection) => {
          const channelSource = draftConnectionById.get(connection.id) ?? connection;
          return {
            ...connection,
            label: channelSource.label,
            style: channelSource.style,
            color: channelSource.color,
            arrow: channelSource.arrow,
            role: channelSource.role,
          };
        });
      return { ...baseDocument, objects, connections };
    }

    // Connections: a non-empty program edge list is authoritative for
    // everything the program could see (>= one endpoint in scope); untouched
    // elsewhere.
    const edgeKeys = new Set(sketch.edges.map((edge) => `${edge.from}\x00${edge.to}`));
    const presentIds = new Set(objects.map((object) => object.id));
    const connections: InteractiveCanvasConnection[] = [];
    const draftConnectionById = new Map(
      session.draft.connections.map((connection) => [connection.id, connection]),
    );
    const coveredKeys = new Set<string>();
    for (const connection of baseDocument.connections) {
      const fromId = connection.from.objectId;
      const toId = connection.to.objectId;
      if (removedIds.has(fromId) || removedIds.has(toId)) continue;
      const inProgram = scopeIds.has(fromId) || scopeIds.has(toId);
      if (inProgram) {
        const key = `${fromId}\x00${toId}`;
        if (!edgeKeys.has(key)) continue; // dropped by the proposal
        coveredKeys.add(key);
      }
      const channelSource = draftConnectionById.get(connection.id) ?? connection;
      connections.push({
        ...connection,
        label: channelSource.label,
        style: channelSource.style,
        color: channelSource.color,
        arrow: channelSource.arrow,
        role: channelSource.role,
      });
    }
    let mintIndex = 0;
    for (const edge of sketch.edges) {
      const key = `${edge.from}\x00${edge.to}`;
      if (coveredKeys.has(key)) continue;
      if (baseDocument.connections.some((connection) =>
        connection.from.objectId === edge.from && connection.to.objectId === edge.to
        && !removedIds.has(edge.from) && !removedIds.has(edge.to))) {
        // Existing connection between untouched endpoints (both outside scope,
        // impossible per fit, or already pushed above) — skip duplicates.
        continue;
      }
      if (!presentIds.has(edge.from) || !presentIds.has(edge.to)) continue;
      mintIndex += 1;
      connections.push({
        id: `draft-connection-${mintIndex}`,
        from: { objectId: edge.from },
        to: { objectId: edge.to },
        style: "solid",
        arrow: "forward",
      });
    }

    return { ...baseDocument, objects, connections };
  }

  /**
   * The lint report for a diff, scope-filtered: the raw lintDraft over a full
   * document would flag every outside object as "overflowing" the scope
   * frame, so the report is built from the diff's already-filtered findings.
   */
  private lintReportOf(diff: DiffResult): string {
    const { spacing, offGrid, overflow, overlap, crossings } = diff.delta;
    return formatLintReport({
      spacing,
      offGrid,
      overflow,
      overlap,
      crossings,
      clean: spacing.length + offGrid.length + overflow.length + overlap.length + crossings.length === 0,
    });
  }

  /** Scope ids for lint filtering: baseline scope + draft-created objects. */
  private lintScopeIds(session: LayoutSession, draft: InteractiveCanvasDocument): string[] {
    const created = draft.objects
      .filter((object) => !session.baseline.objects.some((b) => b.id === object.id))
      .map((object) => object.id);
    return [...session.scopeIds, ...created];
  }

  /** The solved scope frame: last fit frame unioned over the draft's scoped objects. */
  private solvedFrame(session: LayoutSession): SketchRect {
    const ids = new Set(this.lintScopeIds(session, session.draft));
    const scoped = session.draft.objects.filter((object) => ids.has(object.id));
    if (scoped.length === 0) return session.currentFit.frame;
    const x = Math.min(...scoped.map((object) => object.geometry.x));
    const y = Math.min(...scoped.map((object) => object.geometry.y));
    const right = Math.max(...scoped.map((object) => object.geometry.x + object.geometry.width));
    const bottom = Math.max(...scoped.map((object) => object.geometry.y + object.geometry.height));
    return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
  }

  /**
   * Scope-filtered diagnostics (v4 §6): findings whose `at` list touches the
   * baseline scope or a draft-created object. Same restriction the old
   * document gate applied — the model is never blocked on pre-existing
   * problems it was not asked to touch.
   */
  private scopedDiagnostics(session: LayoutSession, diagnostics: Diagnostic[]): Diagnostic[] {
    const restrictToIds = new Set(this.lintScopeIds(session, session.draft));
    return diagnostics.filter((diagnostic) =>
      diagnostic.at.length === 0
      || diagnostic.at.some((id) => restrictToIds.has(id)));
  }

  private emitDrafted(session: LayoutSession, delta: string, lint: string): void {
    this.emit(session, { type: "proposal", sessionId: session.id, n: session.proposalCount });
    this.emit(session, {
      type: "delta",
      sessionId: session.id,
      n: session.proposalCount,
      delta,
      lint,
    });
  }

  private operationValidationErrors(
    session: LayoutSession,
    operations: readonly AgentPatchOperation[],
  ): string[] {
    const objectIds = new Set(session.draft.objects.map((object) => object.id));
    const connectionIds = new Set(session.draft.connections.map((connection) => connection.id));
    const annotationIds = new Set((session.draft.annotations ?? []).map((annotation) => annotation.id));
    const endpointIds = new Set(objectIds);
    for (const operation of operations) {
      const record = recordOf(operation);
      const object = recordOf(record?.object);
      if (record?.type === "addObject" && typeof object?.id === "string") {
        endpointIds.add(object.id);
      }
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

    operations.forEach((operation, index) => {
      const record = recordOf(operation);
      const kind = record?.type;
      if (typeof kind !== "string" || ![
        "addObject",
        "updateObject",
        "removeObject",
        "addConnection",
        "updateConnection",
        "removeConnection",
        "addAnnotation",
        "removeAnnotation",
        "fitSectionToChildren",
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
        }
        return;
      }
      if (kind === "removeConnection") {
        if (typeof payload.connectionId !== "string") {
          add(index, "removeConnection.connectionId must be a string.");
        } else if (!connectionIds.has(payload.connectionId)) {
          add(index, `removeConnection id "${payload.connectionId}" is not in the draft.`);
        }
        return;
      }
      if (kind === "addAnnotation") {
        const annotation = recordOf(payload.annotation);
        if (!annotation || typeof annotation.id !== "string") {
          add(index, "addAnnotation.annotation must include a string id.");
        }
        return;
      }
      if (kind === "removeAnnotation") {
        if (typeof payload.annotationId !== "string") {
          add(index, "removeAnnotation.annotationId must be a string.");
        } else if (!annotationIds.has(payload.annotationId)) {
          add(index, `removeAnnotation id "${payload.annotationId}" is not in the draft.`);
        }
        return;
      }
      if (typeof payload.sectionId !== "string") {
        add(index, "fitSectionToChildren.sectionId must be a string.");
      } else {
        const section = session.draft.objects.find((object) => object.id === payload.sectionId);
        if (!section) {
          add(index, `fitSectionToChildren id "${payload.sectionId}" is not in the draft.`);
        } else if (section.type !== "section") {
          add(index, `fitSectionToChildren id "${payload.sectionId}" is not a section.`);
        }
      }
    });
    return errors;
  }

  private applyOperationToDraft(
    document: InteractiveCanvasDocument,
    operation: AgentPatchOperation,
  ): { document: InteractiveCanvasDocument; summary: string; touched: string[] } {
    switch (operation.type) {
      case "addObject": {
        const object = operation.object as unknown as InteractiveCanvasObject;
        if (document.objects.some((candidate) => candidate.id === object.id)) {
          return { document, summary: `addObject ${object.id}: skipped (id already exists)`, touched: [object.id] };
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
              ? mergeObjectPatch(
                object,
                patch as Partial<Omit<InteractiveCanvasObject, "id">>,
              )
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
              + `represent the loop another way (e.g. a labeled badge or sticky on the state) or leave it out and say so`,
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
        const { waypoints: _ignored, ...patch } = operation.patch as Record<string, unknown>;
        const updated = { ...existing, ...patch } as InteractiveCanvasConnection;
        return {
          document: {
            ...document,
            connections: document.connections.map((connection) =>
              connection.id === operation.connectionId ? updated : connection),
          },
          summary: `updateConnection ${operation.connectionId}`,
          touched: [existing.from.objectId, existing.to.objectId, updated.from.objectId, updated.to.objectId],
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
      case "addAnnotation": {
        const requested = operation.annotation as unknown as InteractiveCanvasAnnotation;
        const ids = (document.annotations ?? []).map((annotation) => annotation.id);
        const id = ids.includes(requested.id) ? nextId("annotation", ids) : requested.id;
        return {
          document: {
            ...document,
            annotations: [...(document.annotations ?? []), { ...requested, id }],
          },
          summary: `addAnnotation ${id}`,
          touched: requested.target.kind === "object" ? [requested.target.objectId] : [],
        };
      }
      case "removeAnnotation":
        return {
          document: {
            ...document,
            annotations: document.annotations?.filter(
              (annotation) => annotation.id !== operation.annotationId,
            ),
          },
          summary: `removeAnnotation ${operation.annotationId}`,
          touched: [],
        };
      case "fitSectionToChildren":
        return {
          document: fitSectionToChildren(document, operation.sectionId, operation.padding),
          summary: `fitSectionToChildren ${operation.sectionId}`,
          touched: [operation.sectionId],
        };
    }
  }

  /**
   * Apply a validated operation batch to the draft: the one mutation path
   * shared by apply_ops and apply_quickfix (membership reconciliation, stale
   * sketch invalidation).
   */
  private applyOperationBatch(
    session: LayoutSession,
    operations: readonly AgentPatchOperation[],
  ): { summaryText: string } {
    let document = session.draft;
    const summaries: string[] = [];
    operations.forEach((operation, index) => {
      const applied = this.applyOperationToDraft(document, operation);
      document = applied.document;
      summaries.push(`${index + 1}. ${applied.summary}`);
    });
    const membershipMayHaveChanged = operations.some((operation) =>
      operation.type === "addObject"
      || operation.type === "fitSectionToChildren"
      || (operation.type === "updateObject"
        && recordOf(operation.patch)?.geometry !== undefined));
    session.draft = membershipMayHaveChanged
      ? reconcileSectionMembership(document)
      : document;
    session.lastSketch = null;
    return {
      summaryText: summaries.length > 0
        ? summaries.join("\n")
        : "No operations in the batch.",
    };
  }

  /**
   * The LINTS block for an apply result (v5 §2): the first apply of a
   * session reports the full list (no baseline yet); every later apply
   * reports `LINTS · +N −M`, listing new findings in full and resolved ones
   * as `− <old id> <rule>`. Matching is by fingerprint, never by id.
   */
  private lintsDeltaText(session: LayoutSession, diagnostics: Diagnostic[]): string {
    const previous = session.lastDiagnostics;
    session.lastDiagnostics = diagnostics;
    if (previous === undefined) return formatDiagnostics(diagnostics);

    const previousPrints = new Set(previous.map(diagnosticFingerprint));
    const currentPrints = new Set(diagnostics.map(diagnosticFingerprint));
    const added = diagnostics.filter(
      (diagnostic) => !previousPrints.has(diagnosticFingerprint(diagnostic)),
    );
    const resolved = previous.filter(
      (diagnostic) => !currentPrints.has(diagnosticFingerprint(diagnostic)),
    );
    const header = `LINTS · +${added.length} −${resolved.length}`;
    if (added.length === 0 && resolved.length === 0) {
      return diagnostics.length === 0
        ? "LINTS · clean"
        : `${header} (${diagnostics.length} open)`;
    }
    const lines = [header];
    for (const diagnostic of added) {
      const suggestion = diagnostic.suggestion ? ` (${diagnostic.suggestion})` : "";
      const quickfix = diagnostic.quickfixAvailable ? " [quickfix]" : "";
      lines.push(`  + ${diagnostic.id} ${diagnostic.rule}: ${diagnostic.message}${suggestion}${quickfix}`);
    }
    if (resolved.length > 0) {
      lines.push(
        `  ${resolved.map((diagnostic) => `− ${diagnostic.id} ${diagnostic.rule}`).join(", ")}  (resolved)`,
      );
    }
    return lines.join("\n");
  }

  /**
   * Auto close-up (v5 §2): a ~800px render of the touched region (union
   * bbox + 96px ring, clamped to the board). Returns undefined — the result
   * simply carries no image — when there is nothing to crop or the
   * rasterizer fails.
   */
  private perceptionCloseUp(
    session: LayoutSession,
    regions: readonly SketchRect[],
  ): Buffer | undefined {
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

  /**
   * Shared apply_ops/apply_quickfix result assembly (v5 §2): APPLIED
   * headline + per-op summaries, the DELTA block derived from before/after
   * documents, the LINTS delta, and the auto close-up for geometric changes
   * (channel-only batches get no image).
   */
  private perceptionResult(
    session: LayoutSession,
    before: InteractiveCanvasDocument,
    headline: string,
    summaryText: string,
    details: Record<string, unknown>,
  ): LayoutToolRenderResult {
    const delta = documentDelta(before, session.draft);
    const diagnostics = runDiagnostics(buildBoardModel(session.draft));
    const lintText = this.lintsDeltaText(session, diagnostics);
    this.emitDrafted(session, summaryText, formatDiagnostics(diagnostics));
    const deltaBlock = delta.lines.length > 0
      ? ["DELTA", ...delta.lines.map((line) => `  ${line}`)].join("\n")
      : "DELTA · none";
    const png = delta.geometric ? this.perceptionCloseUp(session, delta.regions) : undefined;
    const indentedSummary = summaryText.split("\n").map((line) => `  ${line}`).join("\n");
    return {
      ...(png ? { png } : {}),
      text: [headline, indentedSummary, deltaBlock, lintText].join("\n"),
      details,
    };
  }

  private toolApplyOps(operations: AgentPatchOperation[]): LayoutToolRenderResult {
    const session = this.currentSession();
    if (!Array.isArray(operations)) {
      return { isError: true, text: "apply_ops rejected:\n- ops must be an array." };
    }
    const errors = this.operationValidationErrors(session, operations);
    if (errors.length > 0) {
      return {
        isError: true,
        text: ["apply_ops rejected; no operations were applied:", ...errors.map((error) => `- ${error}`)].join("\n"),
      };
    }

    const before = session.draft;
    const { summaryText } = this.applyOperationBatch(session, operations);
    return this.perceptionResult(
      session,
      before,
      `APPLIED · ${operations.length} op${operations.length === 1 ? "" : "s"}`,
      summaryText,
      { operations: operations.length },
    );
  }

  /**
   * apply_quickfix (v4 §5): locate the diagnostic on the CURRENT draft,
   * invoke its rule's quickfix, and apply the resulting ops through the same
   * validation/membership/event path as apply_ops. Opt-in determinism at
   * the granularity of one accepted suggestion — the model owns the result.
   */
  private toolApplyQuickfix(diagnosticId: string): LayoutToolRenderResult {
    const session = this.currentSession();
    if (typeof diagnosticId !== "string" || diagnosticId.trim() === "") {
      return { isError: true, text: "apply_quickfix rejected: diagnosticId must be a non-empty string." };
    }
    const id = diagnosticId.trim();
    const model = buildBoardModel(session.draft);
    const diagnostics = runDiagnostics(model);
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
    const operations = rule.quickfix(model, diagnostic);
    if (operations.length === 0) {
      return {
        isError: true,
        text: `Diagnostic ${id} (${diagnostic.rule}) produced no quickfix operations for the current draft.`,
      };
    }
    const validationErrors = this.operationValidationErrors(session, operations);
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
    const { summaryText } = this.applyOperationBatch(session, operations);
    return this.perceptionResult(
      session,
      before,
      `APPLIED · quickfix ${id} (${diagnostic.rule}) · ${operations.length} op${operations.length === 1 ? "" : "s"}`,
      summaryText,
      { diagnosticId: id, operations: operations.length },
    );
  }

  private toolSolveLayout(objectIds: string[], program?: string): LayoutToolTextResult {
    const session = this.currentSession();
    const draftById = new Map(session.draft.objects.map((object) => [object.id, object]));
    const unknown = objectIds.filter((id) => !draftById.has(id));
    if (unknown.length > 0) {
      return {
        isError: true,
        text: [
          "solve_layout rejected; no geometry was applied:",
          ...unknown.map((id) => `- unknown object id: ${id}`),
        ].join("\n"),
      };
    }
    if (objectIds.length === 0) {
      return { isError: true, text: "solve_layout rejected; objectIds must not be empty." };
    }

    if (program === undefined) {
      let fit: FitScopeResult;
      try {
        fit = fitScope(session.draft, objectIds);
      } catch (error) {
        return { isError: true, text: error instanceof Error ? error.message : String(error) };
      }
      session.lastSketch = null;
      const legend = fit.legend.items.map((entry) =>
        `  ${entry.ordinal}. ${entry.type} ${JSON.stringify(entry.text)} (id=${entry.id}, ${Math.round(entry.width)}×${Math.round(entry.height)})`);
      const report = this.boardReport(session);
      return {
        text: [
          "Selection layout program:",
          "```",
          fit.program,
          "```",
          "Legend:",
          ...legend,
          this.connectionInventoryText(session, new Set(objectIds)),
          "",
          report.digest,
          "",
          report.diagnosticsText,
        ].join("\n"),
        details: { frame: fit.frame, objectIds: fit.scopeObjectIds },
      };
    }

    let sketch: Sketch;
    try {
      sketch = parseSketch(program);
    } catch (error) {
      return { isError: true, text: error instanceof Error ? error.message : String(error) };
    }
    const selection = new Set(objectIds);
    const programIds = collectSketchObjectIds(sketch.root);
    const outsideSelection = programIds.filter((id) => draftById.has(id) && !selection.has(id));
    if (outsideSelection.length > 0) {
      return {
        isError: true,
        text: [
          "solve_layout rejected; no geometry was applied:",
          ...outsideSelection.map((id) => `- program object "${id}" is outside the selection.`),
        ].join("\n"),
      };
    }

    const selectedObjects = objectIds.map((id) => draftById.get(id)!);
    const selectionFrame = {
      x: Math.min(...selectedObjects.map((object) => object.geometry.x)),
      y: Math.min(...selectedObjects.map((object) => object.geometry.y)),
      width: Math.max(...selectedObjects.map(
        (object) => object.geometry.x + object.geometry.width,
      )) - Math.min(...selectedObjects.map((object) => object.geometry.x)),
      height: Math.max(...selectedObjects.map(
        (object) => object.geometry.y + object.geometry.height,
      )) - Math.min(...selectedObjects.map((object) => object.geometry.y)),
    };
    const solveFrame = expandRect(selectionFrame, SOLVE_LAYOUT_PADDING);
    let expanded: ReturnType<typeof expandSketch>;
    try {
      expanded = expandSketch({ ...sketch, edges: [] }, {
        mode: "natural",
        width: solveFrame.width,
        height: solveFrame.height,
      });
    } catch (error) {
      return { isError: true, text: error instanceof Error ? error.message : String(error) };
    }
    const solvedById = new Map(expanded.objects.map((object) => [object.id, object]));
    const placed = objectIds.filter((id) => solvedById.has(id));
    const notPlaced = objectIds.filter((id) => !solvedById.has(id));
    const newIds = programIds.filter((id) => !draftById.has(id));
    session.draft = reconcileSectionMembership({
      ...session.draft,
      objects: session.draft.objects.map((object) => {
        if (!selection.has(object.id)) return object;
        const solved = solvedById.get(object.id);
        if (!solved) return object;
        return {
          ...object,
          geometry: {
            x: round2(solved.geometry.x + solveFrame.x),
            y: round2(solved.geometry.y + solveFrame.y),
            width: round2(solved.geometry.width),
            height: round2(solved.geometry.height),
          },
        };
      }),
    });
    session.lastSketch = null;

    const summaryLines = [
      `Placed geometry for ${placed.length} selected object${placed.length === 1 ? "" : "s"}: ${placed.join(", ") || "none"}.`,
      `Not placed: ${[...notPlaced, ...newIds].join(", ") || "none"}.`,
    ];
    if (newIds.length > 0) {
      summaryLines.push("New program ids were not created; use apply_ops to create objects.");
    }
    if (sketch.edges.length > 0) {
      summaryLines.push("Arrow statements were ignored; connections are edited via apply_ops.");
    }
    const report = this.boardReport(session);
    const summaryText = summaryLines.join("\n");
    this.emitDrafted(session, summaryText, report.diagnosticsText);
    return {
      text: [summaryText, "", report.digest, "", report.diagnosticsText].join("\n"),
      details: { placed, notPlaced: [...notPlaced, ...newIds] },
    };
  }

  private toolProposeProgram(program: string): LayoutToolTextResult {
    const session = this.currentSession();
    let sketch: Sketch;
    try {
      sketch = parseSketch(program);
    } catch (error) {
      // Parse/validate errors verbatim, line numbers included.
      return { isError: true, text: error instanceof Error ? error.message : String(error) };
    }

    const frame = session.currentFit.frame;
    let draft: InteractiveCanvasDocument;
    try {
      draft = this.buildDraft(session, session.baseline, sketch, frame);
    } catch (error) {
      return { isError: true, text: error instanceof Error ? error.message : String(error) };
    }
    const gateError = wreckedLayoutError(sketch, draft);
    if (gateError) return { isError: true, text: gateError };

    draft = reconcileSectionMembership(draft);
    session.draft = draft;
    session.lastSketch = sketch;
    session.proposalCount += 1;

    const diff = diffPrograms(session.baseline, draft, {
      legend: session.currentFit.legend,
      frame,
      scopeObjectIds: this.lintScopeIds(session, draft),
    });
    const deltaText = formatDeltaReport(diff.delta);
    const lintText = this.lintReportOf(diff);

    this.emit(session, { type: "proposal", sessionId: session.id, n: session.proposalCount });
    this.emit(session, {
      type: "delta",
      sessionId: session.id,
      n: session.proposalCount,
      delta: deltaText,
      lint: lintText,
    });

    return {
      text: [
        `Draft ${session.proposalCount} solved.`,
        "",
        deltaText,
        "",
        lintText,
      ].join("\n"),
      details: { n: session.proposalCount },
    };
  }

  private toolRenderDraft(request: LayoutRenderRequest): LayoutToolRenderResult {
    const session = this.currentSession();
    const crop = request.crop ?? expandRect(this.solvedFrame(session), CONTEXT_RING);
    const cropError = renderCropError(crop);
    if (cropError) {
      return { isError: true, text: cropError };
    }
    if (request.pixelWidth !== undefined && !Number.isFinite(request.pixelWidth)) {
      return { isError: true, text: "Raster width must be a finite number." };
    }
    const pixelWidth = Math.round(Math.min(
      MAX_RENDER_WIDTH,
      Math.max(MIN_RENDER_WIDTH, request.pixelWidth ?? DEFAULT_RENDER_WIDTH),
    ));
    this.emit(session, { type: "rendering", sessionId: session.id, n: session.proposalCount });
    try {
      const rendered = renderDocumentToSvg(documentWithinCrop(session.draft, crop), {
        cropRect: crop,
        width: pixelWidth,
      });
      const { png, width, height } = rasterizeSvgToPng(rendered.svg);
      this.renderCount += 1;
      this.onRender?.(session.id, png, this.renderCount);
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

  private toolInspect(objectIds: string[]): LayoutToolTextResult {
    const session = this.currentSession();
    const byId = new Map(session.draft.objects.map((object) => [object.id, object]));
    const connectionById = new Map(session.draft.connections.map((connection) => [connection.id, connection]));
    const lines: string[] = [];
    for (const id of objectIds) {
      const object = byId.get(id);
      if (!object) {
        const connection = connectionById.get(id);
        if (connection) {
          lines.push(
            `connection ${id}: ${connection.from.objectId} → ${connection.to.objectId}`
            + ` label=${connection.label ? JSON.stringify(connection.label) : "—"}`
            + ` style=${connection.style ?? "solid"} color=${connection.color ?? "gray"}`
            + ` arrow=${connection.arrow ?? "forward"}`,
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
    const ascii = documentToOccupancyAscii(session.draft, {
      scope: expandRect(this.solvedFrame(session), CONTEXT_RING),
    });
    return {
      text: [
        lines.length > 0 ? lines.join("\n") : "No object refs given.",
        "",
        "Occupancy (scope + context ring):",
        ascii.text,
      ].join("\n"),
    };
  }

  private toolCommit(summary: string): LayoutToolTextResult {
    const session = this.currentSession();
    const docPath = session.lastSketch === null;
    if (!docPath && session.proposalCount === 0) {
      return { isError: true, text: "Nothing to commit — create a draft first." };
    }
    // v4 commit gate (§6): blocked iff error-tier diagnostics exist within
    // the scope (baseline scope + draft-created ids). Warnings never block;
    // unresolved ones ride on the proposal for operator review.
    const report = this.boardReport(session);
    const scoped = this.scopedDiagnostics(session, report.diagnostics);
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
    const frame = session.currentFit.frame;
    if (docPath) {
      const operations = diffDocuments(session.baseline, session.draft);
      if (operations.length === 0 && session.proposal === null) {
        return { isError: true, text: "Nothing to commit — the draft matches the board." };
      }
      const proposal: AgentProposal = {
        n: Math.max(1, session.proposalCount),
        operations,
        summary: summary.trim() || `Edited ${session.scopeIds.size} objects.`,
        delta: operations.length > 0
          ? ["Document patch:", ...operations.map((operation) => `- ${describePatchOperation(operation)}`)].join("\n")
          : "No changes.",
        lint: unresolvedWarnings,
      };
      session.proposal = proposal;
      session.status = "proposal-ready";
      this.emit(session, { type: "proposal-ready", sessionId: session.id, proposal });
      return {
        text: `Committed: ${proposal.summary} (${proposal.operations.length} patch operation${proposal.operations.length === 1 ? "" : "s"}). The proposal is now awaiting operator review.`,
        details: { operations: proposal.operations.length },
      };
    }

    const diff = diffPrograms(session.baseline, session.draft, {
      legend: session.currentFit.legend,
      frame,
      scopeObjectIds: this.lintScopeIds(session, session.draft),
    });
    const proposal: AgentProposal = {
      n: session.proposalCount,
      operations: diff.operations,
      summary: summary.trim() || `Rearranged ${session.scopeIds.size} objects.`,
      delta: formatDeltaReport(diff.delta),
      lint: unresolvedWarnings,
    };
    session.proposal = proposal;
    session.status = "proposal-ready";
    this.emit(session, { type: "proposal-ready", sessionId: session.id, proposal });
    return {
      text: `Committed: ${proposal.summary} (${proposal.operations.length} patch operation${proposal.operations.length === 1 ? "" : "s"}). The proposal is now awaiting operator review.`,
      details: { operations: proposal.operations.length },
    };
  }

  private toolAbandon(reason: string): LayoutToolTextResult {
    const session = this.currentSession();
    // Keep the last committed proposal so an abandoned follow-up can still be accepted.
    session.status = "abandoned";
    this.emit(session, {
      type: "abandoned",
      sessionId: session.id,
      reason: reason.trim() || "No reason given.",
    });
    return { text: "Session abandoned. The board is untouched." };
  }
}
