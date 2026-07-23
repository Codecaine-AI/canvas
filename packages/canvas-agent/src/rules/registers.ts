/**
 * R5 · registers — cross-branch centerlines (warning tier).
 *
 * Rulebook 05-r5-align: peers pin to one shared centerline, even across
 * section boundaries; register detection runs at 8px tolerance (4px is the
 * corpus norm for noise, exact is the intent) and the solved register is the
 * members' median center. The check finds the near miss: three or more
 * layout nodes from at least two parents whose centers crowd within the
 * tolerance band of a shared axis without being exactly aligned — "align or
 * separate".
 *
 * Quickfix (opt-in): snap every member's center to the median register.
 */
import type { BoardModel, BoardNode } from "../digest/board-model";
import type { AgentPatchOperation } from "../protocol";
import type { Diagnostic, LayoutRule } from "./types";

/** Centers within this band of one another read as one intended register. */
const REGISTER_TOLERANCE = 8;
/** Spread below this is exact alignment (sub-pixel noise), not a finding. */
const EXACT_EPSILON = 1;
/** A register needs at least this many members to read as intent. */
const MIN_MEMBERS = 3;

type Axis = "x" | "y";

interface RegisterCluster {
  axis: Axis;               // the axis of the shared center coordinate
  nodes: BoardNode[];       // sorted by center, then id
  spread: number;           // max center − min center
  median: number;           // the median center — the register to snap to
}

function centerOf(node: BoardNode, axis: Axis): number {
  return axis === "x" ? node.x + node.width / 2 : node.y + node.height / 2;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Greedy partition of layout nodes into near-register clusters along `axis`:
 * sort by center, open a cluster at the first unclaimed node, extend while
 * the center stays within REGISTER_TOLERANCE of the cluster's first center.
 * Deterministic, disjoint, ascending-register order.
 */
function clustersAlong(board: BoardModel, axis: Axis): RegisterCluster[] {
  const nodes = board.nodes
    .filter((node) => node.kind === "node")
    .sort((a, b) => centerOf(a, axis) - centerOf(b, axis) || a.id.localeCompare(b.id));
  const clusters: RegisterCluster[] = [];
  let start = 0;
  while (start < nodes.length) {
    const anchor = centerOf(nodes[start]!, axis);
    let end = start + 1;
    while (end < nodes.length && centerOf(nodes[end]!, axis) - anchor <= REGISTER_TOLERANCE) {
      end += 1;
    }
    const members = nodes.slice(start, end);
    const centers = members.map((node) => centerOf(node, axis));
    clusters.push({
      axis,
      nodes: members,
      spread: centers[centers.length - 1]! - centers[0]!,
      median: median(centers),
    });
    start = end;
  }
  return clusters;
}

/** Near-miss clusters only: ≥3 members, ≥2 parents, not exactly aligned. */
function findings(board: BoardModel): RegisterCluster[] {
  const out: RegisterCluster[] = [];
  for (const axis of ["y", "x"] as Axis[]) {
    for (const cluster of clustersAlong(board, axis)) {
      if (cluster.nodes.length < MIN_MEMBERS) continue;
      if (cluster.spread < EXACT_EPSILON) continue;
      const parents = new Set(cluster.nodes.map((node) => node.parentId));
      if (parents.size < 2) continue;
      out.push(cluster);
    }
  }
  return out;
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
  id: "registers",
  title: "Cross-branch registers",
  tier: "warning",
  guidance: [
    "Peers read as peers when they share one centerline — even across section boundaries,",
    "which nesting alone can never say. Exact alignment is the corpus norm; a few pixels off",
    "reads as a mistake, not a choice. When centers crowd within 8px of a shared register,",
    "either align them exactly (the members' median center is the usual register) or separate",
    "them clearly. Pitch along a register runs 192–320 between chip-sized members.",
  ].join("\n"),
  check(board) {
    return findings(board).map((cluster) => ({
      rule: "registers",
      severity: "warning" as const,
      at: cluster.nodes.map((node) => node.id),
      where: bbox(cluster.nodes),
      message: `${cluster.axis}-centers of ${cluster.nodes.map((node) => node.id).join("/")} within ${Math.round(cluster.spread)}px — align or separate`,
      suggestion: `median register ${cluster.axis}=${Math.round(cluster.median)}`,
    }));
  },
  quickfix(board, d: Diagnostic): AgentPatchOperation[] {
    const cluster = findings(board).find((candidate) =>
      sameIdSet(candidate.nodes.map((node) => node.id), d.at));
    if (!cluster) return [];
    const operations: AgentPatchOperation[] = [];
    for (const node of cluster.nodes) {
      const target = cluster.axis === "x"
        ? cluster.median - node.width / 2
        : cluster.median - node.height / 2;
      const current = cluster.axis === "x" ? node.x : node.y;
      if (target === current) continue;
      operations.push({
        type: "updateObject",
        objectId: node.id,
        patch: {
          geometry: {
            x: cluster.axis === "x" ? target : node.x,
            y: cluster.axis === "y" ? target : node.y,
            width: node.width,
            height: node.height,
          },
        },
      });
    }
    return operations;
  },
};
