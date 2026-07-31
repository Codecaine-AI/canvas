/**
 * The lints speak the gesture surface.
 *
 * A diagnostic's `suggestion` and a rule's `guidance` are model-facing prose:
 * they tell the agent which tool closes the finding. Naming a tool the model
 * cannot call is worse than saying nothing, so this file pins two properties
 * over every rule in the registry:
 *
 *  - no retired CRUD op name (the camelCase `updateSection` family) survives in
 *    any emitted message, suggestion, or guidance block; and
 *  - every snake_case gesture named in that prose is a registered tool.
 *
 * The fixtures below exist to make the check non-vacuous: between them they
 * trip every rule in FINISHING_RULES, so the assertions run over real emitted
 * diagnostics rather than over guidance alone.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { FINISHING_RULES } from "../src/board/lints";
import { operationTools } from "../src/service/session/tools/operations";
import { box, connect, makeDocument } from "./synthetic";

/** The retired CRUD roster, as it would read if it leaked back into prose. */
const RETIRED_OP = /\b(add|update|remove|fit)(Section|Object|Sticky|Connection)\b/;

/** Registered gesture names — the only tools prose may tell the model to call. */
const GESTURES = new Set(operationTools.map((tool) => tool.name));

/**
 * snake_case words in prose that are not tool calls: schema field paths and
 * board vocabulary. Anything else with an underscore is read as a tool name.
 */
const NON_TOOL_TERMS = new Set<string>([]);

function fixtures(): { name: string; document: InteractiveCanvasDocument }[] {
  return [
    {
      // containment: a child hanging out of its frame, and a stray past the page.
      name: "containment",
      document: makeDocument([
        box("page", 0, 0, 1200, 800, "section"),
        { ...box("frame", 40, 40, 480, 320, "section"), parentId: "page" },
        { ...box("child", 440, 96, 184, 96, "process"), parentId: "frame" },
        box("stray", 1300, 96, 184, 96, "process"),
      ]),
    },
    {
      // frame-slack: a frame far larger than the one child inside it.
      name: "frame-slack",
      document: makeDocument([
        box("page", 0, 0, 4000, 3000, "section"),
        { ...box("roomy", 100, 100, 2400, 2000, "section"), parentId: "page" },
        { ...box("lonely", 200, 200, 184, 96, "process"), parentId: "roomy" },
      ]),
    },
    {
      // covered-content and crowding: boxes on top of each other, and boxes
      // closer than a wire and its chip physically need.
      name: "covered-and-crowded",
      document: makeDocument([
        box("page", 0, 0, 1200, 800, "section"),
        box("under", 80, 80, 200, 120, "process"),
        box("over", 120, 100, 200, 120, "process"),
        box("near-a", 600, 80, 160, 96, "process"),
        box("near-b", 790, 80, 160, 96, "process"),
      ]),
    },
    {
      // broken-edges: a self-loop and a dangling endpoint.
      name: "broken-edges",
      document: makeDocument(
        [
          box("page", 0, 0, 1200, 800, "section"),
          box("alpha", 80, 80, 160, 96, "process"),
        ],
        [connect("loop", "alpha", "alpha"), connect("dangle", "alpha", "ghost")],
      ),
    },
    {
      // unreadable-labels: a long chip in a corridor too narrow to draw it.
      name: "unreadable-labels",
      document: makeDocument(
        [
          box("page", 0, 0, 1200, 800, "section"),
          box("left", 80, 80, 160, 96, "process"),
          box("right", 280, 80, 160, 96, "process"),
        ],
        [{
          ...connect("labeled", "left", "right"),
          label: "a label far too long for this corridor",
        }],
      ),
    },
    {
      // clipped-text: a sticky body with more rows than its note can paint.
      name: "clipped-text",
      document: makeDocument([{
        ...box("clipped-note", 0, 0, 176, 128, "sticky"),
        text: "- one\n- two\n- three\n- four\n- five",
        style: { shape: "note" },
      }]),
    },
    {
      // section-child-color: a red section directly holding a red child.
      name: "section-child-color",
      document: makeDocument([
        box("page", 0, 0, 1200, 800, "section"),
        { ...box("hot", 40, 40, 480, 320, "section"), color: "red", parentId: "page" },
        { ...box("ember", 80, 120, 184, 96, "process"), color: "red", parentId: "hot" },
      ]),
    },
  ];
}

function everyDiagnostic(): { rule: string; text: string; source: string }[] {
  const collected: { rule: string; text: string; source: string }[] = [];
  for (const { name, document } of fixtures()) {
    for (const rule of FINISHING_RULES) {
      for (const finding of rule.check(document)) {
        collected.push({ rule: finding.rule, text: finding.message, source: `${name}/message` });
        if (finding.suggestion !== undefined) {
          collected.push({
            rule: finding.rule,
            text: finding.suggestion,
            source: `${name}/suggestion`,
          });
        }
      }
    }
  }
  return collected;
}

describe("lint prose speaks the gesture surface", () => {
  test("the fixtures trip every rule, so the checks below are not vacuous", () => {
    const tripped = new Set(everyDiagnostic().map((entry) => entry.rule));
    expect([...tripped].sort()).toEqual(FINISHING_RULES.map((rule) => rule.id).sort());
  });

  test("no rule's guidance names a retired CRUD op", () => {
    for (const rule of FINISHING_RULES) {
      expect(rule.guidance, rule.id).not.toMatch(RETIRED_OP);
    }
  });

  test("no emitted message or suggestion names a retired CRUD op", () => {
    for (const { text, source } of everyDiagnostic()) {
      expect(text, source).not.toMatch(RETIRED_OP);
    }
  });

  test("every gesture named in lint prose is a registered tool", () => {
    const prose = [
      ...FINISHING_RULES.map((rule) => rule.guidance),
      ...everyDiagnostic().map((entry) => entry.text),
    ];
    for (const text of prose) {
      for (const token of text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) {
        if (NON_TOOL_TERMS.has(token)) continue;
        expect(GESTURES, token).toContain(token);
      }
    }
  });
});
