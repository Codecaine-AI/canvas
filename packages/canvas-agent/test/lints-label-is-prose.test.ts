import { describe, expect, test } from "bun:test";

import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas/schema";

import { runDiagnostics } from "../src/board/lints/run";
import type { LintContext } from "../src/board/lints/types";
import { rule as labelIsProse } from "../src/board/lints/rules/label-is-prose";
import { box, connect, makeDocument } from "./synthetic";

/**
 * A shape, icon, or section NAME is read at a glance: one line of at most six
 * words and forty characters, with no sentence break. Anything else is prose,
 * and the finding names the measured overrun plus the fix — a short name, one
 * fact in `detail`, the explanation on a sticky. A sticky's markdown body and
 * an edge's label are outside the convention, so neither is scanned.
 */

const RULE = "a name is one line of ≤ 6 words and ≤ 40 chars, no sentences";

/** A box roomy enough that only the name convention, never clipping, is in play. */
function named(
  id: string,
  text: string,
  type: InteractiveCanvasObjectType = "rectangle",
): InteractiveCanvasObject {
  return { ...box(id, 0, 0, 400, 200, type), text };
}

/**
 * A session that started from an empty board: every name on it is one the
 * agent wrote, so the convention itself is what these cases measure.
 * Authorship — a person's own names are never judged — has its own cases below.
 */
const AGENT_WROTE_EVERYTHING: LintContext = { baseline: makeDocument([]) };

function check(document: InteractiveCanvasDocument) {
  return labelIsProse.check(document, AGENT_WROTE_EVERYTHING);
}

describe("label-is-prose lint", () => {
  test("declares its warning face and states the limits in guidance", () => {
    expect(labelIsProse.id).toBe("label-is-prose");
    expect(labelIsProse.title).toBe("Prose in a name");
    expect(labelIsProse.tier).toBe("warning");
    expect(labelIsProse.guidance).toContain("runs past 6 words or 40 characters");
  });

  test("a prose name warns at the object's rect with the three-part fix", () => {
    const shape = {
      ...box("s01-db", 40, 60, 240, 120, "process"),
      text: "Postgres database that stores every user session",
    };

    expect(check(makeDocument([shape]))).toEqual([{
      rule: "label-is-prose",
      severity: "warning",
      at: ["s01-db"],
      where: { x: 40, y: 60, width: 240, height: 120 },
      message: `s01-db's name has 7 words, 48 chars — ${RULE}`,
      suggestion:
        "update_text s01-db with a short name and one fact in detail (≤ 48 chars); "
        + "put the explanation on a sticky beside it with place_sticky",
    }]);
  });

  test("names every measured overrun: words, chars, a sentence break, a line break", () => {
    const findings = check(makeDocument([
      named("spawn", "Spawn Sub Agent to Research Each Query"),
      named("i18n", "Internationalization configuration service"),
      named("auth", "Auth service. Retries twice."),
      named("agent", "canvas-agent\nport 4820"),
      named("db", "Postgres database that stores user sessions.\nIt is the source of truth."),
    ]));

    expect(findings.map((finding) => finding.message)).toEqual([
      `spawn's name has 7 words — ${RULE}`,
      `i18n's name has 42 chars — ${RULE}`,
      `auth's name has 2 sentences — ${RULE}`,
      `agent's name has a line break — ${RULE}`,
      `db's name has 12 words, 71 chars, 2 sentences, a line break — ${RULE}`,
    ]);
  });

  test("section titles and icon labels are names too", () => {
    const section = {
      ...box("page-frame", 0, 0, 960, 640, "section"),
      text: "Intent Classifier Example: Support Ticket Classification",
    };
    const icon = {
      ...box("history", 80, 120, 96, 96, "icon"),
      icon: "documents" as const,
      text: "Past Messages in Chain (And Message Classifications)",
      parentId: "page-frame",
    };
    const findings = check(makeDocument([section, icon]));

    expect(findings.map(({ at, where, message }) => ({ at, where, message }))).toEqual([
      { at: ["page-frame"], where: section.geometry, message: `page-frame's name has 56 chars — ${RULE}` },
      { at: ["history"], where: icon.geometry, message: `history's name has 7 words, 52 chars — ${RULE}` },
    ]);
  });

  test("a name at the limits is clean, and the name lint never reads the detail", () => {
    // Exactly 6 words and 40 chars, carrying a detail that is itself prose.
    const atLimit = {
      ...named("scorer", "Score each inbound customer record daily"),
      detail: "Handles auth. Retries 3 times on failure, then gives up.",
    };

    expect(check(makeDocument([
      atLimit,
      named("db", "Postgres"),
      named("empty", ""),
      named("blank", "  \n "),
    ]))).toEqual([]);
  });

  test("abbreviations, dotted names, and separators are not sentence breaks or words", () => {
    // A sentence break needs a capital after the stop, and a "·" is not a word:
    // these are names, and flagging them would teach the agent to mangle them.
    expect(check(makeDocument([
      named("runtime", "Node.js 22 runtime"),
      named("example", "e.g. ports and paths"),
      named("latency", "approx. 5 ms budget"),
      named("version", "v1.2 build"),
      named("surfaces", "api · db · ui · cli · sdk · docs"),
    ]))).toEqual([]);
  });

  test("sticky bodies and edge labels are out of scope: only the shape's copy of the prose fires", () => {
    const prose = "Postgres database that stores user sessions. It is the source of truth.";
    const document = makeDocument(
      [
        named("shape", prose),
        { ...box("note", 480, 0, 240, 240, "sticky"), text: prose },
        box("left", 0, 400),
        box("right", 480, 400),
      ],
      [{ ...connect("edge", "left", "right"), label: prose }],
    );

    expect(check(document).map((finding) => finding.at)).toEqual([["shape"]]);
  });

  test("authorship: a person's unchanged name never fires; one the agent created or rewrote does", () => {
    const prose = "Compare Generated Intents to Labeled Intents";
    const theirs = named("theirs", prose);
    const baseline = makeDocument([theirs]);
    const judged = (draft: InteractiveCanvasDocument) =>
      labelIsProse.check(draft, { baseline }).map((finding) => finding.at[0]);

    // The board as the person left it: their long name is theirs to keep.
    expect(judged(baseline)).toEqual([]);
    // The same words on an object the agent created are the agent's.
    const mine = { ...named("mine", prose), geometry: { x: 0, y: 400, width: 400, height: 200 } };
    expect(judged(makeDocument([theirs, mine]))).toEqual(["mine"]);
    // A name the agent rewrote is the agent's, even on the person's object.
    expect(judged(makeDocument([{ ...theirs, text: `${prose} again` }]))).toEqual(["theirs"]);
    // Touching only the detail does not make the person's name the agent's.
    expect(judged(makeDocument([{ ...theirs, detail: "v2" }]))).toEqual([]);
    // With no starting board nothing is attributable to the agent.
    expect(labelIsProse.check(makeDocument([named("mine", prose)]))).toEqual([]);
  });

  test("the default diagnostics roster reports a prose name as a warning", () => {
    const document = makeDocument([named("spawn", "Spawn Sub Agent to Research Each Query")]);

    expect(runDiagnostics(document, undefined, AGENT_WROTE_EVERYTHING)).toContainEqual(expect.objectContaining({
      id: "W1",
      rule: "label-is-prose",
      at: ["spawn"],
    }));
  });
});
