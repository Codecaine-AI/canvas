/**
 * The digest completeness invariant: everything the op surface can write is
 * either RENDERED by the digest when set to a non-default value, covered by
 * the header's elided-defaults LEGEND, or represented STRUCTURALLY (parentId
 * as tree indentation). The coverage maps below are compile-time exhaustive
 * over the real schema types — adding an op-writable field without teaching
 * the digest breaks this file at tsc time, and the runtime assertions prove
 * each rendered field actually shows up in the text.
 */
import { describe, expect, test } from "bun:test";
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";
import type { CanvasConnectionEndpoint } from "../../canvas/src/state/schema/connections";

import { DIGEST_DEFAULTS_LEGEND, formatBoardDigest } from "../src/board/digest";
import { formatStateGrammar } from "../src/catalog/layout-editor/context/state-grammar";
import { box, connect, makeDocument } from "./synthetic";

type Coverage = "rendered" | "legend" | "structural";

/** Compile-time exhaustive over the object schema (tsc fails on a new field). */
const OBJECT_FIELD_COVERAGE: Record<keyof InteractiveCanvasObject, Coverage> = {
  id: "rendered",
  type: "rendered",
  text: "rendered",
  color: "legend", // rendered when non-default; default declared in the legend
  parentId: "structural", // containment = tree indentation
  geometry: "rendered",
  style: "legend", // shape= rendered when non-default; default declared per type
  layout: "rendered",
  locked: "rendered",
  direction: "rendered",
  author: "rendered",
  icon: "rendered", // folded INTO the type column — `memory`, not `icon icon=memory`
};

/** Compile-time exhaustive over the connection schema. */
const CONNECTION_FIELD_COVERAGE: Record<keyof InteractiveCanvasConnection, Coverage> = {
  id: "rendered",
  from: "rendered",
  to: "rendered",
  label: "rendered",
  style: "legend",
  arrow: "legend",
  color: "legend",
  waypoints: "rendered",
  labelPosition: "rendered", // lp=<along>[@<offset>]; absent = routed midpoint
};

/** Compile-time exhaustive over connection endpoints. */
const ENDPOINT_FIELD_COVERAGE: Record<keyof CanvasConnectionEndpoint, Coverage> = {
  objectId: "rendered",
  anchor: "rendered",
  position: "rendered",
};

describe("digest completeness invariant", () => {
  test("every op-writable field is classified (compile-time) and the maps stay honest", () => {
    const classifications = [
      ...Object.values(OBJECT_FIELD_COVERAGE),
      ...Object.values(CONNECTION_FIELD_COVERAGE),
      ...Object.values(ENDPOINT_FIELD_COVERAGE),
    ];
    expect(classifications.every((value) =>
      value === "rendered" || value === "legend" || value === "structural")).toBe(true);
  });

  test("the declared legend covers every legend-covered default and ships in the state grammar", () => {
    expect(DIGEST_DEFAULTS_LEGEND).toContain("color gray");
    expect(DIGEST_DEFAULTS_LEGEND).toContain("sticky yellow");
    expect(DIGEST_DEFAULTS_LEGEND).toContain("edge solid gray arrow=forward");
    expect(DIGEST_DEFAULTS_LEGEND).toContain("shape per type");
    // The digest itself carries bare values; the legend's one home is the
    // <state_grammar> context block, which quotes the constant verbatim.
    const digest = formatBoardDigest(makeDocument([box("solo", 0, 0)]));
    expect(digest).not.toContain(DIGEST_DEFAULTS_LEGEND);
    expect(formatStateGrammar()).toContain(DIGEST_DEFAULTS_LEGEND);
  });

  test("every rendered object field appears in the digest when set non-default", () => {
    const section = {
      ...box("home", 0, 0, 640, 480, "section"),
      text: "Home",
      locked: "all" as const,
      layout: { mode: "row" as const, padding: 16, gap: 8 },
    };
    const shape = {
      ...box("pointer", 32, 64, 160, 96, "arrow-shape"),
      parentId: "home",
      color: "violet" as const,
      direction: "left" as const,
      style: { shape: "diamond" as const },
    };
    const chip = {
      ...box("brain", 240, 64, 96, 96, "icon"),
      parentId: "home",
      icon: "model" as const,
    };
    const sticky = {
      ...box("memo", 400, 64, 176, 128, "sticky"),
      parentId: "home",
      color: "pink" as const,
      author: "Ford",
    };
    const digest = formatBoardDigest(makeDocument([section, shape, chip, sticky]));

    // id + type + text + geometry: the base line grammar.
    expect(digest).toContain('  home section "Home" 0,0 640×480');
    // locked, layout (mode + pad + gap).
    expect(digest).toContain("locked=all");
    expect(digest).toContain("layout=row,pad=16,gap=8");
    // parentId → indentation (structural).
    expect(digest).toContain('\n    pointer arrow-shape');
    // color (non-default), direction, non-default style.shape.
    expect(digest).toContain("violet");
    expect(digest).toContain("dir=left");
    expect(digest).toContain("shape=diamond");
    // The glyph IS the type column, so the split never shows: no bare `icon`
    // type and no `icon=` extra beside it. Sticky non-default color + author.
    expect(digest).toContain('brain model "brain" 240,64 96×96');
    expect(digest).not.toContain("icon=");
    expect(digest).not.toContain(" icon ");
    expect(digest).toContain("pink");
    expect(digest).toContain('author="Ford"');
  });

  test("every rendered connection field appears in the digest when set non-default", () => {
    const edge = {
      ...connect("flow", "a", "b"),
      from: { objectId: "a", anchor: "right" as const },
      to: {
        objectId: "b",
        anchor: "top" as const,
        position: [0.25, 0] as [number, number],
      },
      label: "handoff",
      style: "dashed" as const,
      arrow: "both" as const,
      color: "orange" as const,
      waypoints: [[100, 48], [220, 48]] as Array<[number, number]>,
      labelPosition: { along: 0.25, offset: -12 },
    };
    const digest = formatBoardDigest(
      makeDocument([box("a", 0, 0), box("b", 320, 0)], [edge]),
    );

    expect(digest).toContain(
      '  flow a→b "handoff" dashed orange arrow=both anchors=right→top pos=auto→0.25,0 wp=100,48→220,48 lp=0.25@-12',
    );
  });

  test("a label pin with no offset prints bare; an absent pin prints nothing", () => {
    const pinned = { ...connect("pin", "a", "b"), label: "x", labelPosition: { along: 0.8 } };
    const plain = { ...connect("plain", "a", "b"), label: "x" };
    const digest = formatBoardDigest(
      makeDocument([box("a", 0, 0), box("b", 320, 0)], [pinned, plain]),
    );
    expect(digest).toContain("lp=0.8");
    expect(digest).not.toContain("lp=0.8@");
    expect(digest.split("\n").find((line) => line.includes(" plain "))).not.toContain("lp=");
  });

  test("text fields render in full — nothing is truncated", () => {
    const longText = `alpha ${"x".repeat(300)} omega`;
    const longLabel = `route ${"y".repeat(200)} end`;
    const digest = formatBoardDigest(makeDocument(
      [
        { ...box("wordy", 0, 0), text: `multi\n${longText}` },
        { ...box("scribe", 320, 0, 176, 128, "sticky"), author: `Ford ${"a".repeat(80)}` },
      ],
      [{ ...connect("edge", "wordy", "scribe"), label: longLabel }],
    ));

    // Whitespace collapses to one line, but every character survives.
    expect(digest).toContain(`multi ${longText}`);
    expect(digest).toContain(longLabel);
    expect(digest).toContain(`Ford ${"a".repeat(80)}`);
    expect(digest).not.toMatch(/…\(\+\d+ch\)/);
  });

  test("explicit default values are elided (lossless via the legend)", () => {
    const edge = {
      ...connect("plain", "a", "b"),
      style: "solid" as const,
      color: "gray" as const,
      arrow: "forward" as const,
    };
    const digest = formatBoardDigest(
      makeDocument(
        [
          { ...box("a", 0, 0), color: "gray" as const },
          { ...box("b", 320, 0, 176, 128, "sticky"), color: "yellow" as const },
        ],
        [edge],
      ),
    );
    const lines = digest.split("\n");
    expect(lines).toContain('  a rectangle "a" 0,0 160×96');
    expect(lines).toContain('  b sticky "b" 320,0 176×128');
    // Explicit solid/gray/forward collapse to the bare edge line; everything
    // after the ` · ` is the derived numbered route, not a stored field.
    const plainLine = lines.find((line) => line.startsWith("  plain "))!;
    expect(plainLine.split(" · ")[0]).toBe("  plain a→b —");
    expect(plainLine.split(" · ")[1]).toBe(
      "a ─(s0 h y=48)→ ─(s1 h y=48)→ (s2 v x=240) ─(s3 h y=64)→ ─(s4 h y=64)→ b",
    );
  });
});
