import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import {
  defaultGeometryFor,
  draftPlacedObject,
} from "@codecaine-ai/canvas/actions";
import {
  validateInteractiveCanvasDocument,
  type CanvasValidationIssue,
  type InteractiveCanvasConnection,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
  type InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas/schema";
import {
  CANVAS_GRID_SIZE,
  roundCanvasNumber,
  snapCanvasNumber,
  snapGeometry,
} from "@codecaine-ai/canvas/geometry";

import type {
  CompiledObject,
  CompileResult,
  Point,
} from "../agent/types";

const DOCUMENT_ID = "layout-lab-document";
const DOCUMENT_TITLE = "Layout Lab compilation";
const MAX_CANVAS_ID_LENGTH = 97;

export interface MappedDocumentValidation {
  valid: boolean;
  messages: string[];
  issues: CanvasValidationIssue[];
  warnings: CanvasValidationIssue[];
}

export interface CanvasMappingResult {
  document: InteractiveCanvasDocument;
  patchOps: CanvasAgentPatchOperation[];
  validation: MappedDocumentValidation;
}

function mappedObjectType(type: CompiledObject["type"]): InteractiveCanvasObjectType {
  switch (type) {
    case "section":
      return "section";
    case "sticky":
      return "sticky";
    case "diamond":
      return "decision";
    case "rect":
      // Layout-program rectangles represent flow nodes rather than grouping
      // containers, so the canvas process primitive is the closest semantic
      // match (and shares the prototype's canonical 184 x 96 default).
      return "process";
  }
}

function canvasGrid(result: CompileResult): number {
  const grid = result.canvas.effectiveGrid;
  return Number.isFinite(grid) && grid > 0 ? grid : CANVAS_GRID_SIZE;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function positiveFiniteOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function geometryForObject(
  object: CompiledObject,
  objectType: InteractiveCanvasObjectType,
  grid: number,
): InteractiveCanvasObject["geometry"] {
  const fallback = defaultGeometryFor(objectType);
  return snapGeometry(
    {
      x: finiteOr(object.x, fallback.x),
      y: finiteOr(object.y, fallback.y),
      width: positiveFiniteOr(object.width, fallback.width),
      height: positiveFiniteOr(object.height, fallback.height),
    },
    grid,
  );
}

function idBase(source: string, fallback: string): string {
  const trimmed = source.trim();
  let base = (trimmed || fallback)
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .slice(0, MAX_CANVAS_ID_LENGTH);

  if (!/^[A-Za-z0-9]/.test(base)) base = `id-${base}`;
  if (!base) base = fallback;
  return base.slice(0, MAX_CANVAS_ID_LENGTH);
}

function uniqueCanvasId(source: string, fallback: string, usedIds: Set<string>): string {
  const base = idBase(source, fallback);
  let candidate = base;
  let suffixNumber = 2;

  while (usedIds.has(candidate)) {
    const suffix = `-${suffixNumber}`;
    candidate = `${base.slice(0, MAX_CANVAS_ID_LENGTH - suffix.length)}${suffix}`;
    suffixNumber += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function finiteWaypoints(points: readonly Point[]): Array<[number, number]> | undefined {
  if (points.length === 0) return undefined;
  const waypoints: Array<[number, number]> = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
    waypoints.push([roundCanvasNumber(point.x), roundCanvasNumber(point.y)]);
  }
  return waypoints;
}

interface DocumentParts {
  objects: InteractiveCanvasObject[];
  connections: InteractiveCanvasConnection[];
}

function mapDocumentParts(result: CompileResult): DocumentParts {
  const usedIds = new Set<string>();
  const canvasIdByCompiledId = new Map<string, string>();
  const grid = canvasGrid(result);

  const objects = result.objects.map((compiledObject, index) => {
    const type = mappedObjectType(compiledObject.type);
    const id = uniqueCanvasId(compiledObject.id, `object-${index + 1}`, usedIds);
    // A compile error can still leave duplicate source ids in a partial result.
    // Connections resolve to the first occurrence, matching the compiler's
    // first-declaration diagnostics while keeping the emitted document valid.
    if (!canvasIdByCompiledId.has(compiledObject.id)) {
      canvasIdByCompiledId.set(compiledObject.id, id);
    }

    const draft = draftPlacedObject(
      type,
      geometryForObject(compiledObject, type, grid),
      { id, text: compiledObject.label },
    );
    // Canvas section membership is geometric/engine-owned. Omitting parentId
    // ensures this mapping does not persist a second, conflicting hierarchy.
    const { parentId: _parentId, ...withoutParentId } = draft;
    return withoutParentId;
  });

  const connections: InteractiveCanvasConnection[] = [];
  result.connectors.forEach((connector, index) => {
    const fromObjectId = canvasIdByCompiledId.get(connector.from);
    const toObjectId = canvasIdByCompiledId.get(connector.to);
    // The compiler reports unknown endpoints. Do not turn that recoverable
    // program error into an invalid canvas document.
    if (!fromObjectId || !toObjectId) return;

    const id = uniqueCanvasId(connector.id, `connection-${index + 1}`, usedIds);
    connections.push({
      id,
      from: { objectId: fromObjectId },
      to: { objectId: toObjectId },
      label: connector.label || undefined,
      style: "solid",
      arrow: "forward",
      waypoints: finiteWaypoints(connector.points),
    });
  });

  return { objects, connections };
}

function positiveCanvasExtent(value: number, grid: number, fallback: number): number {
  const finite = positiveFiniteOr(value, fallback);
  return Math.max(grid, snapCanvasNumber(finite, grid));
}

/**
 * Convert deterministic compiler output into the real canvas document model.
 * IDs and geometry are normalized defensively so partial/error compile results
 * still produce a schema-valid, inspectable document.
 */
export function compileResultToDocument(result: CompileResult): InteractiveCanvasDocument {
  const grid = canvasGrid(result);
  const { objects, connections } = mapDocumentParts(result);
  return {
    schemaVersion: 1,
    id: DOCUMENT_ID,
    title: DOCUMENT_TITLE,
    mode: "diagram",
    size: {
      width: positiveCanvasExtent(result.canvas.width, grid, 1200),
      height: positiveCanvasExtent(result.canvas.height, grid, 720),
    },
    objects,
    connections,
  };
}

function documentToPatchOps(
  document: InteractiveCanvasDocument,
): CanvasAgentPatchOperation[] {
  const objectOps: CanvasAgentPatchOperation[] = document.objects.map((object) => ({
    type: "addObject",
    object,
  }));
  const connectionOps: CanvasAgentPatchOperation[] = document.connections.map((connection) => ({
    type: "addConnection",
    connection,
  }));
  return [...objectOps, ...connectionOps];
}

/** Object additions always precede connections so every endpoint exists first. */
export function compileResultToPatchOps(result: CompileResult): CanvasAgentPatchOperation[] {
  return documentToPatchOps(compileResultToDocument(result));
}

/** Condense the canvas schema validator's discriminated result for the UI. */
export function validateMappedDocument(
  document: InteractiveCanvasDocument,
): MappedDocumentValidation {
  const validation = validateInteractiveCanvasDocument(document);
  if (!validation.ok) {
    return {
      valid: false,
      messages: validation.issues.map((issue) => `${issue.path}: ${issue.message}`),
      issues: [...validation.issues],
      warnings: [],
    };
  }

  const warnings = validation.warnings ? [...validation.warnings] : [];
  return {
    valid: true,
    messages: warnings.map((warning) => `${warning.path}: ${warning.message}`),
    issues: [],
    warnings,
  };
}

/** Build every write-mapping artifact in one pass for the output panel. */
export function mapCompileResultToCanvas(result: CompileResult): CanvasMappingResult {
  const document = compileResultToDocument(result);
  return {
    document,
    patchOps: documentToPatchOps(document),
    validation: validateMappedDocument(document),
  };
}
