/**
 * rhythm — even sibling pitch (warning tier). The "Lint: clean" cram case:
 * every gap sits on a ladder rung, but the row still reads as crammed
 * because the gaps are uneven.
 *
 * A run is three or more same-parent layout siblings chained along one axis
 * (each consecutive pair axis-adjacent: cross-axis overlap, gap between 0
 * and the ladder window — beyond that they are "apart", not a row). When
 * the run's gap spread (max − min) exceeds 16px, the rhythm is off.
 *
 * Quickfix (opt-in): keep the first box fixed and re-pitch the rest so every
 * gap equals the ladder rung nearest the median gap.
 */
import { SPACING_LADDER } from "../pipeline/expand";

import type { BoardModel, BoardNode } from "../digest/board-model";
import type { AgentPatchOperation } from "../protocol";
import type { Diagnostic, LayoutRule } from "./types";

/** Gap spread (max − min) beyond this reads as uneven rhythm. */
const SPREAD_TOLERANCE = 16;
/** A run needs at least this many members to carry a rhythm. */
const MIN_RUN = 3;
/** Rungs ascending, for snapping the median gap. */
const LADDER = [...SPACING_LADDER].sort((a, b) => a - b);
/** Gaps beyond the ladder window break the run — the pair is "apart". */
const RUN_MAX_GAP = LADDER[LADDER.length - 1]! + 8;

type Axis = "x" | "y";

interface Run {
  axis: Axis;
  nodes: BoardNode[];       // in axis order
  gaps: number[];           // nodes.length − 1 consecutive gaps
  spread: number;           // max gap − min gap
  rung: number;             // ladder rung nearest the median gap
}

function pos(node: BoardNode, axis: Axis): number {
  return axis === "x" ? node.x : node.y;
}

function extent(node: BoardNode, axis: Axis): number {
  return axis === "x" ? node.width : node.height;
}

function gapBetween(a: BoardNode, b: BoardNode, axis: Axis): { gap: number; crossOverlap: number } {
  const cross: Axis = axis === "x" ? "y" : "x";
  return {
    gap: pos(b, axis) - (pos(a, axis) + extent(a, axis)),
    crossOverlap: Math.min(pos(a, cross) + extent(a, cross), pos(b, cross) + extent(b, cross))
      - Math.max(pos(a, cross), pos(b, cross)),
  };
}

function nearestRung(gap: number): number {
  let best = LADDER[0]!;
  for (const rung of LADDER) {
    if (Math.abs(gap - rung) < Math.abs(gap - best)) best = rung;
  }
  return best;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Chains per parent group and axis: sort by position, then greedily extend a
 * run while the next sibling is axis-adjacent to the previous one (positive
 * cross overlap, gap within [0, RUN_MAX_GAP]). Deterministic and disjoint;
 * parent groups iterate in board order.
 */
function runsIn(board: BoardModel): Run[] {
  const groups = new Map<string | null, BoardNode[]>();
  for (const node of board.nodes) {
    if (node.kind !== "node") continue;
    const key = node.parentId ?? null;
    const group = groups.get(key);
    if (group) group.push(node);
    else groups.set(key, [node]);
  }
  const runs: Run[] = [];
  for (const group of groups.values()) {
    for (const axis of ["x", "y"] as const) {
      const sorted = [...group].sort((a, b) => pos(a, axis) - pos(b, axis) || a.id.localeCompare(b.id));
      let chain: BoardNode[] = [];
      const close = (): void => {
        if (chain.length >= MIN_RUN) {
          const gaps = chain.slice(1).map((node, index) => gapBetween(chain[index]!, node, axis).gap);
          const spread = Math.max(...gaps) - Math.min(...gaps);
          if (spread > SPREAD_TOLERANCE) {
            runs.push({ axis, nodes: chain, gaps, spread, rung: nearestRung(median(gaps)) });
          }
        }
        chain = [];
      };
      for (const node of sorted) {
        const previous = chain[chain.length - 1];
        if (previous) {
          const { gap, crossOverlap } = gapBetween(previous, node, axis);
          if (crossOverlap <= 0 || gap < 0 || gap > RUN_MAX_GAP) close();
        }
        chain.push(node);
      }
      close();
    }
  }
  return runs;
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

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export const rule: LayoutRule = {
  id: "rhythm",
  title: "Even sibling pitch",
  tier: "warning",
  guidance: [
    `Siblings in a row (or column) keep one pitch: even gaps drawn from the ladder {${LADDER.join(", ")}},`,
    "flush (0) only for repeated cells. Uneven gaps — some crammed, some loose — read as",
    "accidental even when every gap sits on a rung. Keep the pitch steady (the rung nearest",
    "the median gap is the usual pick), or break the run apart visibly so it reads as two",
    "groups instead of one bad one. A default, not a law.",
  ].join("\n"),
  check(board) {
    return runsIn(board).map((run) => ({
      rule: "rhythm",
      severity: "warning" as const,
      at: run.nodes.map((node) => node.id),
      where: bbox(run.nodes),
      message: `run ${run.nodes.map((node) => node.id).join("→")} gaps ${run.gaps.map((gap) => Math.round(gap)).join("/")}px uneven (spread ${Math.round(run.spread)}px, axis ${run.axis})`,
      suggestion: `even the gaps to the ${run.rung}px rung`,
    }));
  },
  quickfix(board, d: Diagnostic): AgentPatchOperation[] {
    const run = runsIn(board).find((candidate) =>
      sameIds(candidate.nodes.map((node) => node.id), d.at));
    if (!run) return [];
    const operations: AgentPatchOperation[] = [];
    let cursor = pos(run.nodes[0]!, run.axis) + extent(run.nodes[0]!, run.axis);
    for (const node of run.nodes.slice(1)) {
      const target = cursor + run.rung;
      if (target !== pos(node, run.axis)) {
        operations.push({
          type: "updateObject",
          objectId: node.id,
          patch: {
            geometry: {
              x: run.axis === "x" ? target : node.x,
              y: run.axis === "y" ? target : node.y,
              width: node.width,
              height: node.height,
            },
          },
        });
      }
      cursor = target + extent(node, run.axis);
    }
    return operations;
  },
};
