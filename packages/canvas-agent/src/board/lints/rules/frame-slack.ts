/**
 * frame-slack — a finished frame should close around the children inside it
 * (warning tier).
 *
 * Measures the area and widest unused side that fitting would reclaim, and
 * reports only when at least two thirds of the frame's area and 320px on one
 * side are unused. The page frame, empty frames, and overflow are deliberately
 * out of scope.
 */
import { sectionFitGeometry } from "../../../../../canvas/src/state/geometry";
import { kindOf, pageFrameOf } from "../../helpers";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import type { LayoutRule } from "../types";

/** Minimum area a fit must reclaim — two thirds makes the slack unmistakable. */
const MIN_RECLAIMED_AREA = 2 / 3;
/** Minimum unused margin on one side — wider than two node columns and
 * their gutters. */
const MIN_EDGE_SLACK = 320;

type SideSlack = {
  side: "left" | "right" | "top" | "bottom";
  value: number;
};

const GUIDANCE = `A frame keeps exactly the geometry it is given, so one far larger than its children need reads as unfinished:
- this finishing-pass warning fires only when fitting would reclaim at least two thirds
  (about ${Math.round(MIN_RECLAIMED_AREA * 100)}%) of the frame and its widest unused edge is
  at least ${MIN_EDGE_SLACK}px; a frame with room to spare is headroom, not a defect;
- fit_section <id> closes the frame around the children already inside it and touches no ancestor;
- empty frames are out of scope because there is nothing to fit around, and children hanging
  outside their frame are containment's error;
- compressing a frame before its siblings are placed makes a worse board than leaving slack —
  run this check as a finishing pass.`;

export const rule: LayoutRule = {
  id: "frame-slack",
  title: "Frame slack",
  tier: "warning",
  guidance: GUIDANCE,
  check(document: InteractiveCanvasDocument) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const pageFrame = pageFrameOf(document);

    for (const section of document.objects) {
      if (kindOf(section) !== "section" || section.id === pageFrame?.id) continue;

      // This is the production helper fit_section lowers to, so the lint and
      // remedy can never disagree about fitted geometry.
      const fit = sectionFitGeometry(document, section.id);
      if (!fit) continue;

      const frame = section.geometry;
      const frameArea = frame.width * frame.height;
      const fitArea = fit.width * fit.height;
      if (!(frameArea > 0) || !Number.isFinite(frameArea) || !Number.isFinite(fitArea)) continue;

      const rawLeft = fit.x - frame.x;
      const rawRight = frame.x + frame.width - (fit.x + fit.width);
      const rawTop = fit.y - frame.y;
      const rawBottom = frame.y + frame.height - (fit.y + fit.height);
      const rawSlack = [rawLeft, rawRight, rawTop, rawBottom];
      if (rawSlack.some((value) => !Number.isFinite(value) || value < 0)) continue;

      const reclaimedArea = 1 - fitArea / frameArea;
      if (reclaimedArea < MIN_RECLAIMED_AREA) continue;

      const slackBySide: readonly SideSlack[] = [
        { side: "left", value: Math.max(0, rawLeft) },
        { side: "right", value: Math.max(0, rawRight) },
        { side: "top", value: Math.max(0, rawTop) },
        { side: "bottom", value: Math.max(0, rawBottom) },
      ];
      // Strict comparison gives ties the fixed order left, right, top, bottom.
      let widest = slackBySide[0]!;
      for (const candidate of slackBySide.slice(1)) {
        if (candidate.value > widest.value) widest = candidate;
      }
      if (widest.value < MIN_EDGE_SLACK) continue;

      findings.push({
        rule: "frame-slack",
        severity: "warning",
        at: [section.id],
        where: section.geometry,
        message: `${section.id} is ${Math.round(frame.width)}×${Math.round(frame.height)} around children needing ${Math.round(fit.width)}×${Math.round(fit.height)} — ${Math.round(reclaimedArea * 100)}% of the frame is unused, ${Math.round(widest.value)}px of it on the ${widest.side}`,
        suggestion: `fit_section ${section.id} closes the frame around the children already inside it — leave the slack if it is space you are still filling`,
      });
    }

    return findings;
  },
};
