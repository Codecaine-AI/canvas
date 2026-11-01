/**
 * crowding — sibling nodes need visible separation between their boundaries (warning tier).
 */
import { kindOf } from "../../helpers";
import { axisGap } from "../../measure";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";
import type { LayoutRule } from "../types";

/** Minimum visible separation between sibling node boxes, on either axis.
 * Actual route and label clearance is checked against rendered geometry by
 * covered-content and unreadable-labels, not inferred from unused gaps. */
const MIN_HORIZONTAL_GAP = 16;
const MIN_VERTICAL_GAP = 16;

type Rect = InteractiveCanvasObject["geometry"];

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

const GUIDANCE = `Sibling node boxes need at least 16px of visible separation:
- touching or nearly touching boxes obscure their separate boundaries;
- unused gaps do not need a wire corridor;
- actual wire and label obstructions are checked by covered-content and unreadable-labels;
- diagonal pairs have open space, and true overlaps belong to covered-content.`;

export const rule: LayoutRule = {
  id: "crowding",
  title: "Crowding",
  tier: "warning",
  guidance: GUIDANCE,
  check(document: InteractiveCanvasDocument) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const nodes = document.objects.filter((object) => kindOf(object) === "node");

    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i]!;
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j]!;
        if ((a.parentId ?? null) !== (b.parentId ?? null)) continue;

        const xGap = axisGap(a.geometry, b.geometry, "x");
        const yGap = axisGap(a.geometry, b.geometry, "y");
        const xOverlap = xGap < 0;
        const yOverlap = yGap < 0;

        if (xOverlap && yOverlap) continue;

        let gap: number;
        let axis: "horizontal" | "vertical";
        let threshold: number;
        if (yOverlap && !xOverlap) {
          gap = xGap;
          axis = "horizontal";
          threshold = MIN_HORIZONTAL_GAP;
        } else if (xOverlap && !yOverlap) {
          gap = yGap;
          axis = "vertical";
          threshold = MIN_VERTICAL_GAP;
        } else {
          continue;
        }
        if (gap >= threshold) continue;

        const roundedGap = Math.round(gap);
        findings.push({
          rule: "crowding",
          severity: "warning" as const,
          at: [a.id, b.id],
          where: unionRect(a.geometry, b.geometry),
          message: axis === "horizontal"
            ? `${a.id} and ${b.id} sit ${roundedGap}px apart side by side where separate boundaries need ≥${MIN_HORIZONTAL_GAP}px of clearance`
            : `${a.id} and ${b.id} sit ${roundedGap}px apart stacked where separate boundaries need ≥${MIN_VERTICAL_GAP}px of clearance`,
          suggestion: `open the ${a.id}↔${b.id} corridor to ≥${threshold}px`,
        });
      }
    }

    return findings;
  },
};
