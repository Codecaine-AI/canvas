import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

import {
  lintDraft,
  type CrossingViolation,
  type OffGridViolation,
  type OverlapViolation,
  type OverflowViolation,
  type SpacingViolation,
} from "./lint";
import type { RoutedSketchEdge } from "./route";
import type { ScopeLegend } from "./scope";
import type { SketchRect } from "./types";

/**
 * Program diff → patch operations (KERNEL-PROPOSAL §2.3).
 *
 * Compares the accepted draft document against the baseline and emits
 * `CanvasAgentPatchOperation[]` under the two deliberate restrictions:
 * geometry only, **never parentId** (the reducer's reconcile choke point
 * derives membership) and **never waypoints** (the product's live router owns
 * connector paths; on updateObject the choke point re-routes). Omission is
 * deletion (D1): a baseline object/connection absent from the draft becomes a
 * remove op, and the delta report surfaces removals loudly.
 */

export interface DiffSessionContext {
  /** The fitScope legend for the session (accepted for symmetry; ids in both documents are authoritative). */
  legend?: ScopeLegend;
  /** The scope frame — anchors position wording and the overflow check. */
  frame?: SketchRect;
  /** The resolved Ring-0 scope; limits overflow/crossing findings to it. */
  scopeObjectIds?: readonly string[];
  /** The D2 make-room displacement set, reported as its own delta group. */
  madeRoomIds?: readonly string[];
  /** Preview-routed edges for the crossing count (else routed internally). */
  routedEdges?: readonly RoutedSketchEdge[];
}

export interface MovedDelta {
  id: string;
  text: string;
  /** Compass-and-band description of the position before the change. */
  before: string;
  /** Compass-and-band description of the position after the change. */
  after: string;
  /** Plain-language movement, e.g. "moved ~96px east". */
  movement: string;
  resized: boolean;
}

export interface CreatedDelta {
  id: string;
  type: string;
  text: string;
}

export interface DeletedDelta {
  id: string;
  type: string;
  text: string;
}

export interface DeletedConnectionDelta {
  id: string;
  from: string;
  to: string;
}

export interface MadeRoomDelta {
  id: string;
  text: string;
  movement: string;
}

export interface DeltaReport {
  moved: MovedDelta[];
  created: CreatedDelta[];
  /** Surfaced loudly by formatDeltaReport ("N objects deleted"). */
  deleted: DeletedDelta[];
  deletedConnections: DeletedConnectionDelta[];
  madeRoom: MadeRoomDelta[];
  spacing: SpacingViolation[];
  overlap: OverlapViolation[];
  overflow: OverflowViolation[];
  crossings: CrossingViolation[];
  offGrid: OffGridViolation[];
}

export interface DiffResult {
  operations: CanvasAgentPatchOperation[];
  delta: DeltaReport;
}

/** Matches createObjectId's normalization in packages/canvas (slug + -k). */
function mintObjectId(base: string, used: Set<string>): string {
  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "canvas-object";
  let id = normalized;
  if (used.has(id)) {
    let index = 2;
    while (used.has(`${normalized}-${index}`)) index += 1;
    id = `${normalized}-${index}`;
  }
  used.add(id);
  return id;
}

/** Matches nextId("connection", …) in packages/canvas. */
function mintConnectionId(used: Set<string>): string {
  let index = 1;
  while (used.has(`connection-${index}`)) index += 1;
  const id = `connection-${index}`;
  used.add(id);
  return id;
}

function geometryChanged(a: SketchRect, b: SketchRect): boolean {
  return a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height;
}

function boundsOf(objects: readonly InteractiveCanvasObject[]): SketchRect {
  if (!objects.length) return { x: 0, y: 0, width: 1, height: 1 };
  const x = Math.min(...objects.map((object) => object.geometry.x));
  const y = Math.min(...objects.map((object) => object.geometry.y));
  const right = Math.max(...objects.map((object) => object.geometry.x + object.geometry.width));
  const bottom = Math.max(...objects.map((object) => object.geometry.y + object.geometry.height));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/** Nonet band name for a rect's center within the frame. */
function bandName(geometry: SketchRect, frame: SketchRect): string {
  const rx = (geometry.x + geometry.width / 2 - frame.x) / frame.width;
  const ry = (geometry.y + geometry.height / 2 - frame.y) / frame.height;
  const column = rx < 1 / 3 ? "left" : rx > 2 / 3 ? "right" : "";
  const row = ry < 1 / 3 ? "top" : ry > 2 / 3 ? "bottom" : "";
  if (row && column) return `${row}-${column}`;
  return row || column || "center";
}

const COMPASS_NAMES = [
  "east", "south-east", "south", "south-west",
  "west", "north-west", "north", "north-east",
] as const;

function directionName(dx: number, dy: number): string {
  // 8-way compass from the movement angle (45° sectors, east = 0).
  const angle = Math.atan2(dy, dx);
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return COMPASS_NAMES[sector]!;
}

function movementDescription(before: SketchRect, after: SketchRect): string {
  const dx = after.x + after.width / 2 - (before.x + before.width / 2);
  const dy = after.y + after.height / 2 - (before.y + before.height / 2);
  const distance = Math.round(Math.hypot(dx, dy));
  const resized = before.width !== after.width || before.height !== after.height;
  const parts: string[] = [];
  if (distance >= 1) parts.push(`moved ~${distance}px ${directionName(dx, dy)}`);
  if (resized) {
    parts.push(`resized ${Math.round(before.width)}×${Math.round(before.height)} → ${Math.round(after.width)}×${Math.round(after.height)}`);
  }
  return parts.join(", ") || "in place";
}

/**
 * Diff the accepted draft against the baseline document and emit patch
 * operations plus the plain-language delta report. Only geometry is diffed —
 * the layout agent never edits text/color — and only add/update/remove ops
 * are emitted, in an order the applier resolves cleanly (adds before the
 * connections that reference them, connection removals before object
 * removals whose cascade would cover them).
 */
export function diffPrograms(
  baseline: InteractiveCanvasDocument,
  draft: InteractiveCanvasDocument,
  session: DiffSessionContext = {},
): DiffResult {
  const baselineById = new Map(baseline.objects.map((object) => [object.id, object]));
  const draftById = new Map(draft.objects.map((object) => [object.id, object]));
  const frame = session.frame ?? boundsOf(baseline.objects);

  const usedObjectIds = new Set<string>([
    ...baseline.objects.map((object) => object.id),
    ...draft.objects.map((object) => object.id),
  ]);
  /** draft id → id as it will exist after apply (minted for new objects). */
  const finalId = new Map<string, string>();

  const addObjectOps: CanvasAgentPatchOperation[] = [];
  const updateOps: CanvasAgentPatchOperation[] = [];
  const removeConnectionOps: CanvasAgentPatchOperation[] = [];
  const removeObjectOps: CanvasAgentPatchOperation[] = [];
  const addConnectionOps: CanvasAgentPatchOperation[] = [];

  const moved: MovedDelta[] = [];
  const created: CreatedDelta[] = [];
  const deleted: DeletedDelta[] = [];
  const movedIds = new Set<string>();
  const createdDraftIds = new Set<string>();

  // Objects: draft order for adds/updates (deterministic, document-shaped).
  for (const draftObject of draft.objects) {
    const baselineObject = baselineById.get(draftObject.id);
    if (!baselineObject) {
      const minted = mintObjectId(
        draftObject.text.trim() || draftObject.type,
        usedObjectIds,
      );
      finalId.set(draftObject.id, minted);
      createdDraftIds.add(draftObject.id);
      // parentId is derived by the reducer choke point — never emitted.
      const { parentId: _ignored, ...rest } = draftObject;
      addObjectOps.push({ type: "addObject", object: { ...rest, id: minted, parentId: null } });
      created.push({ id: minted, type: draftObject.type, text: draftObject.text });
      continue;
    }
    finalId.set(draftObject.id, draftObject.id);
    if (geometryChanged(baselineObject.geometry, draftObject.geometry)) {
      // Geometry only — never parentId, never waypoints (§2.3).
      updateOps.push({
        type: "updateObject",
        objectId: draftObject.id,
        patch: { geometry: { ...draftObject.geometry } },
      });
      movedIds.add(draftObject.id);
      moved.push({
        id: draftObject.id,
        text: baselineObject.text,
        before: bandName(baselineObject.geometry, frame),
        after: bandName(draftObject.geometry, frame),
        movement: movementDescription(baselineObject.geometry, draftObject.geometry),
        resized: baselineObject.geometry.width !== draftObject.geometry.width
          || baselineObject.geometry.height !== draftObject.geometry.height,
      });
    }
  }

  // Omission = deletion (D1).
  const removedObjectIds = new Set<string>();
  for (const baselineObject of baseline.objects) {
    if (draftById.has(baselineObject.id)) continue;
    removedObjectIds.add(baselineObject.id);
    removeObjectOps.push({ type: "removeObject", objectId: baselineObject.id });
    deleted.push({ id: baselineObject.id, type: baselineObject.type, text: baselineObject.text });
  }

  // Connections. Same id + same endpoints = same connection (geometry-driven
  // re-routes are the choke point's job — NO ops). Same id with different
  // endpoints = remove + add. Draft-only connections are new (minted id,
  // endpoints remapped through finalId for freshly minted objects).
  const baselineConnectionById = new Map(
    baseline.connections.map((connection) => [connection.id, connection]),
  );
  const draftConnectionById = new Map(
    draft.connections.map((connection) => [connection.id, connection]),
  );
  const usedConnectionIds = new Set<string>([
    ...baseline.connections.map((connection) => connection.id),
    ...draft.connections.map((connection) => connection.id),
  ]);
  const deletedConnections: DeletedConnectionDelta[] = [];

  const sameEndpoints = (
    a: InteractiveCanvasConnection,
    b: InteractiveCanvasConnection,
  ): boolean => a.from.objectId === b.from.objectId && a.to.objectId === b.to.objectId;

  for (const baselineConnection of baseline.connections) {
    const draftConnection = draftConnectionById.get(baselineConnection.id);
    if (draftConnection && sameEndpoints(baselineConnection, draftConnection)) continue;
    // Cascade covers connections touching a removed object — no explicit op.
    const cascaded = removedObjectIds.has(baselineConnection.from.objectId)
      || removedObjectIds.has(baselineConnection.to.objectId);
    if (!cascaded) {
      removeConnectionOps.push({ type: "removeConnection", connectionId: baselineConnection.id });
    }
    if (!draftConnection) {
      deletedConnections.push({
        id: baselineConnection.id,
        from: baselineConnection.from.objectId,
        to: baselineConnection.to.objectId,
      });
    }
  }
  for (const draftConnection of draft.connections) {
    const baselineConnection = baselineConnectionById.get(draftConnection.id);
    if (baselineConnection && sameEndpoints(baselineConnection, draftConnection)) continue;
    const connection: InteractiveCanvasConnection = {
      ...draftConnection,
      id: mintConnectionId(usedConnectionIds),
      from: {
        ...draftConnection.from,
        objectId: finalId.get(draftConnection.from.objectId) ?? draftConnection.from.objectId,
      },
      to: {
        ...draftConnection.to,
        objectId: finalId.get(draftConnection.to.objectId) ?? draftConnection.to.objectId,
      },
    };
    // Never waypoints (§2.3): the live router owns paths.
    delete connection.waypoints;
    addConnectionOps.push({ type: "addConnection", connection });
  }

  // Made-room set (D2, provided by the harness's displacement pass).
  const madeRoom: MadeRoomDelta[] = (session.madeRoomIds ?? []).flatMap((id) => {
    const baselineObject = baselineById.get(id);
    const draftObject = draftById.get(id);
    if (!baselineObject || !draftObject) return [];
    return [{
      id,
      text: baselineObject.text,
      movement: movementDescription(baselineObject.geometry, draftObject.geometry),
    }];
  });

  // Structural findings on the draft, filtered to what this change touched.
  const lint = lintDraft(draft, session.frame, { routedEdges: session.routedEdges });
  const scopeIds = new Set(session.scopeObjectIds ?? [...movedIds]);
  const touched = new Set([...movedIds, ...createdDraftIds, ...scopeIds]);
  const remap = (id: string): string => finalId.get(id) ?? id;
  const spacing = lint.spacing
    .filter((violation) => touched.has(violation.aId) || touched.has(violation.bId))
    .map((violation) => ({ ...violation, aId: remap(violation.aId), bId: remap(violation.bId) }));
  const overlap = lint.overlap
    .filter((violation) => touched.has(violation.aId) || touched.has(violation.bId))
    .map((violation) => ({ ...violation, aId: remap(violation.aId), bId: remap(violation.bId) }));
  const overflow = lint.overflow
    .filter((violation) => scopeIds.has(violation.id) || createdDraftIds.has(violation.id))
    .map((violation) => ({ ...violation, id: remap(violation.id) }));
  const crossings = lint.crossings
    .filter((violation) => touched.has(violation.from) || touched.has(violation.to))
    .map((violation) => ({ ...violation, from: remap(violation.from), to: remap(violation.to) }));
  const offGrid = lint.offGrid
    .filter((violation) => movedIds.has(violation.id) || createdDraftIds.has(violation.id))
    .map((violation) => ({ ...violation, id: remap(violation.id) }));

  return {
    operations: [
      ...addObjectOps,
      ...updateOps,
      ...removeConnectionOps,
      ...removeObjectOps,
      ...addConnectionOps,
    ],
    delta: {
      moved,
      created,
      deleted,
      deletedConnections,
      madeRoom,
      spacing,
      overlap,
      overflow,
      crossings,
      offGrid,
    },
  };
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** Plain-language delta report (§2.2). Deletions lead, loudly. */
export function formatDeltaReport(delta: DeltaReport): string {
  const lines: string[] = [];
  if (delta.deleted.length > 0) {
    lines.push(`*** ${count(delta.deleted.length, "object")} DELETED: ${delta.deleted
      .map((entry) => `${JSON.stringify(entry.text)} (${entry.id})`)
      .join(", ")} ***`);
  }
  if (delta.deletedConnections.length > 0) {
    lines.push(`*** ${count(delta.deletedConnections.length, "connection")} DELETED: ${delta.deletedConnections
      .map((entry) => `${entry.from} → ${entry.to}`)
      .join(", ")} ***`);
  }
  if (delta.created.length > 0) {
    lines.push(`Created ${count(delta.created.length, "object")}: ${delta.created
      .map((entry) => `${JSON.stringify(entry.text)} (${entry.id})`)
      .join(", ")}`);
  }
  if (delta.moved.length > 0) {
    lines.push(`Moved ${count(delta.moved.length, "object")}:`);
    for (const entry of delta.moved) {
      lines.push(`- ${JSON.stringify(entry.text)}: ${entry.before} → ${entry.after} (${entry.movement})`);
    }
  }
  if (delta.madeRoom.length > 0) {
    lines.push(`Made room by shifting ${count(delta.madeRoom.length, "object")}:`);
    for (const entry of delta.madeRoom) {
      lines.push(`- ${JSON.stringify(entry.text)}: ${entry.movement}`);
    }
  }
  for (const violation of delta.spacing) {
    lines.push(`Spacing: ${violation.aId} ↔ ${violation.bId} gap ${Math.round(violation.gap)}px is off the ladder (nearest rung ${violation.nearestRung}px)`);
  }
  for (const violation of delta.overflow) {
    const sides = { N: "top", S: "bottom", E: "right", W: "left" } as const;
    lines.push(`Overflow: ${violation.id} extends ${violation.amount}px past the ${sides[violation.side]} edge of the frame`);
  }
  for (const violation of delta.crossings) {
    lines.push(`Crossing: connector ${violation.from} → ${violation.to} passes through a box`);
  }
  for (const violation of delta.offGrid) {
    lines.push(`Off-grid: ${violation.id} has fractional ${violation.fields.join("/")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "No changes.";
}
