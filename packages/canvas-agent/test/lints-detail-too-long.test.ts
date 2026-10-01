import { describe, expect, test } from "bun:test";

import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
  InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas/schema";

import { runDiagnostics } from "../src/board/lints/run";
import type { LintContext } from "../src/board/lints/types";
import { rule as detailTooLong } from "../src/board/lints/rules/detail-too-long";
import { box, makeDocument } from "./synthetic";

/**
 * A detail is ONE short fact under a name — a port, path, version, model, or
 * host — on one line of at most 48 characters. A longer detail, a second
 * sentence, or a line break is more than one fact, and the finding names the
 * measured overrun plus the fix: cut it to one fact, the rest on a sticky.
 * Stickies carry no detail line, so they are never scanned.
 */

const RULE = "a detail is one fact on one line, ≤ 48 chars";

/** A box roomy enough that only the detail convention, never clipping, is in play. */
function detailed(
  id: string,
  detail: string,
  type: InteractiveCanvasObjectType = "rectangle",
): InteractiveCanvasObject {
  return { ...box(id, 0, 0, 400, 200, type), detail };
}

/**
 * A session that started from an empty board: every detail on it is one the
 * agent wrote, so the convention itself is what these cases measure.
 * Authorship — a person's own details are never judged — has its own cases below.
 */
const AGENT_WROTE_EVERYTHING: LintContext = { baseline: makeDocument([]) };

function check(document: InteractiveCanvasDocument) {
  return detailTooLong.check(document, AGENT_WROTE_EVERYTHING);
}

describe("detail-too-long lint", () => {
  test("declares its warning face and states the limit in guidance", () => {
    expect(detailTooLong.id).toBe("detail-too-long");
    expect(detailTooLong.title).toBe("Overlong detail");
    expect(detailTooLong.tier).toBe("warning");
    expect(detailTooLong.guidance).toContain("48 characters, holds more than one sentence");
  });

  test("an overlong detail warns at the object's rect with the fix", () => {
    const shape = {
      ...box("s01-db", 40, 60, 240, 120, "process"),
      text: "Postgres",
      detail: "Handles auth. Retries 3 times on failure.",
    };

    expect(check(makeDocument([shape]))).toEqual([{
      rule: "detail-too-long",
      severity: "warning",
      at: ["s01-db"],
      where: { x: 40, y: 60, width: 240, height: 120 },
      message: `s01-db's detail has 2 sentences — ${RULE}`,
      suggestion:
        "cut the detail to one fact with update_text s01-db (detail ≤ 48 chars); "
        + "move the rest onto a sticky beside it with place_sticky",
    }]);
  });

  test("names every measured overrun: chars, a second sentence, a line break", () => {
    const findings = check(makeDocument([
      detailed("store", "Primary store for sessions, carts, and audit logs"),
      detailed("auth", "Handles auth. Retries 3 times."),
      detailed("db", "16\n:5432"),
      detailed("worker", "Handles auth.\nRetries 3 times on failure, then gives up."),
    ]));

    expect(findings.map((finding) => finding.message)).toEqual([
      `store's detail has 49 chars — ${RULE}`,
      `auth's detail has 2 sentences — ${RULE}`,
      `db's detail has a line break — ${RULE}`,
      `worker's detail has 56 chars, 2 sentences, a line break — ${RULE}`,
    ]);
  });

  test("a section's header detail and an icon's detail are scanned", () => {
    const section = {
      ...box("services", 0, 0, 960, 640, "section"),
      text: "Bun services",
      detail: "Session store for carts, logins, and audit trails",
    };
    const icon = {
      ...box("cache", 80, 120, 96, 96, "icon"),
      icon: "memory" as const,
      text: "Cache",
      detail: "Warm reads. Cold writes.",
      parentId: "services",
    };
    const findings = check(makeDocument([section, icon]));

    expect(findings.map(({ at, where, message }) => ({ at, where, message }))).toEqual([
      { at: ["services"], where: section.geometry, message: `services's detail has 49 chars — ${RULE}` },
      { at: ["cache"], where: icon.geometry, message: `cache's detail has 2 sentences — ${RULE}` },
    ]);
  });

  test("one fact at the limit is clean, and the detail lint never reads the name", () => {
    // Exactly 48 chars under a name that is itself prose.
    const atLimit = {
      ...detailed("db", "eu-central-1 · 3 replicas · 64 GiB · 30s timeout"),
      text: "Postgres database that stores user sessions. It is the source of truth.",
    };

    expect(check(makeDocument([
      atLimit,
      detailed("short", "16 · :5432"),
      detailed("empty", ""),
      detailed("blank", " \n "),
      box("plain", 0, 0),
    ]))).toEqual([]);
  });

  test("a sticky is never scanned: only the shape's copy of the detail fires", () => {
    const detail = "Handles auth. Retries 3 times on failure, then gives up.";
    const document = makeDocument([
      detailed("shape", detail),
      { ...box("note", 480, 0, 240, 240, "sticky"), detail },
    ]);

    expect(check(document).map((finding) => finding.at)).toEqual([["shape"]]);
  });

  test("authorship: a person's unchanged detail never fires; one the agent created or rewrote does", () => {
    const prose = "Handles auth. Retries 3 times on failure, then gives up.";
    const theirs = detailed("theirs", prose);
    const baseline = makeDocument([theirs]);
    const judged = (draft: InteractiveCanvasDocument) =>
      detailTooLong.check(draft, { baseline }).map((finding) => finding.at[0]);

    // The board as the person left it: their detail is theirs to keep.
    expect(judged(baseline)).toEqual([]);
    // The same detail on an object the agent created is the agent's.
    const mine = { ...detailed("mine", prose), geometry: { x: 0, y: 400, width: 400, height: 200 } };
    expect(judged(makeDocument([theirs, mine]))).toEqual(["mine"]);
    // A detail the agent rewrote is the agent's, even on the person's object.
    expect(judged(makeDocument([{ ...theirs, detail: `${prose} Twice.` }]))).toEqual(["theirs"]);
    // Renaming the object does not make the person's detail the agent's.
    expect(judged(makeDocument([{ ...theirs, text: "Auth" }]))).toEqual([]);
    // With no starting board nothing is attributable to the agent.
    expect(detailTooLong.check(makeDocument([detailed("mine", prose)]))).toEqual([]);
  });

  test("the default diagnostics roster reports an overlong detail as a warning", () => {
    const document = makeDocument([detailed("auth", "Handles auth. Retries 3 times.")]);

    expect(runDiagnostics(document, undefined, AGENT_WROTE_EVERYTHING)).toContainEqual(expect.objectContaining({
      id: "W1",
      rule: "detail-too-long",
      at: ["auth"],
    }));
  });
});
