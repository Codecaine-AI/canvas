/**
 * wire-to-section — a wire the agent drew that starts or ends on a section's
 * frame names no actor (warning tier).
 *
 * A wire reads as "this sends that to this". An end on a section frame
 * leaves the reader to guess which node inside sends or acts, and the wire
 * itself stops at a border, where it reads as part of the frame. In the
 * high-effort climb round 0, two of six boards drew such wires (seven on
 * code-review-agents, two on llm-inference-gateway), and both judges named
 * those spots: "tool-budget, cancellation, telemetry and findings wires
 * converge around the lower-left boundary of Concurrent Review" and "above
 * Backend capacity, the dispatch, tokens-or-error and shadow-probe wires
 * cross each other in one tangle". The guidance already says to start a wire
 * at the node that sends and end it at the node that acts; this is the check.
 *
 * Only wires the AGENT drew or re-ended this session are judged, as the text
 * rules judge only the agent's writing (../authorship): the reference corpus
 * of people's own boards uses a wire to a frame as a deliberate shorthand
 * (28 of them), and that is theirs to keep. A wire counts as the agent's when
 * it is absent from the session's starting board or either end moved to
 * another object since; without a baseline nothing is attributable and the
 * rule stays silent. The page frame is out of scope: a wire anchored there
 * has no owner to name, and containment and broken-edges judge it.
 */
import { kindOf, pageFrameOf } from "../../helpers";
import { agentWired } from "../authorship";
import { rectOf } from "../geometry";

import type { InteractiveCanvasDocument } from "../../../state/schema";
import type { LayoutRule } from "../types";

const GUIDANCE = `A wire starts at the node that sends and ends at the node that acts on it, never on a section's frame:
- this warning fires for each end of a wire the agent drew this session that sits on a section
  (the page frame excepted); a person's unchanged wires are out of scope;
- a wire to a frame names no actor, and it stops at a border where it reads as part of the frame;
- change_connection the end to the node inside the section that sends or acts; when several
  nodes do, connect one wire per node, or route the one wire to the node that fans it out.`;

export const rule: LayoutRule = {
  id: "wire-to-section",
  title: "Wire ends on a section",
  tier: "warning",
  guidance: GUIDANCE,
  check(document: InteractiveCanvasDocument, context) {
    const byId = new Map(document.objects.map((object) => [object.id, object]));
    const frameId = pageFrameOf(document)?.id ?? null;
    const wired = agentWired(context);
    const findings: ReturnType<LayoutRule["check"]> = [];
    for (const edge of document.connections) {
      if (!wired(edge)) continue;
      for (const end of ["from", "to"] as const) {
        const section = byId.get(edge[end].objectId);
        if (!section || kindOf(section) !== "section" || section.id === frameId) continue;
        const starts = end === "from";
        findings.push({
          rule: "wire-to-section",
          severity: "warning",
          at: [edge.id, section.id],
          where: rectOf(section),
          message: `${edge.id} ${starts ? "starts" : "ends"} on the frame of ${section.id}: a wire to a frame names no actor`,
          suggestion: `change_connection ${edge.id} to ${starts ? "start at" : "end at"} the node inside ${section.id} `
            + `that ${starts ? "sends it" : "acts on it"}; when several nodes do, connect one wire per node`,
        });
      }
    }
    return findings;
  },
};
