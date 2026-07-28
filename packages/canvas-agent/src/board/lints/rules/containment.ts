/**
 * containment — a section must contain its children, and everything must
 * stay on the page (error tier).
 *
 * Two checks: a parentId child extending outside its section's rect, and any
 * object more than 16px past the board's base section. Each
 * offending child/object is reported individually so every diagnostic is
 * croppable and addressable on its own.
 */
import { childrenOf, kindOf, pageFrameOf } from "../../helpers";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";
import type { LayoutRule } from "../types";

/** Allowed bleed past the base section, in px. */
const FRAME_TOLERANCE = 16;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function overflowPast(inner: InteractiveCanvasObject, outer: InteractiveCanvasObject): number {
  const innerRect = inner.geometry;
  const outerRect = outer.geometry;
  return Math.max(
    outerRect.x - innerRect.x,
    outerRect.y - innerRect.y,
    innerRect.x + innerRect.width - (outerRect.x + outerRect.width),
    innerRect.y + innerRect.height - (outerRect.y + outerRect.height),
  );
}

function regionOf(
  object: InteractiveCanvasObject,
): { x: number; y: number; width: number; height: number } {
  return object.geometry;
}

const GUIDANCE = `A section contains its children, and the page contains everything:
- content sitting across a section boundary belongs somewhere — move_to the child where it
  goes, or, when the frame is what is wrong, size it deliberately with resize or
  fit_section; a section never resizes itself;
- the base section is the page: keep everything within it, or grow it (${FRAME_TOLERANCE}px of bleed is
  tolerated; more is an error that blocks commit).`;

export const rule: LayoutRule = {
  id: "containment",
  title: "Containment",
  tier: "error",
  guidance: GUIDANCE,
  check(document: InteractiveCanvasDocument) {
    const findings: ReturnType<LayoutRule["check"]> = [];

    for (const section of document.objects.filter((object) => kindOf(object) === "section")) {
      for (const child of childrenOf(document, section.id)) {
        const overflow = overflowPast(child, section);
        if (!Number.isFinite(overflow) || !(overflow > 0)) continue;
        findings.push({
          rule: "containment",
          severity: "error",
          at: [child.id, section.id],
          where: regionOf(child),
          message: `${child.id} extends ${round2(overflow)}px outside its section ${section.id}`,
          suggestion: `move_to ${child.id} back inside ${section.id}, or resize ${section.id} to hold it — fit_section ${section.id} closes the frame around what is already inside`,
        });
      }
    }

    const frameNode = pageFrameOf(document);
    if (frameNode) {
      for (const object of document.objects) {
        if (object.id === frameNode.id) continue;
        const overflow = overflowPast(object, frameNode);
        if (!Number.isFinite(overflow) || !(overflow > FRAME_TOLERANCE)) continue;
        findings.push({
          rule: "containment",
          severity: "error",
          at: [object.id, frameNode.id],
          where: regionOf(object),
          message: `${object.id} extends ${round2(overflow)}px past the base section ${frameNode.id} (maximum ${FRAME_TOLERANCE}px)`,
          suggestion: `move_to ${object.id} inside ${frameNode.id}, or resize ${frameNode.id} to hold the diagram — the base section is the page, and it is yours to size`,
        });
      }
    }

    return findings;
  },
};
