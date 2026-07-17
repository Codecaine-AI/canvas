import type { LayoutOp } from "./agent/types";

/** The four example programs from the original layout-sandbox prototype. */
export const PRESETS = {
  Fibonacci: [
    { op: "split", region: "r", axis: "row", weights: [21, 13] },
    { op: "place", region: "r.0", type: "sticky", label: "21", id: "fib21", pack: "center" },
    { op: "split", region: "r.1", axis: "column", weights: [13, 8] },
    { op: "place", region: "r.1.0", type: "sticky", label: "13", id: "fib13", pack: "center" },
    { op: "split", region: "r.1.1", axis: "row", weights: [8, 5] },
    { op: "place", region: "r.1.1.0", type: "sticky", label: "8", id: "fib8", pack: "center" },
    { op: "split", region: "r.1.1.1", axis: "column", weights: [5, 3] },
    { op: "place", region: "r.1.1.1.0", type: "sticky", label: "5", id: "fib5", pack: "center" },
    { op: "place", region: "r.1.1.1.1", type: "sticky", label: "3", id: "fib3", pack: "center" },
  ],
  "Retro board": [
    { op: "split", region: "r", axis: "row", weights: [1, 1, 1] },
    { op: "place", region: "r.0", type: "section", label: "Went well", id: "section.well" },
    { op: "place", region: "r.0", type: "sticky", label: "Win {i}", id: "well", count: 4, pack: "grid" },
    { op: "place", region: "r.1", type: "section", label: "Went poorly", id: "section.poorly" },
    { op: "place", region: "r.1", type: "sticky", label: "Issue {i}", id: "poorly", count: 5, pack: "grid" },
    { op: "place", region: "r.2", type: "section", label: "Actions", id: "section.actions" },
    { op: "place", region: "r.2", type: "sticky", label: "Action {i}", id: "action", count: 6, pack: "grid" },
  ],
  "Flow through the streets": [
    { op: "split", region: "r", axis: "column", weights: [1, 1] },
    { op: "split", region: "r.0", axis: "row", weights: [1, 1, 1] },
    { op: "split", region: "r.1", axis: "row", weights: [1, 1, 1] },
    { op: "place", region: "r.0.0", type: "section", label: "Intake", id: "section.intake" },
    { op: "place", region: "r.0.1", type: "section", label: "Decision", id: "section.decision" },
    { op: "place", region: "r.0.2", type: "section", label: "Fast lane", id: "section.fast" },
    { op: "place", region: "r.1.0", type: "section", label: "Research", id: "section.research" },
    { op: "place", region: "r.1.1", type: "section", label: "Build & verify", id: "section.build" },
    { op: "place", region: "r.1.2", type: "section", label: "Done", id: "section.done" },
    { op: "place", region: "r.0.0", type: "rect", label: "Request", id: "intake", pack: "center" },
    { op: "place", region: "r.0.1", type: "diamond", label: "Clear?", id: "decide", pack: "center" },
    { op: "place", region: "r.0.2", type: "rect", label: "Expedite", id: "fast", pack: "center" },
    { op: "place", region: "r.1.0", type: "rect", label: "Investigate", id: "research", pack: "center" },
    { op: "place", region: "r.1.1", type: "rect", label: "Build {i}", id: "build", count: 2, pack: "column" },
    { op: "place", region: "r.1.2", type: "rect", label: "Shipped", id: "ship", pack: "center" },
    { op: "connect", from: "intake", to: "decide", label: "assess" },
    { op: "connect", from: "decide", to: "fast", label: "yes" },
    { op: "connect", from: "decide", to: "research", label: "investigate" },
    { op: "connect", from: "intake", to: "research", label: "add detail" },
    { op: "connect", from: "research", to: "build.0", label: "ready" },
    { op: "connect", from: "build.0", to: "build.1", label: "verify" },
    { op: "connect", from: "build.1", to: "ship", label: "release" },
    { op: "connect", from: "fast", to: "ship", label: "merge" },
    { op: "connect", from: "fast", to: "research", label: "rework" },
  ],
  "Weighted dashboard": [
    { op: "split", region: "r", axis: "row", weights: [3, 1] },
    { op: "split", region: "r.0", axis: "column", weights: [2, 1, 1] },
    { op: "place", region: "r.0.0", type: "section", label: "Overview", id: "section.overview" },
    { op: "place", region: "r.0.0", type: "rect", label: "Metric {i}", id: "metric", count: 3, pack: "row" },
    { op: "place", region: "r.0.1", type: "section", label: "Signals", id: "section.signals" },
    { op: "place", region: "r.0.1", type: "sticky", label: "Signal {i}", id: "signal", count: 3, pack: "row" },
    { op: "place", region: "r.0.2", type: "section", label: "Risks", id: "section.risks" },
    { op: "place", region: "r.0.2", type: "diamond", label: "Risk {i}", id: "risk", count: 2, pack: "row" },
    { op: "place", region: "r.1", type: "section", label: "Notes", id: "section.notes" },
    { op: "place", region: "r.1", type: "sticky", label: "Note {i}", id: "note", count: 4, pack: "column" },
  ],
} as const satisfies Record<string, readonly LayoutOp[]>;

export type PresetName = keyof typeof PRESETS;

export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];
export const DEFAULT_PRESET_NAME: PresetName = "Flow through the streets";

export function getPreset(name: PresetName): LayoutOp[] {
  return PRESETS[name].map((operation) => operation.op === "split"
    ? { ...operation, weights: [...operation.weights] }
    : { ...operation }) as LayoutOp[];
}
