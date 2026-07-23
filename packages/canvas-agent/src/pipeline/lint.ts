import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { SPACING_LADDER } from "./expand";
import {
  countPathBoxViolations,
  directElbowEdges,
  routeSketchEdges,
  type RoutableObject,
  type RoutedSketchEdge,
} from "./route";
import type { ExpandedSketch, SketchEdge, SketchRect } from "./types";

/**
 * Draft lint — the structural half of the propose_program report
 * (KERNEL-PROPOSAL §2.2): spacing-ladder conformance, off-grid values,
 * object overlaps, connector-through-box violations, and frame overflow.
 * Pure composition over the pipeline's metrics/route helpers; the ladder
 * constants come from the expansion corpus constants, not re-invented.
 */

/** Tolerance around a ladder rung, in px (matches the fitter's gap classes). */
const LADDER_TOLERANCE = 8;
/**
 * Adjacent-gap window: gaps wider than the top rung plus tolerance are
 * "apart", not sibling spacing, and carry no ladder obligation.
 */
const LADDER_MAX_GAP = Math.max(...SPACING_LADDER) + LADDER_TOLERANCE;

export interface SpacingViolation {
  kind: "spacing";
  aId: string;
  bId: string;
  /** Axis of the gap: "x" = horizontal neighbors, "y" = vertical. */
  axis: "x" | "y";
  gap: number;
  nearestRung: number;
}

export type GeometryField = "x" | "y" | "width" | "height";

export interface OffGridViolation {
  kind: "off-grid";
  id: string;
  /** The geometry fields carrying off-grid (default: sub-pixel) values. */
  fields: GeometryField[];
}

export interface OverflowViolation {
  kind: "overflow";
  id: string;
  side: "N" | "S" | "E" | "W";
  /** How far beyond the frame edge, in px. */
  amount: number;
}

export interface OverlapViolation {
  kind: "overlap";
  aId: string;
  bId: string;
  /** Intersection area as a percentage of the smaller object's area. */
  overlapPct: number;
}

export interface CrossingViolation {
  kind: "crossing";
  from: string;
  to: string;
}

export interface LintReport {
  spacing: SpacingViolation[];
  offGrid: OffGridViolation[];
  overflow: OverflowViolation[];
  overlap: OverlapViolation[];
  crossings: CrossingViolation[];
  clean: boolean;
}

export interface LintOptions {
  /**
   * Grid for the off-grid check. The default (1) flags sub-pixel values only:
   * both the corpus boards and the solver's output are integer, while the
   * expansion's centered placement is deliberately not 16-aligned — linting
   * the full 16px canvas grid would flag every solved draft. Pass 16 to audit
   * strict canvas-grid alignment.
   */
  gridSize?: number;
  /**
   * Routed preview paths for the crossing check. When omitted, edges are
   * routed here (corridor routing for an ExpandedSketch, direct elbows over a
   * document's geometry).
   */
  routedEdges?: readonly RoutedSketchEdge[];
}

export type LintInput = InteractiveCanvasDocument | ExpandedSketch;

interface LintSubject {
  objects: LintObject[];
  edges: SketchEdge[];
  routed: readonly RoutedSketchEdge[];
}

interface LintObject extends RoutableObject {
  /** Undefined for expanded sketches, which are linted as one flat selection. */
  parentId?: string | null;
}

function isDocument(input: LintInput): input is InteractiveCanvasDocument {
  return "schemaVersion" in input;
}

function subjectOf(input: LintInput, options: LintOptions): LintSubject {
  if (isDocument(input)) {
    const objects: LintObject[] = input.objects.map((object) => ({
      id: object.id,
      type: object.type,
      geometry: object.geometry,
      parentId: object.parentId,
    }));
    const edges: SketchEdge[] = input.connections.map((connection) => ({
      from: connection.from.objectId,
      to: connection.to.objectId,
    }));
    return {
      objects,
      edges,
      routed: options.routedEdges ?? directElbowEdges(objects, edges),
    };
  }
  return {
    objects: input.objects.map((object) => ({
      id: object.id,
      type: object.type,
      geometry: object.geometry,
    })),
    edges: input.edges,
    routed: options.routedEdges ?? routeSketchEdges(input, "corridors"),
  };
}

function nearestRung(gap: number): number {
  let best = SPACING_LADDER[0] as number;
  for (const rung of SPACING_LADDER) {
    if (Math.abs(gap - rung) < Math.abs(gap - best)) best = rung;
  }
  return best;
}

/**
 * Ladder conformance over axis-adjacent box pairs: pairs that overlap on the
 * cross axis with a positive gap inside the ladder window must sit within
 * tolerance of a rung.
 */
function spacingViolations(objects: readonly RoutableObject[]): SpacingViolation[] {
  const boxes = objects.filter((object) => object.type !== "section");
  const violations: SpacingViolation[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!.geometry;
      const b = boxes[j]!.geometry;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      const checks: { axis: "x" | "y"; overlap: number; gap: number }[] = [
        { axis: "x", overlap: overlapY, gap: Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width) },
        { axis: "y", overlap: overlapX, gap: Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height) },
      ];
      for (const { axis, overlap, gap } of checks) {
        if (overlap <= 0 || gap <= 0 || gap > LADDER_MAX_GAP) continue;
        const rung = nearestRung(gap);
        if (Math.abs(gap - rung) > LADDER_TOLERANCE) {
          violations.push({ kind: "spacing", aId: boxes[i]!.id, bId: boxes[j]!.id, axis, gap, nearestRung: rung });
        }
      }
    }
  }
  return violations;
}

function offGridViolations(
  objects: readonly RoutableObject[],
  gridSize: number,
): OffGridViolation[] {
  const violations: OffGridViolation[] = [];
  for (const object of objects) {
    const fields = (["x", "y", "width", "height"] as const).filter((field) => {
      const value = object.geometry[field];
      return Math.abs(value / gridSize - Math.round(value / gridSize)) > 1e-6;
    });
    if (fields.length > 0) violations.push({ kind: "off-grid", id: object.id, fields: [...fields] });
  }
  return violations;
}

function overflowViolations(
  objects: readonly RoutableObject[],
  frame: SketchRect,
): OverflowViolation[] {
  const violations: OverflowViolation[] = [];
  for (const object of objects) {
    const { x, y, width, height } = object.geometry;
    const sides: { side: OverflowViolation["side"]; amount: number }[] = [
      { side: "W", amount: frame.x - x },
      { side: "N", amount: frame.y - y },
      { side: "E", amount: x + width - (frame.x + frame.width) },
      { side: "S", amount: y + height - (frame.y + frame.height) },
    ];
    for (const { side, amount } of sides) {
      if (amount > 0.5) violations.push({ kind: "overflow", id: object.id, side, amount: Math.round(amount) });
    }
  }
  return violations;
}

const OVERLAP_EXEMPT_TYPES = new Set(["section", "sticky", "annotation-marker"]);

function overlapViolations(objects: readonly LintObject[]): OverlapViolation[] {
  const boxes = objects.filter((object) => !OVERLAP_EXEMPT_TYPES.has(object.type));
  const violations: OverlapViolation[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if ((a.parentId ?? null) !== (b.parentId ?? null)) {
        continue;
      }
      const overlapWidth = Math.min(a.geometry.x + a.geometry.width, b.geometry.x + b.geometry.width)
        - Math.max(a.geometry.x, b.geometry.x);
      const overlapHeight = Math.min(a.geometry.y + a.geometry.height, b.geometry.y + b.geometry.height)
        - Math.max(a.geometry.y, b.geometry.y);
      if (overlapWidth <= 0 || overlapHeight <= 0) continue;
      const smallerArea = Math.min(
        a.geometry.width * a.geometry.height,
        b.geometry.width * b.geometry.height,
      );
      if (smallerArea <= 0) continue;
      violations.push({
        kind: "overlap",
        aId: a.id,
        bId: b.id,
        overlapPct: (overlapWidth * overlapHeight / smallerArea) * 100,
      });
    }
  }
  return violations;
}

function overflowFrame(input: LintInput, fallback?: SketchRect): SketchRect | undefined {
  if (!isDocument(input)) return fallback;
  const backgrounds = input.objects.filter(
    (object) => object.type === "section" && object.locked === "background",
  );
  return backgrounds.find((object) => object.parentId === null)?.geometry
    ?? backgrounds[0]?.geometry
    ?? fallback;
}

function crossingViolations(subject: LintSubject): CrossingViolation[] {
  // Attribute violations per edge by counting each routed path alone.
  return subject.routed
    .filter((edge) => countPathBoxViolations([edge], subject.objects) > 0)
    .map((edge) => ({ kind: "crossing" as const, from: edge.from, to: edge.to }));
}

/**
 * Lint a draft — a full canvas document or an expanded (solved) sketch — for
 * spacing-ladder, off-grid, overlap, connector-through-box, and (when a frame
 * is given or the document has a locked background section) overflow findings.
 */
export function lintDraft(
  input: LintInput,
  frame?: SketchRect,
  options: LintOptions = {},
): LintReport {
  const subject = subjectOf(input, options);
  const spacing = spacingViolations(subject.objects);
  const offGrid = offGridViolations(subject.objects, options.gridSize ?? 1);
  const frameForOverflow = overflowFrame(input, frame);
  const overflow = frameForOverflow ? overflowViolations(subject.objects, frameForOverflow) : [];
  const overlap = overlapViolations(subject.objects);
  const crossings = crossingViolations(subject);
  return {
    spacing,
    offGrid,
    overflow,
    overlap,
    crossings,
    clean: spacing.length + offGrid.length + overflow.length + overlap.length + crossings.length === 0,
  };
}

const SIDE_NAMES: Record<OverflowViolation["side"], string> = {
  N: "top",
  S: "bottom",
  E: "right",
  W: "left",
};

export function formatLintReport(report: LintReport): string {
  if (report.clean) return "Lint: clean.";
  const lines: string[] = ["Lint:"];
  for (const violation of report.spacing) {
    lines.push(
      `- spacing: ${violation.aId} ↔ ${violation.bId} gap ${Math.round(violation.gap)}px is off the ladder (nearest rung ${violation.nearestRung}px)`,
    );
  }
  for (const violation of report.offGrid) {
    lines.push(`- off-grid: ${violation.id} has fractional ${violation.fields.join("/")}`);
  }
  for (const violation of report.overflow) {
    lines.push(
      `- overflow: ${violation.id} extends ${violation.amount}px past the ${SIDE_NAMES[violation.side]} edge of the frame`,
    );
  }
  for (const violation of report.overlap) {
    lines.push(
      `- overlap: ${violation.aId} ↔ ${violation.bId} intersects over ${Math.round(violation.overlapPct)}% of the smaller object`,
    );
  }
  for (const violation of report.crossings) {
    lines.push(`- crossing: connector ${violation.from} → ${violation.to} passes through a box`);
  }
  return lines.join("\n");
}
