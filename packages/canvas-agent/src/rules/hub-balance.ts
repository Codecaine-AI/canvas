/**
 * R6 · hub-balance — the hub centers over its fan (warning tier).
 *
 * Rulebook 06-r6-fan: a fan centers the hub over its children — the children
 * share one register on the fan side, evenly pitched, never closer than 64px
 * to the hub, and the hub's main-axis center sits on the midpoint of the
 * children's span (intent-2's hub at x=3168 is the exact midpoint of centers
 * 2208..4128). The check finds the tilted hub: a node with three or more
 * edges to neighbors on one side (N/S/E/W) whose center is more than 32px
 * off those neighbors' span midpoint.
 *
 * Quickfix (opt-in): slide the hub along the cross axis so its center lands
 * on the midpoint. The children stay put — a moved child would carry its
 * whole subtree, which is the model's call, not a quickfix's.
 */
import type { BoardModel, BoardNode } from "../digest/board-model";
import type { AgentPatchOperation } from "../protocol";
import type { Diagnostic, LayoutRule } from "./types";

/** A hub center further than this from the fan midpoint reads as accidental. */
const OFFSET_TOLERANCE = 32;
/** A side needs at least this many neighbors to read as a fan. */
const MIN_FAN = 3;

type Side = "N" | "S" | "E" | "W";
const SIDES: readonly Side[] = ["N", "S", "E", "W"];

interface FanFinding {
  hub: BoardNode;
  side: Side;
  neighbors: BoardNode[];   // in first-edge order, deduped
  midpoint: number;         // midpoint of the neighbors' center span (cross axis)
  offset: number;           // hub center − midpoint (signed)
}

function cx(node: BoardNode): number {
  return node.x + node.width / 2;
}

function cy(node: BoardNode): number {
  return node.y + node.height / 2;
}

/**
 * Which side of the hub a neighbor sits on. Rect separation decides —
 * vertical first (corpus fans hang below/above their hub even when the span
 * is much wider than the drop, so a strictly-below child is S no matter how
 * far right it sits), then horizontal; overlapping rects fall back to the
 * dominant center delta.
 */
function sideOf(hub: BoardNode, neighbor: BoardNode): Side {
  if (neighbor.y >= hub.y + hub.height) return "S";
  if (neighbor.y + neighbor.height <= hub.y) return "N";
  if (neighbor.x >= hub.x + hub.width) return "E";
  if (neighbor.x + neighbor.width <= hub.x) return "W";
  const dx = cx(neighbor) - cx(hub);
  const dy = cy(neighbor) - cy(hub);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "E" : "W";
  return dy >= 0 ? "S" : "N";
}

/** N/S fans balance on x; E/W fans balance on y. */
function crossCenter(side: Side, node: BoardNode): number {
  return side === "N" || side === "S" ? cx(node) : cy(node);
}

function fanFindings(board: BoardModel): FanFinding[] {
  const out: FanFinding[] = [];
  for (const hub of board.nodes) {
    if (hub.kind !== "node") continue;
    const neighbors: BoardNode[] = [];
    const seen = new Set<string>();
    for (const edge of board.edges) {
      const otherId = edge.fromId === hub.id ? edge.toId
        : edge.toId === hub.id ? edge.fromId
        : undefined;
      if (otherId === undefined || otherId === hub.id || seen.has(otherId)) continue;
      const other = board.byId(otherId);
      if (!other || other.kind === "section") continue;
      seen.add(otherId);
      neighbors.push(other);
    }
    for (const side of SIDES) {
      const fan = neighbors.filter((neighbor) => sideOf(hub, neighbor) === side);
      if (fan.length < MIN_FAN) continue;
      const centers = fan.map((neighbor) => crossCenter(side, neighbor));
      const midpoint = (Math.min(...centers) + Math.max(...centers)) / 2;
      const offset = crossCenter(side, hub) - midpoint;
      if (Math.abs(offset) <= OFFSET_TOLERANCE) continue;
      out.push({ hub, side, neighbors: fan, midpoint, offset });
    }
  }
  return out;
}

function direction(side: Side, offset: number): string {
  if (side === "N" || side === "S") return offset > 0 ? "right" : "left";
  return offset > 0 ? "below" : "above";
}

function bbox(nodes: BoardNode[]): { x: number; y: number; width: number; height: number } {
  const x = Math.min(...nodes.map((node) => node.x));
  const y = Math.min(...nodes.map((node) => node.y));
  return {
    x,
    y,
    width: Math.max(...nodes.map((node) => node.x + node.width)) - x,
    height: Math.max(...nodes.map((node) => node.y + node.height)) - y,
  };
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export const rule: LayoutRule = {
  id: "hub-balance",
  title: "Hub over its fan",
  tier: "warning",
  guidance: [
    "A fan centers its hub over its children: the children share one register on the fan",
    "side, evenly pitched, never closer than 64px to the hub, and the hub's center sits on",
    "the midpoint of their span. A hub more than ~32px off the midpoint reads as accidental —",
    "recenter it. When children straddle section boundaries, widen the spread rather than",
    "compress it past unrelated content. A default, not a law.",
  ].join("\n"),
  check(board) {
    return fanFindings(board).map((finding) => ({
      rule: "hub-balance",
      severity: "warning" as const,
      at: [finding.hub.id, ...finding.neighbors.map((node) => node.id)],
      where: bbox([finding.hub, ...finding.neighbors]),
      message: `${finding.hub.id} sits ${Math.round(Math.abs(finding.offset))}px ${direction(finding.side, finding.offset)} of its ${finding.neighbors.length} neighbors' midpoint (side ${finding.side})`,
      suggestion: `center over the fan (${finding.side === "N" || finding.side === "S" ? "x" : "y"}-center ${Math.round(finding.midpoint)})`,
    }));
  },
  quickfix(board, d: Diagnostic): AgentPatchOperation[] {
    const finding = fanFindings(board).find((candidate) =>
      sameIdSet([candidate.hub.id, ...candidate.neighbors.map((node) => node.id)], d.at));
    if (!finding) return [];
    const { hub, side, midpoint } = finding;
    const horizontal = side === "N" || side === "S";
    const geometry = {
      x: horizontal ? midpoint - hub.width / 2 : hub.x,
      y: horizontal ? hub.y : midpoint - hub.height / 2,
      width: hub.width,
      height: hub.height,
    };
    return [{ type: "updateObject", objectId: hub.id, patch: { geometry } }];
  },
};
