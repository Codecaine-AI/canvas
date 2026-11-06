/**
 * Wire integrity — the wires no edit may make: a self-loop, a dangling end
 * (an endpoint id with no object), or a zero-length wire (both ends on one
 * center). The operation runner refuses an edit that makes one, and
 * canvas_open reports the ones an older file already holds.
 */
import type { InteractiveCanvasDocument } from "../state/schema";
import { center } from "./lints/geometry";

export type BrokenWireKind = "self-loop" | "dangling" | "zero-length";

export interface BrokenWire {
  id: string;
  kind: BrokenWireKind;
  /** What is wrong, in one clause: "e3 connects a to itself". */
  text: string;
}

/** Every broken wire on the board, in connection order. */
export function brokenWires(document: InteractiveCanvasDocument): BrokenWire[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const broken: BrokenWire[] = [];
  for (const edge of document.connections) {
    const fromId = edge.from.objectId;
    const toId = edge.to.objectId;
    if (fromId === toId) {
      broken.push({ id: edge.id, kind: "self-loop", text: `${edge.id} connects ${fromId} to itself` });
      continue;
    }
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) {
      const missing = [from ? undefined : fromId, to ? undefined : toId].filter((id) => id !== undefined);
      broken.push({ id: edge.id, kind: "dangling", text: `${edge.id} dangles: no object ${missing.join(", ")}` });
      continue;
    }
    const a = center(from);
    const b = center(to);
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1) {
      broken.push({ id: edge.id, kind: "zero-length", text: `${edge.id} has zero length: ${fromId} and ${toId} share one center` });
    }
  }
  return broken;
}

/** The broken wires in `after` that `before` did not already have. */
export function newBrokenWires(
  before: InteractiveCanvasDocument,
  after: InteractiveCanvasDocument,
): BrokenWire[] {
  const old = new Set(brokenWires(before).map((wire) => `${wire.id} ${wire.kind}`));
  return brokenWires(after).filter((wire) => !old.has(`${wire.id} ${wire.kind}`));
}

/** The canvas_open line for a file's broken wires, or null when there are none. */
export function brokenWiresLine(document: InteractiveCanvasDocument): string | null {
  const broken = brokenWires(document);
  if (broken.length === 0) return null;
  return `BROKEN WIRES · ${broken.length} in this file: ${broken.map((wire) => wire.text).join("; ")}`
    + " — delete each with delete, or reconnect it with change_connection";
}
