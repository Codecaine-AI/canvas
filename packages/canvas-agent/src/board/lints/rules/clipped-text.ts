/**
 * clipped-text — object text must render whole inside its box (warning tier).
 *
 * Checks every object's name and one-line detail with the renderer-parity
 * textFitReport. Connections are deliberately skipped: edge-label chips grow
 * instead of ellipsizing, and unreadable-labels owns whether a chip crowds its
 * corridor.
 */
import { textFitReport, type TextFitReport } from "../../text-fit";
import { rectOf } from "../geometry";

import type { LayoutRule } from "../types";

const GUIDANCE = `Object text must render whole inside the box that owns it:
- this warning fires when a shape label or sticky body drops text behind an ellipsis, a
  section title ellipsizes at its frame width, or a detail line is cut short or has no room
  under its name;
- clipped text is absent from the rendered pixels, so a reader physically cannot read the
  missing words;
- grow the box to at least the measured needed size, or shorten the text until the whole
  label, body, title, or detail renders.`;

/** The remedy, worded for what actually clipped: the name, the detail line, or both. */
function suggestionFor(id: string, report: TextFitReport): string {
  const needed = report.neededSize;
  const line = report.detailLine;
  const detailCut = line !== undefined && !(line.shown && !line.truncated);
  if (!detailCut) {
    return needed ? `grow ${id} to ≥${needed.width}×${needed.height} or shorten the text` : "shorten the text";
  }
  if (!line.shown) {
    return needed
      ? `grow ${id} to ≥${needed.width}×${needed.height} so the detail line fits under the name, or clear the detail`
      : "clear the detail or shorten the name";
  }
  const detailLimit = `${id}'s detail to ≤${line.fittingChars} chars (it has ${line.totalChars})`;
  if (report.nameFits === false) {
    return needed
      ? `grow ${id} to ≥${needed.width}×${needed.height}, or shorten the name and ${detailLimit}`
      : `shorten the name and ${detailLimit}`;
  }
  return needed ? `shorten ${detailLimit} or widen ${id} to ≥${needed.width}` : `shorten ${detailLimit}`;
}

export const rule: LayoutRule = {
  id: "clipped-text",
  title: "Clipped text",
  tier: "warning",
  guidance: GUIDANCE,
  check(document, context) {
    const findings: ReturnType<LayoutRule["check"]> = [];

    for (const object of document.objects) {
      const text = object.text ?? "";
      if (text === "" && !object.detail?.trim()) continue;
      const report = textFitReport(object, object.geometry, text, context?.canvasStyle);
      if (report.fits) continue;

      findings.push({
        rule: "clipped-text",
        severity: "warning",
        at: [object.id],
        where: rectOf(object),
        message: `${object.id}: ${report.detail}`,
        suggestion: suggestionFor(object.id, report),
      });
    }

    return findings;
  },
};
