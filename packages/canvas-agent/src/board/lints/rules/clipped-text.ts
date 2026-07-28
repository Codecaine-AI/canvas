/**
 * clipped-text — object text must render whole inside its box (warning tier).
 *
 * Checks every non-empty object text field with the renderer-parity
 * textFitReport. Connections are deliberately skipped: edge-label chips grow
 * instead of ellipsizing, and unreadable-labels owns whether a chip crowds its
 * corridor.
 */
import { textFitReport } from "../../text-fit";
import { rectOf } from "../geometry";

import type { LayoutRule } from "../types";

const GUIDANCE = `Object text must render whole inside the box that owns it:
- this warning fires when a shape label or sticky body drops text behind an ellipsis, or a
  section title ellipsizes at its frame width;
- clipped text is absent from the rendered pixels, so a reader physically cannot read the
  missing words;
- grow the box to at least the measured needed size, or shorten the text until the whole
  label, body, or title renders.`;

export const rule: LayoutRule = {
  id: "clipped-text",
  title: "Clipped text",
  tier: "warning",
  guidance: GUIDANCE,
  check(document) {
    const findings: ReturnType<LayoutRule["check"]> = [];

    for (const object of document.objects) {
      if (object.text === undefined || object.text === "") continue;
      const report = textFitReport(object, object.geometry, object.text);
      if (report.fits) continue;

      findings.push({
        rule: "clipped-text",
        severity: "warning",
        at: [object.id],
        where: rectOf(object),
        message: `${object.id}: ${report.detail}`,
        suggestion: report.neededSize
          ? `grow ${object.id} to ≥${report.neededSize.width}×${report.neededSize.height} or shorten the text`
          : "shorten the text",
      });
    }

    return findings;
  },
};
