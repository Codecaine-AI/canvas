/**
 * clipped-text — object text must render whole inside its box (warning tier).
 *
 * Checks every object's name and one-line detail with the renderer-parity
 * textFitReport. Connections are deliberately skipped: edge-label chips grow
 * instead of ellipsizing, and unreadable-labels owns whether a chip crowds its
 * corridor.
 *
 * Only a definite `overflows` verdict is a warning: a reliable one, or one
 * that holds even with every character the bundled fonts lack at zero width
 * (forced rows, a margin no fallback glyph can close). A `borderline` verdict
 * (the text is within 1px of its box edge, where the browser may wrap or clip
 * where the measurement does not) and any other estimate are notes:
 * reported, never blocking.
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
  label, body, title, or detail renders;
- text within 1px of its box edge, or holding characters the bundled fonts lack, is a note
  instead: it may wrap or clip in the browser, so it cannot be promised either way.`;

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

/** The remedy for a note: what would make the fit certain, when anything would. */
function noteSuggestionFor(id: string, report: TextFitReport): string | undefined {
  if (report.verdict !== "fits" && report.neededSize) {
    return `grow ${id} to ≥${report.neededSize.width}×${report.neededSize.height} to be sure`;
  }
  return undefined;
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
      if (report.verdict === "fits" && report.reliable) continue;

      // Judged only when the overflow is clear of the edge and does not hang on an estimate.
      const judged = report.verdict === "overflows" && report.definite;
      const suggestion = judged ? suggestionFor(object.id, report) : noteSuggestionFor(object.id, report);
      findings.push({
        rule: "clipped-text",
        severity: judged ? "warning" : "note",
        at: [object.id],
        where: rectOf(object),
        message: `${object.id}: ${report.detail}`,
        ...(suggestion ? { suggestion } : null),
      });
    }

    return findings;
  },
};
