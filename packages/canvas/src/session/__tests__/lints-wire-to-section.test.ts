import { describe, expect, test } from "bun:test";

import { rule as wireToSection } from "../../board/lints/rules/wire-to-section";
import { LAYOUT_RULES } from "../../board/lints";
import { box, connect, makeDocument } from "./synthetic";

/**
 * A wire the agent drew starts at the node that sends and ends at the node
 * that acts. An end on a section's frame names no actor and stops at a
 * border; the page frame is out of scope, and a person's own wires are never
 * judged.
 */

const page = box("page", 0, 0, 2000, 1200, "section");
const review = { ...box("review", 600, 100, 800, 500, "section"), parentId: "page" };
const verifier = { ...box("verifier", 700, 200, 280, 100, "process"), parentId: "review" };
const monitor = { ...box("monitor", 100, 300, 280, 100, "process"), parentId: "page" };
const EMPTY_START = { baseline: makeDocument([]) };

describe("wire-to-section lint", () => {
  test("runs on every edit", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).toContain("wire-to-section");
  });

  test("a wire ending on a section frame warns and names the node fix", () => {
    const document = makeDocument([page, review, verifier, monitor], [connect("cancel", "monitor", "review")]);
    const [finding] = wireToSection.check(document, EMPTY_START);
    expect(finding?.severity).toBe("warning");
    expect(finding?.at).toEqual(["cancel", "review"]);
    expect(finding?.message).toBe("cancel ends on the frame of review: a wire to a frame names no actor");
    expect(finding?.suggestion).toBe(
      "change_connection cancel to end at the node inside review that acts on it; when several nodes do, connect one wire per node",
    );
  });

  test("a wire starting on a section frame warns on that end", () => {
    const document = makeDocument([page, review, verifier, monitor], [connect("usage", "review", "monitor")]);
    expect(wireToSection.check(document, EMPTY_START).map((finding) => finding.message)).toEqual([
      "usage starts on the frame of review: a wire to a frame names no actor",
    ]);
  });

  test("a wire between nodes, and a wire anchored on the page frame, are quiet", () => {
    const document = makeDocument(
      [page, review, verifier, monitor],
      [connect("cancel", "monitor", "verifier"), connect("stray", "monitor", "page")],
    );
    expect(wireToSection.check(document, EMPTY_START)).toEqual([]);
  });

  test("a person's unchanged wire is never judged, but one the agent re-ends is", () => {
    const theirs = makeDocument([page, review, verifier, monitor], [connect("cancel", "monitor", "review")]);
    expect(wireToSection.check(theirs, { baseline: theirs })).toEqual([]);
    expect(wireToSection.check(theirs, {})).toEqual([]);
    const reEnded = makeDocument([page, review, verifier, monitor], [connect("cancel", "verifier", "review")]);
    expect(wireToSection.check(reEnded, { baseline: theirs })).toHaveLength(1);
  });
});
