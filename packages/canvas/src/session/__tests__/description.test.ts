import { describe, expect, test } from "bun:test";

import { formatBoardDescription } from "../snapshots/board-state";
import { formatBoardDigest } from "../../board/digest";
import { boardStateSnapshot } from "../snapshots/context";
import { boardDiffBlock, lookPerception } from "../perception/perception";
import { emitSessionEvent } from "../session";
import { toolDescribeBoard } from "../tools";
import { makeTestSession } from "./helpers";
import { box, makeDocument } from "./synthetic";

describe("describe_board", () => {
  test("replaces the description verbatim and emits the mutating-operation event pair", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"], { proposalCount: 4 });
    const description = "  # Flow\n\nAlpha → beta.\n";

    const result = toolDescribeBoard(session, { description }, emitSessionEvent);

    const [applied, delta, lints, ...rest] = result.text.split("\n");
    expect([applied, delta, rest]).toEqual([
      "APPLIED · describe_board",
      `DELTA · description none → ${description.length} chars`,
      [],
    ]);
    // Every edit result carries its lint delta. A description moves no lint.
    expect(lints).toMatch(/^LINTS · (clean|\+0 −0 \(\d+ open\))$/);
    expect(result.details).toEqual({ operation: "describe_board" });
    expect(session.draft.description).toBe(description);
    expect(session.events.map((event) => event.type)).toEqual(["proposal", "delta"]);
    expect(session.events[0]).toEqual({
      type: "proposal",
      sessionId: session.id,
      n: 4,
    });
    expect(session.events[1]).toMatchObject({
      type: "delta",
      sessionId: session.id,
      n: 4,
      delta: "describe_board",
    });
  });

  test("renames and redescribes in one save, one delta line per field", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);

    const result = toolDescribeBoard(
      session,
      { title: " Voice pipeline ", description: "# Voice" },
      emitSessionEvent,
    );

    expect(result.text.split("\n").slice(0, 3)).toEqual([
      "APPLIED · describe_board",
      'DELTA · title "Synthetic" → "Voice pipeline"',
      "DELTA · description none → 7 chars",
    ]);
    expect(session.draft).toMatchObject({ title: "Voice pipeline", description: "# Voice" });
    expect(session.events.map((event) => event.type)).toEqual(["proposal", "delta"]);
  });

  test("reports an exact no-op without emitting events", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    baseline.description = "# Flow";
    const session = makeTestSession(baseline, ["alpha"]);

    const result = toolDescribeBoard(session, { description: "# Flow" }, emitSessionEvent);
    const both = toolDescribeBoard(
      session,
      { title: "Synthetic", description: "# Flow" },
      emitSessionEvent,
    );

    expect(result.text).toBe(
      "NO-OP · describe_board — the board description already reads exactly this.",
    );
    expect(result.isError).toBeUndefined();
    expect(both.text).toBe(
      "NO-OP · describe_board — the board is already called that,"
      + " and the board description already reads exactly this.",
    );
    expect(session.events).toEqual([]);
  });

  test("rejects empty markdown and non-string input without clearing the description", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    baseline.description = "# Flow";
    const session = makeTestSession(baseline, ["alpha"]);

    const whitespace = toolDescribeBoard(session, { description: " \n " }, emitSessionEvent);
    const nonString = toolDescribeBoard(
      session,
      { description: 42 as unknown as string },
      emitSessionEvent,
    );

    expect(whitespace).toEqual({
      isError: true,
      text: "describe_board rejected: description must be a non-empty string.",
    });
    expect(nonString).toEqual(whitespace);
    expect(session.draft.description).toBe("# Flow");
    expect(session.events).toEqual([]);
  });

  test("refuses a call with neither field, and a null field counts as absent", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    baseline.description = "# Flow";
    const session = makeTestSession(baseline, ["alpha"]);
    const before = session.draft;

    const neither = toolDescribeBoard(session, {}, emitSessionEvent);
    const nulls = toolDescribeBoard(session, { title: null, description: null }, emitSessionEvent);
    expect(neither).toEqual({
      isError: true,
      text: "describe_board rejected: send title, description or both.",
    });
    expect(nulls).toEqual(neither);
    expect(session.draft).toBe(before);

    const renamed = toolDescribeBoard(session, { title: "Renamed", description: null }, emitSessionEvent);
    expect(renamed.text).toContain('DELTA · title "Synthetic" → "Renamed"');
    expect(renamed.text).not.toContain("DELTA · description");
    expect(session.draft.description).toBe("# Flow");
  });

  test("a bad field refuses the whole call, so the good one is not saved either", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);
    const before = session.draft;

    const half = toolDescribeBoard(session, { title: "Renamed", description: "  " }, emitSessionEvent);
    const both = toolDescribeBoard(session, { title: " ", description: "" }, emitSessionEvent);

    expect(half).toEqual({
      isError: true,
      text: "describe_board rejected: description must be a non-empty string.",
    });
    expect(both.text).toBe([
      "describe_board rejected:",
      "  - title must be a non-empty string — the board is never left nameless.",
      "  - description must be a non-empty string.",
    ].join("\n"));
    expect(session.draft).toBe(before);
    expect(session.events).toEqual([]);
  });
});

describe("board description perception", () => {
  test("places the delimited description before the digest in the board snapshot", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const markdown = "# Payment flow\n\nAPI → worker";
    baseline.description = markdown;
    const session = makeTestSession(baseline, ["alpha"]);
    const block = [
      "DESCRIPTION · what this board represents, its pieces, and how it reads",
      "---",
      markdown,
      "---",
    ].join("\n");

    const snapshot = boardStateSnapshot(session);

    expect(formatBoardDescription(markdown)).toBe(block);
    expect(snapshot).toContain(`${block}\n\nBOARD ·`);
    // look no longer restates the board; the description rides section ③.
    expect(lookPerception(session).text).not.toContain("DESCRIPTION ·");
    expect(formatBoardDigest(session.draft)).not.toContain("DESCRIPTION");
    expect(formatBoardDigest(session.draft)).not.toContain(markdown);
  });

  test("names absence without adding delimiters", () => {
    expect(formatBoardDescription()).toBe(
      "DESCRIPTION · none — this board has no description yet",
    );
  });

  test("renders description-only changes without model operation classification", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);
    session.draft = { ...baseline, description: "A concise board" };

    expect(boardDiffBlock(session)).toBe(
      "BOARD DIFF · base → draft · 1 op\n  updateDescription  15 chars",
    );
  });
});
