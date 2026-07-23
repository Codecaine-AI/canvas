/**
 * The digest completeness invariant: everything the six op kinds can write is
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
  icon: "rendered",
};

/** Compile-time exhaustive over the connection schema. */
const CONNECTION_FIELD_COVERAGE: Record<keyof InteractiveCanvasConnection, Coverage> = {
  id: "rendered",
  from: "rendered",
  to: "rendered",
  label: "rendered",
  style: "legend",
  arrow: "legend",
  role: "rendered",
  color: "legend",
  waypoints: "rendered",
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

  test("the header legend declares every legend-covered default", () => {
    expect(DIGEST_DEFAULTS_LEGEND).toContain("color gray");
    expect(DIGEST_DEFAULTS_LEGEND).toContain("sticky yellow");
    expect(DIGEST_DEFAULTS_LEGEND).toContain("edge solid gray arrow=forward");
    expect(DIGEST_DEFAULTS_LEGEND).toContain("shape per type");
    const digest = formatBoardDigest(makeDocument([box("solo", 0, 0)]));
    expect(digest).toContain(DIGEST_DEFAULTS_LEGEND);
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
      style: { shape: "chevron" as const },
    };
    const chip = {
      ...box("brain", 240, 64, 96, 96, "icon"),
      parentId: "home",
      icon: "cpu" as const,
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
    expect(digest).toContain("shape=chevron");
    // icon glyph; sticky non-default color + author.
    expect(digest).toContain("icon=cpu");
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
      role: "escalation",
      color: "orange" as const,
      waypoints: [[100, 48], [220, 48]] as Array<[number, number]>,
    };
    const digest = formatBoardDigest(
      makeDocument([box("a", 0, 0), box("b", 320, 0)], [edge]),
    );

    expect(digest).toContain(
      '  flow a→b "handoff" dashed orange arrow=both role="escalation" anchors=right→top pos=auto→0.25,0 wp=100,48→220,48',
    );
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
    // Explicit solid/gray/forward collapse to the bare edge line.
    expect(lines).toContain("  plain a→b —");
  });
});
