/**
 * detail-too-long — a shape's, icon's, or section's detail must be one short
 * fact on one line (warning tier).
 *
 * Measures every non-empty `detail` with the shared text convention
 * (../../text-rules): past DETAIL_MAX_CHARS characters, more than one
 * sentence, or a line break is more than one fact. Stickies are skipped —
 * they carry no detail line; their body is markdown.
 *
 * Only details the AGENT wrote this session are judged (../authorship): on an
 * object it created, or a detail it changed. A person's own detail is left
 * alone.
 */
import { kindOf } from "../../helpers";
import { agentWrote } from "../authorship";
import { DETAIL_MAX_CHARS, detailProblems } from "../../text-rules";
import { rectOf } from "../geometry";

import type { LayoutRule } from "../types";

const GUIDANCE = `A detail is ONE short fact under a name — a port, path, version, model, or host:
- this warning fires when a detail the agent wrote this session — on an object it created, or a
  detail it changed — runs past ${DETAIL_MAX_CHARS} characters, holds more than one sentence, or
  breaks onto a second line; a person's unchanged details are out of scope;
- the renderer draws the detail as one muted line, collapsing line breaks and ellipsizing
  whatever outruns the slot, so a second fact or an explanation reads as a run-on or is cut
  off unread;
- cut the detail to its one fact with update_text and put the rest on a sticky beside its
  subject with place_sticky.`;

export const rule: LayoutRule = {
  id: "detail-too-long",
  title: "Overlong detail",
  tier: "warning",
  guidance: GUIDANCE,
  check(document, context) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const wroteDetail = agentWrote(context, "detail");

    for (const object of document.objects) {
      if (kindOf(object) === "sticky" || typeof object.detail !== "string") continue;
      if (!wroteDetail(object)) continue;
      const problems = detailProblems(object.detail);
      if (problems.length === 0) continue;

      findings.push({
        rule: "detail-too-long",
        severity: "warning",
        at: [object.id],
        where: rectOf(object),
        message:
          `${object.id}'s detail has ${problems.join(", ")} — a detail is one fact on one line, `
          + `≤ ${DETAIL_MAX_CHARS} chars`,
        suggestion:
          `cut the detail to one fact with update_text ${object.id} (detail ≤ ${DETAIL_MAX_CHARS} chars); `
          + "move the rest onto a sticky beside it with place_sticky",
      });
    }

    return findings;
  },
};
