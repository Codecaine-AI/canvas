import { describe, expect, test } from "bun:test";

import { formatBoardDescription } from "../src/service/session/snapshots/board-state";
import { formatBoardDigest } from "../src/board/digest";
import { boardStateSnapshot } from "../src/service/session/snapshots/context";
import { boardDiffBlock, lookPerception } from "../src/service/session/perception/perception";
import { emitSessionEvent } from "../src/service/session/store";
import { toolUpdateDescription } from "../src/service/session/tools";
import { makeTestSession } from "./helpers";
import { box, makeDocument } from "./synthetic";

describe("update_description", () => {
  test("replaces the description verbatim and emits the mutating-operation event pair", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"], { proposalCount: 4 });
    const description = "  # Flow\n\nAlpha → beta.\n";

    const result = toolUpdateDescription(
      session,
      description,
      emitSessionEvent,
    );

    expect(result).toEqual({
      text: [
        "APPLIED · update_description",
        `DELTA · description none → ${description.length} chars`,
      ].join("\n"),
      details: { operation: "update_description" },
    });
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
      delta: "update_description",
    });
  });

  test("reports an exact no-op without emitting events", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    baseline.description = "# Flow";
    const session = makeTestSession(baseline, ["alpha"]);

    const result = toolUpdateDescription(session, "# Flow", emitSessionEvent);

    expect(result.text).toBe(
      "NO-OP · update_description — the board description already reads exactly this.",
    );
    expect(result.isError).toBeUndefined();
    expect(session.events).toEqual([]);
  });

  test("rejects empty markdown and non-string input without clearing the description", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    baseline.description = "# Flow";
    const session = makeTestSession(baseline, ["alpha"]);

    const whitespace = toolUpdateDescription(session, " \n ", emitSessionEvent);
    const nonString = toolUpdateDescription(
      session,
      undefined as unknown as string,
      emitSessionEvent,
    );

    expect(whitespace).toEqual({
      isError: true,
      text: "update_description rejected: description must be a non-empty string.",
    });
    expect(nonString).toEqual(whitespace);
    expect(session.draft.description).toBe("# Flow");
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
