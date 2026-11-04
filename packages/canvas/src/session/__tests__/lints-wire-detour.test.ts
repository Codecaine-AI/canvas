import { describe, expect, test } from "bun:test";

import { rule as wireDetour } from "../../board/lints/rules/wire-detour";
import { LAYOUT_RULES } from "../../board/lints";
import { DEFAULT_CANVAS_STYLE } from "../../theme/canvas-style";
import { box, connect, makeDocument } from "./synthetic";

/**
 * A wire that runs around or through a section owning neither of its ends is
 * a placement fault. The rule judges the drawn route, waypoints included, so
 * the only remedy it names is moving a node or a section.
 */

const CONTEXT = { canvasStyle: DEFAULT_CANVAS_STYLE };

/** Three full-width bands stacked down the page: a wire from top to bottom must pass the middle one. */
function stackedBands() {
  return [
    box("page", 0, 0, 1400, 1300, "section"),
    { ...box("top", 40, 40, 1320, 360, "section"), parentId: "page" },
    { ...box("middle", 40, 460, 1320, 360, "section"), parentId: "page" },
    { ...box("bottom", 40, 880, 1320, 360, "section"), parentId: "page" },
    { ...box("sender", 600, 160, 184, 96, "process"), parentId: "top" },
    { ...box("receiver", 600, 1000, 184, 96, "process"), parentId: "bottom" },
  ];
}

describe("wire-detour lint", () => {
  test("runs on every edit, so connect reports it at once", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).toContain("wire-detour");
  });

  test("a wire routed around the band between its ends is an error that names the band", () => {
    const document = makeDocument(stackedBands(), [connect("skips-a-band", "sender", "receiver")]);
    const findings = wireDetour.check(document, CONTEXT);
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.severity).toBe("error");
    expect(finding?.at).toEqual(["skips-a-band", "middle"]);
    expect(finding?.message).toMatch(/^skips-a-band runs around middle for \d+px \(\d+px of wire for a \d+px direct run\)$/);
    expect(finding?.suggestion).toBe(
      "move receiver beside sender, or set bottom next to top so the wire runs between them; a waypoint cannot clear this",
    );
  });

  test("waypoints that cut through the band swap the detour for a crossing", () => {
    const document = makeDocument(stackedBands(), [
      { ...connect("skips-a-band", "sender", "receiver"), waypoints: [[692, 640]] },
    ]);
    const findings = wireDetour.check(document, CONTEXT);
    expect(findings.map((finding) => finding.at)).toEqual([["skips-a-band", "middle"]]);
    expect(findings[0]?.message).toMatch(/^skips-a-band runs \d+px through middle, which holds neither sender nor receiver$/);
    expect(findings[0]?.suggestion).toBe(
      "move receiver beside sender, or move middle out from between top and bottom; a waypoint cannot clear this",
    );
  });

  test("a wire between neighbouring sections is quiet", () => {
    const document = makeDocument(
      [
        box("page", 0, 0, 1400, 900, "section"),
        { ...box("top", 40, 40, 1320, 360, "section"), parentId: "page" },
        { ...box("bottom", 40, 460, 1320, 360, "section"), parentId: "page" },
        { ...box("sender", 600, 160, 184, 96, "process"), parentId: "top" },
        { ...box("receiver", 600, 600, 184, 96, "process"), parentId: "bottom" },
      ],
      [connect("direct", "sender", "receiver")],
    );
    expect(wireDetour.check(document, CONTEXT)).toEqual([]);
  });

  test("a wire across a two-by-two grid runs through the gutters and is quiet", () => {
    const document = makeDocument(
      [
        box("page", 0, 0, 1500, 1100, "section"),
        { ...box("nw", 40, 40, 640, 460, "section"), parentId: "page" },
        { ...box("ne", 820, 40, 640, 460, "section"), parentId: "page" },
        { ...box("sw", 40, 600, 640, 460, "section"), parentId: "page" },
        { ...box("se", 820, 600, 640, 460, "section"), parentId: "page" },
        { ...box("a", 420, 200, 184, 96, "process"), parentId: "nw" },
        { ...box("b", 900, 760, 184, 96, "process"), parentId: "se" },
        { ...box("filler-ne", 900, 200, 184, 96, "process"), parentId: "ne" },
        { ...box("filler-sw", 420, 760, 184, 96, "process"), parentId: "sw" },
      ],
      [connect("diagonal", "a", "b")],
    );
    expect(wireDetour.check(document, CONTEXT)).toEqual([]);
  });

  test("a wire that leaves its own section to loop back is an error", () => {
    const document = makeDocument(
      [
        box("page", 0, 0, 1400, 700, "section"),
        { ...box("only", 40, 40, 1320, 600, "section"), parentId: "page" },
        { ...box("first", 100, 300, 184, 96, "process"), parentId: "only" },
        { ...box("second", 1100, 300, 184, 96, "process"), parentId: "only" },
      ],
      [{
        id: "loop",
        from: { objectId: "second", anchor: "top" },
        to: { objectId: "first", anchor: "top" },
        waypoints: [[1192, 20], [192, 20]],
      }],
    );
    const findings = wireDetour.check(document, CONTEXT);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/^loop leaves only for \d+px/);
    expect(findings[0]?.suggestion).toBe(
      "move first beside second inside only so the wire stays in its section; a waypoint cannot clear this",
    );
  });

  test("a nested section endpoint is judged through its top-level owner", () => {
    const document = makeDocument(
      [
        box("page", 0, 0, 1400, 900, "section"),
        { ...box("review", 40, 40, 1320, 400, "section"), parentId: "page" },
        { ...box("reviewers", 80, 120, 400, 280, "section"), parentId: "review" },
        { ...box("verify", 40, 500, 1320, 360, "section"), parentId: "page" },
        { ...box("aggregator", 160, 620, 184, 96, "process"), parentId: "verify" },
      ],
      [connect("findings", "reviewers", "aggregator")],
    );
    expect(wireDetour.check(document, CONTEXT)).toEqual([]);
  });

  test("an end that sits directly on the page frame has no owner, so the wire is quiet", () => {
    const document = makeDocument(
      [...stackedBands(), { ...box("loose", 1100, 1000, 184, 96, "process"), parentId: "page" }],
      [connect("to-loose", "sender", "loose")],
    );
    expect(wireDetour.check(document, CONTEXT)).toEqual([]);
  });
});
