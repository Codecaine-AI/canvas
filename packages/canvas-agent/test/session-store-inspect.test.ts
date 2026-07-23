import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { resolveScope } from "../src/board/scope";
import {
  toolInspect,
  type LayoutSession,
} from "../src/service/session";
import { box, connect, makeDocument } from "./synthetic";

function makeSession(baseline: InteractiveCanvasDocument): LayoutSession {
  const scopeResolution = resolveScope(baseline, [baseline.objects[0]?.id ?? "missing"]);
  return {
    id: "inspect-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/inspect.canvas.json",
    baseline,
    baselineHash: "test-hash",
    scopeResolution,
    scopeIds: new Set(scopeResolution.scopeObjectIds),
    draft: baseline,
    proposalCount: 0,
    proposal: null,
    status: "running",
    error: null,
    instruction: "Inspect the board",
    annotations: [],
    viewport: undefined,
    containerId: "inspect-container",
    sessionDir: "/tmp/inspect-session",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    exemplarShown: true,
  };
}

describe("inspect tool", () => {
  test("leaves object inspection unchanged", () => {
    const session = makeSession(makeDocument([box("source", 12, 34, 160, 96)]));

    expect(toolInspect(session, ["source"]).text).toBe(
      "rectangle source: x=12 y=34 w=160 h=96\n"
      + '  text: "source"',
    );
  });

  test("reports stored fields and the true routed path for anchored connections", () => {
    const document = makeDocument(
      [
        box("source", 0, 0, 161, 95),
        box("target", 481, 0, 161, 95),
      ],
      [{
        ...connect("anchored", "source", "target"),
        from: { objectId: "source", anchor: "right" },
        to: { objectId: "target", anchor: "left" },
        label: "handoff",
        style: "dashed",
        color: "blue",
        arrow: "both",
      }],
    );

    expect(toolInspect(makeSession(document), ["anchored"]).text).toBe(
      "connection anchored\n"
      + "  stored: from=source anchor=right → to=target anchor=left; waypoints=none;"
      + ' label="handoff" style=dashed color=blue arrow=both\n'
      + "  routed: anchors=right→left; path=161,48 → 481,48; through=none",
    );
  });

  test("reports waypoint routing and only true non-endpoint box violations", () => {
    const document = makeDocument(
      [
        box("source", 0, 0),
        box("target", 480, 0),
        box("overlaps-source", 140, 0, 40, 96),
        box("section", 190, 0, 260, 96, "section"),
        box("blocker", 240, 0),
      ],
      [{
        ...connect("waypointed", "source", "target"),
        label: "forced",
        waypoints: [[200, 48], [440, 48]],
      }],
    );

    expect(toolInspect(makeSession(document), ["waypointed"]).text).toBe(
      "connection waypointed\n"
      + "  stored: from=source anchor=auto → to=target anchor=auto;"
      + ' waypoints=200,48 → 440,48; label="forced" style=solid color=gray arrow=forward\n'
      + "  routed: anchors=right→left;"
      + " path=160,48 → 200,48 → 440,48 → 480,48; through=blocker",
    );
  });
});
