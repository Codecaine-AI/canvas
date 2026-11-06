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

import { FINISHING_RULES } from "../../board/lints";
import { operationTools } from "../tools/operations";
import { box, makeDocument } from "./synthetic";

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
