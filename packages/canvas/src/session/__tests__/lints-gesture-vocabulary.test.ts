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

import type { InteractiveCanvasDocument } from "../../state/schema";

import { FINISHING_RULES, type LintContext } from "../../board/lints";
import { detailKey, detailSubjects } from "../../board/detail-value";
import { operationTools } from "../tools/operations";
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

/** detail-value: a node whose detail Jev judged filler, with that verdict in the lint context. */
function detailValueFixture(): { name: string; document: InteractiveCanvasDocument; context: LintContext } {
  const document = makeDocument([{ ...box("db", 0, 0, 280, 120, "process"), text: "Postgres", detail: "the database" }]);
  const [subject] = detailSubjects(document);
  return {
    name: "detail-value",
    document,
    context: { detailVerdicts: new Map([[detailKey(subject!), { choice: "remove", confidence: 0.9, pRemove: 0.95, model: "jev-1.14.0" }]]) },
  };
}

function fixtures(): { name: string; document: InteractiveCanvasDocument; context?: LintContext }[] {
  return [
    detailValueFixture(),
    {
      // covered-content: boxes on top of each other.
      name: "covered-content",
      document: makeDocument([
        box("page", 0, 0, 1200, 800, "section"),
        box("under", 80, 80, 200, 120, "process"),
        box("over", 120, 100, 200, 120, "process"),
        box("near-a", 600, 80, 160, 96, "process"),
        box("near-b", 768, 80, 160, 96, "process"),
      ]),
    },
    {
      // covered-content: two section frames pushed into each other.
      name: "section-on-section",
      document: makeDocument([
        box("page", 0, 0, 1200, 800, "section"),
        { ...box("left", 40, 40, 520, 400, "section"), parentId: "page" },
        { ...box("right", 540, 40, 400, 400, "section"), parentId: "page" },
      ]),
    },
    {
      // integrity: clipped text, a child outside its section, broken wires,
      // and a wire walled in by touching boxes.
      name: "integrity",
      document: makeDocument([
        { ...box("wordy", 0, 0, 160, 80, "process"), text: "a label far too long for the box it was given to hold whole" },
        box("group", 0, 200, 300, 200, "section"),
        { ...box("stray", 220, 240, 160, 96, "process"), parentId: "group" },
        box("note", 0, 0, 160, 80, "sticky"),
        { ...box("inside", 100, 600, 160, 80, "process"), text: "" },
        { ...box("outside", 600, 600, 160, 80, "process"), text: "" },
        { ...box("top", 0, 500, 400, 40, "process"), text: "" },
        { ...box("bottom", 0, 800, 400, 40, "process"), text: "" },
        { ...box("left", 0, 540, 40, 260, "process"), text: "" },
        { ...box("right", 360, 540, 40, 260, "process"), text: "" },
      ], [
        connect("loop", "stray", "stray"),
        connect("lost", "stray", "gone"),
        connect("flat", "wordy", "note"),
        connect("escape", "inside", "outside"),
      ]),
    },
  ];
}

function everyDiagnostic(): { rule: string; text: string; source: string }[] {
  const collected: { rule: string; text: string; source: string }[] = [];
  for (const { name, document, context } of fixtures()) {
    for (const rule of FINISHING_RULES) {
      for (const finding of rule.check(document, context)) {
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
