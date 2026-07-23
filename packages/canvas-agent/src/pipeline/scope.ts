import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas/schema";

import { fitSketch } from "./fit";
import { serializeSketch } from "./serialize";
import type {
  FanDeclaration,
  FitSketchOptions,
  Sketch,
  SketchEdge,
  SketchNode,
  SketchRect,
  TierDeclaration,
} from "./types";

/**
 * Scoped fit — the `fit_scope` tool's engine (KERNEL-PROPOSAL §3.1).
 *
 * Ring 0: only the scoped objects (plus the derived members of any scoped
 * section) and the connections among them are fitted, solving into the
 * selection's bounding frame. Ring 1: connections crossing the scope edge
 * appear in the program's arrows block as JSON-quoted raw-id references, and
 * the boundary report describes each outside endpoint, the nearest outside
 * neighbor per frame side, and the frame rect itself. Ring 2 (v1): outside
 * objects sharing a full-document tier/fan with inside members ride along as
 * quoted refs in the align/fan lines — pinned constraints the model can see
 * but never move.
 */

export type FrameSide = "N" | "S" | "E" | "W";

export interface ScopeLegendEntry {
  /** The program number declared for this object. */
  ordinal: number;
  id: string;
  type: InteractiveCanvasObjectType;
  text: string;
  width: number;
  height: number;
}

export interface ScopeOutsideRef {
  /** The JSON-quoted raw id as it appears in the program. */
  id: string;
  type: InteractiveCanvasObjectType;
  text: string;
  /** Which side of the frame rect the object sits on ("inside" = overlapping). */
  side: FrameSide | "inside";
}

export interface ScopeLegend {
  /** Every program number → canvas object. */
  items: ScopeLegendEntry[];
  /** Every quoted outside id referenced by the program. */
  outside: ScopeOutsideRef[];
}

export interface ScopeBoundaryConnection {
  connectionId: string;
  insideId: string;
  outsideId: string;
  /** "outbound" = from inside to outside. */
  direction: "outbound" | "inbound";
}

export interface ScopeNeighbor {
  side: FrameSide;
  id: string;
  type: InteractiveCanvasObjectType;
  text: string;
  /** Gap between the frame edge and the object's nearest edge, in px. */
  distance: number;
}

export interface ScopeBoundary {
  frame: SketchRect;
  /** Connections with exactly one endpoint in scope. */
  connections: ScopeBoundaryConnection[];
  /** Nearest outside non-section neighbor per frame side (at most one each). */
  neighbors: ScopeNeighbor[];
}

export interface FitScopeResult {
  /** The serialized scoped program (byte-stable under parse → serialize). */
  program: string;
  sketch: Sketch;
  legend: ScopeLegend;
  boundary: ScopeBoundary;
  /** The selection's bounding frame — the rect the program solves into. */
  frame: SketchRect;
  /** The resolved scope: requested ids plus scoped sections' derived members. */
  scopeObjectIds: string[];
}

export type FitScopeOptions = FitSketchOptions;

function area(geometry: SketchRect): number {
  return Math.max(0, geometry.width) * Math.max(0, geometry.height);
}

function centerX(geometry: SketchRect): number {
  return geometry.x + geometry.width / 2;
}

function centerY(geometry: SketchRect): number {
  return geometry.y + geometry.height / 2;
}

function containsCenter(container: SketchRect, child: SketchRect): boolean {
  const x = centerX(child);
  const y = centerY(child);
  return x >= container.x
    && x <= container.x + container.width
    && y >= container.y
    && y <= container.y + container.height;
}

/**
 * Derive each object's parent section exactly the way fitSketch does
 * (center containment; a section's parent must be strictly larger; smallest
 * containing section wins; ties break on id then document order).
 */
function deriveParents(document: InteractiveCanvasDocument): Map<string, string | null> {
  const objectIndex = new Map(document.objects.map((object, index) => [object.id, index]));
  const sections = document.objects.filter((object) => object.type === "section");
  const parents = new Map<string, string | null>();
  document.objects.forEach((object) => {
    const objectArea = area(object.geometry);
    const possibleParents = sections
      .filter((section) => section.id !== object.id)
      .filter((section) => containsCenter(section.geometry, object.geometry))
      .filter((section) => object.type !== "section" || area(section.geometry) > objectArea)
      .sort((left, right) => {
        const areaDifference = area(left.geometry) - area(right.geometry);
        if (areaDifference !== 0) return areaDifference;
        const idDifference = left.id.localeCompare(right.id);
        return idDifference
          || (objectIndex.get(left.id) ?? 0) - (objectIndex.get(right.id) ?? 0);
      });
    parents.set(object.id, possibleParents[0]?.id ?? null);
  });
  return parents;
}

function frameOf(objects: readonly InteractiveCanvasObject[]): SketchRect {
  const x = Math.min(...objects.map((object) => object.geometry.x));
  const y = Math.min(...objects.map((object) => object.geometry.y));
  const right = Math.max(...objects.map((object) => object.geometry.x + object.geometry.width));
  const bottom = Math.max(...objects.map((object) => object.geometry.y + object.geometry.height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function frameSideOf(geometry: SketchRect, frame: SketchRect): FrameSide | "inside" {
  const x = centerX(geometry);
  const y = centerY(geometry);
  const dx = x < frame.x ? frame.x - x : x > frame.x + frame.width ? x - (frame.x + frame.width) : 0;
  const dy = y < frame.y ? frame.y - y : y > frame.y + frame.height ? y - (frame.y + frame.height) : 0;
  if (dx === 0 && dy === 0) return "inside";
  if (dx >= dy) return x < frame.x ? "W" : "E";
  return y < frame.y ? "N" : "S";
}

/** Gap between the frame's `side` edge and the object's nearest edge (>= 0). */
function frameEdgeDistance(geometry: SketchRect, frame: SketchRect, side: FrameSide): number {
  if (side === "W") return Math.max(0, frame.x - (geometry.x + geometry.width));
  if (side === "E") return Math.max(0, geometry.x - (frame.x + frame.width));
  if (side === "N") return Math.max(0, frame.y - (geometry.y + geometry.height));
  return Math.max(0, geometry.y - (frame.y + frame.height));
}

/** Ids in the exact order serializeSketch declares them (= program numbers). */
function declarationOrder(node: SketchNode, out: string[]): void {
  if (node.kind === "split") {
    node.children.forEach((child) => declarationOrder(child, out));
    return;
  }
  if (node.kind === "section") {
    out.push(node.id);
    declarationOrder(node.child, out);
    return;
  }
  for (const item of node.items) out.push(item.id);
}

/**
 * Fit only the scoped objects into a program solving the selection's bounding
 * frame. Throws on unknown scope ids (the caller's selection is stale).
 */
export function fitScope(
  document: InteractiveCanvasDocument,
  scopeObjectIds: readonly string[],
  options: FitScopeOptions = {},
): FitScopeResult {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const unknown = scopeObjectIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    throw new Error(`fitScope: unknown object id(s): ${unknown.join(", ")}.`);
  }
  if (scopeObjectIds.length === 0) {
    throw new Error("fitScope: the scope must contain at least one object.");
  }

  // Whole sections in scope pull in their derived members (recursively), so
  // section semantics survive the sub-fit intact.
  const parents = deriveParents(document);
  const inside = new Set(scopeObjectIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const object of document.objects) {
      if (inside.has(object.id)) continue;
      const parent = parents.get(object.id);
      if (parent && inside.has(parent)) {
        inside.add(object.id);
        grew = true;
      }
    }
  }

  const scopedObjects = document.objects.filter((object) => inside.has(object.id));
  const frame = frameOf(scopedObjects);

  // Ring 0: fit the sub-document (scoped objects + interior connections).
  const subDocument: InteractiveCanvasDocument = {
    ...document,
    objects: scopedObjects,
    connections: document.connections.filter((connection) => (
      inside.has(connection.from.objectId) && inside.has(connection.to.objectId)
    )),
    annotations: [],
  };
  const scoped = fitSketch(subDocument, options);

  // Ring 1: arrows crossing the scope edge reference the outside endpoint by
  // its JSON-quoted raw id. Edges are rebuilt in document connection order so
  // interior and boundary arrows interleave deterministically.
  const boundaryConnections: ScopeBoundaryConnection[] = [];
  const edges: SketchEdge[] = [];
  for (const connection of document.connections) {
    const fromInside = inside.has(connection.from.objectId);
    const toInside = inside.has(connection.to.objectId);
    if (!fromInside && !toInside) continue;
    edges.push({ from: connection.from.objectId, to: connection.to.objectId });
    if (fromInside && toInside) continue;
    boundaryConnections.push({
      connectionId: connection.id,
      insideId: fromInside ? connection.from.objectId : connection.to.objectId,
      outsideId: fromInside ? connection.to.objectId : connection.from.objectId,
      direction: fromInside ? "outbound" : "inbound",
    });
  }

  // Ring 2 (v1): full-document tiers/fans that couple inside members to
  // outside objects ride along; the outside members serialize as quoted refs
  // (pinned constraints, never movable items). A cross-boundary declaration
  // supersedes the narrower inside-only one the sub-fit found.
  const full = fitSketch(document, options);
  const isCross = (members: readonly string[]): boolean => (
    members.some((id) => inside.has(id)) && members.some((id) => !inside.has(id))
  );
  const crossTiers = full.tiers.filter((tier) => isCross(tier.members));
  const crossFans = full.fans.filter((fan) => isCross([fan.hub, ...fan.children]));
  const keptTiers = scoped.tiers.filter((tier) => !crossTiers.some((cross) => (
    cross.axis === tier.axis && tier.members.every((member) => cross.members.includes(member))
  )));
  const keptFans = scoped.fans.filter((fan) => !crossFans.some((cross) => (
    cross.hub === fan.hub && cross.dir === fan.dir
  )));
  const tiers: TierDeclaration[] = [...keptTiers, ...crossTiers]
    .map((tier, index) => ({ ...tier, name: `t${index + 1}` }));
  const fans: FanDeclaration[] = [...keptFans, ...crossFans];

  const sketch: Sketch = { root: scoped.root, tiers, fans, edges };
  const program = serializeSketch(sketch);

  // Legend: program numbers follow declaration order in the tree.
  const declared: string[] = [];
  declarationOrder(sketch.root, declared);
  const items: ScopeLegendEntry[] = declared.map((id, index) => {
    const object = byId.get(id)!;
    return {
      ordinal: index + 1,
      id,
      type: object.type,
      text: object.text,
      width: object.geometry.width,
      height: object.geometry.height,
    };
  });

  const outsideIds = new Set<string>();
  for (const boundaryConnection of boundaryConnections) outsideIds.add(boundaryConnection.outsideId);
  for (const tier of crossTiers) {
    for (const member of tier.members) if (!inside.has(member)) outsideIds.add(member);
  }
  for (const fan of crossFans) {
    for (const id of [fan.hub, ...fan.children]) if (!inside.has(id)) outsideIds.add(id);
  }
  const outside: ScopeOutsideRef[] = [...outsideIds]
    .sort((left, right) => left.localeCompare(right))
    .map((id) => {
      const object = byId.get(id)!;
      return {
        id,
        type: object.type,
        text: object.text,
        side: frameSideOf(object.geometry, frame),
      };
    });

  // Nearest outside non-section neighbor per frame side.
  const neighbors: ScopeNeighbor[] = [];
  for (const side of ["N", "S", "E", "W"] as const) {
    let best: ScopeNeighbor | null = null;
    for (const object of document.objects) {
      if (inside.has(object.id) || object.type === "section") continue;
      if (frameSideOf(object.geometry, frame) !== side) continue;
      const distance = frameEdgeDistance(object.geometry, frame, side);
      if (!best
        || distance < best.distance
        || (distance === best.distance && object.id.localeCompare(best.id) < 0)) {
        best = { side, id: object.id, type: object.type, text: object.text, distance };
      }
    }
    if (best) neighbors.push(best);
  }

  return {
    program,
    sketch,
    legend: { items, outside },
    boundary: { frame, connections: boundaryConnections, neighbors },
    frame,
    scopeObjectIds: scopedObjects.map((object) => object.id),
  };
}
