/**
 * Read-only close-up perception behind `look`: the model's deliberate study of
 * one region. Each call frames exactly one region — the union of the ids it
 * names, a lone section getting its own close-up camera — and returns it
 * rendered and measured, plus the standing text truth (digest, cumulative
 * diff, findings, routes, request queue). The board render itself always
 * rides the state block, never a look. It mutates nothing and emits no run
 * event.
 */
import { Type } from "@mariozechner/pi-ai";

import { lookPerception } from "../../perception/perception";
import type { LayoutSession } from "../../store";
import type { LayoutToolRenderResult, LookRequest } from "../runtime";
import { defineWorkflowTool } from "./workflow-tool";

/**
 * The refusal names the legal calls concretely — a model that sent the wrong
 * shape re-sends a corrected call, not a re-read rule.
 */
const LOOK_NO_IDS_REFUSAL =
  "ERROR · look — name what to frame: "
  + '`look {"view": "sec-flows"}` takes one section or object close up, '
  + '`look {"view": ["obj-a", "obj-b"]}` frames several ids together. '
  + "The current board is already attached to every <state> block, "
  + "so a whole-board look is never needed.";

/** The framing knob, normalized: ids as sent, blank entries dropped. */
function requestedIds(view: LookRequest["view"]): string[] {
  const ids = typeof view === "string" ? [view] : [...(view ?? [])];
  return ids.filter((id) => typeof id === "string" && id.trim().length > 0);
}

/** Read and shape the session's deliberate close-up perception result. */
export function readSessionLook(
  session: LayoutSession,
  request: LookRequest = {},
  onRender?: (png: Buffer) => void,
): LayoutToolRenderResult {
  const ids = requestedIds(request.view);
  if (ids.length === 0) {
    return { isError: true, text: LOOK_NO_IDS_REFUSAL };
  }
  const { diagnostics: _diagnostics, ...result } = lookPerception(
    session,
    { view: ids, onRender },
  );
  return result;
}

export function toolLook(
  session: LayoutSession,
  request: LookRequest = {},
  onRender?: (png: Buffer) => void,
): LayoutToolRenderResult {
  return readSessionLook(session, request, onRender);
}

export const look = defineWorkflowTool({
  name: "look",
  label: "Look",
  description:
    "Study one region close up, without changing the board: name what to frame and it comes back rendered AND measured (per-pair gaps on each axis, row and column pitch, a section's free margins, ink share), alongside the digest, the cumulative base→draft diff, every open finding, how every edge actually routes, and the request queue. "
    + "Exactly one frame per call — a lone section id frames that section's close-up; any other set of section, object, or connection ids frames the union of everything named, routed edges included, with a ring of context around it. "
    + "The board itself always arrives with every <state> block — look never returns it.",
  fields: {
    view: Type.Union(
      [
        Type.String({ description: "One id to frame close up." }),
        Type.Array(
          Type.String({ description: "A section, object, or connection id." }),
          { minItems: 1, description: "Several ids framed together as one region." },
        ),
      ],
      {
        description:
          "What to frame: one or more section, object, or connection ids. "
          + "A lone section id frames that section; any other set frames the union "
          + "of everything named — routed edges included — with a ring of context.",
      },
    ),
  },
  invoke: async (runtime, params) =>
    runtime.look({ view: params.view }),
});
