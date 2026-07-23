import { describe, expect, test } from "bun:test";
import type { InteractiveCanvasAnnotation } from "@codecaine-ai/canvas/schema";

import { formatBoardDigest } from "../src/board/digest";
import {
  childrenOf,
  kindOf,
  pageFrameOf,
  siblingsOf,
} from "../src/board/helpers";
import { formatDiagnostics, runDiagnostics } from "../src/board/lints/run";
import {
  DIAGNOSTICS_TEXT_SNAPSHOTS,
  DIGEST_TEXT_SNAPSHOTS,
} from "./digest-characterization";
import {
  box,
  characterizationDocuments,
  connect,
  makeDocument,
} from "./synthetic";

describe("real document helpers", () => {
  test("discriminates kinds and reads membership without copying objects", () => {
    const section = box("section", 0, 0, 480, 320, "section");
    const child = { ...box("child", 64, 96), parentId: "section" };
    const sticky = { ...box("note", 64, 400, 160, 160, "sticky"), parentId: null };
    const marker = box("marker", 300, 400, 32, 32, "annotation-marker");
    const document = makeDocument([section, child, sticky, marker]);

    expect(document.objects.map(kindOf)).toEqual([
      "section",
      "node",
      "sticky",
      "annotationish",
    ]);
    expect(document.objects.find((object) => object.id === "child")).toMatchObject({
      parentId: "section",
      geometry: { x: 64, y: 96, width: 160, height: 96 },
      text: "child",
    });
    expect(childrenOf(document, "section")[0]).toBe(child);
  });

  test("finds the locked background section itself, preferring the root", () => {
    const nested = {
      ...box("nested-frame", 32, 32, 320, 240, "section"),
      locked: "background" as const,
      parentId: "page",
    };
    const page = {
      ...box("page", 0, 0, 640, 480, "section"),
      locked: "background" as const,
    };
    const document = makeDocument([nested, page]);
    expect(pageFrameOf(document)).toBe(page);
    expect(pageFrameOf(document)?.geometry).toEqual({ x: 0, y: 0, width: 640, height: 480 });

    const frameless = makeDocument([box("plain", 0, 0, 480, 320, "section")]);
    expect(pageFrameOf(frameless)).toBeNull();
  });

  test("children and siblings follow stored membership and normalize nullish roots", () => {
    const section = box("section", 0, 0, 640, 480, "section");
    const a = { ...box("a", 32, 96), parentId: "section" };
    const b = { ...box("b", 240, 96), parentId: "section" };
    const sticky = { ...box("note", 448, 96, 160, 160, "sticky"), parentId: "section" };
    const marker = { ...box("marker", 608, 96, 32, 32, "annotation-marker"), parentId: "section" };
    const outside = { ...box("outside", 900, 0), parentId: undefined };
    const document = makeDocument([section, a, b, sticky, marker, outside]);

    expect(childrenOf(document, "section").map((object) => object.id)).toEqual([
      "a",
      "b",
      "note",
      "marker",
    ]);
    expect(siblingsOf(document, "a").map((object) => object.id)).toEqual(["b"]);
    expect(siblingsOf(document, "outside").map((object) => object.id)).toEqual(["section"]);
    expect(siblingsOf(document, "missing")).toEqual([]);
  });
});

describe("formatBoardDigest", () => {
  test("renders the nested tree with implicit containment and a global EDGES block", () => {
    const page = {
      ...box("page", 0, 0, 640, 480, "section"),
      text: "Page frame",
      locked: "background" as const,
    };
    const inner = {
      ...box("inner", 32, 64, 320, 240, "section"),
      text: "Inner",
      color: "blue" as const,
      parentId: "page",
    };
    const task = {
      ...box("task", 64, 128, 184, 96, "process"),
      text: "Do the thing",
      color: "teal" as const,
      parentId: "inner",
    };
    const sticky = {
      ...box("note", 400, 64, 160, 160, "sticky"),
      text: "Remember this",
      parentId: "page",
    };
    const edge = {
      ...connect("task-note", "task", "note"),
      label: "see",
      style: "dashed" as const,
    };
    const digest = formatBoardDigest(makeDocument([page, inner, task, sticky], [edge]));

    expect(digest.startsWith("BOARD  # indent = containment")).toBe(true);
    expect(digest).toContain('  page section "Page frame" 0,0 640×480 locked=background');
    expect(digest).toContain('    inner section "Inner" blue 32,64 320×240');
    expect(digest).toContain('      task process "Do the thing" teal 64,128 184×96');
    expect(digest).toContain('    note sticky "Remember this" 400,64 160×160');
    expect(digest).toContain('EDGES\n  task-note task→note "see" dashed');
  });

  test("elides declared defaults but renders every set non-default field", () => {
    const edge = {
      ...connect("alpha-beta", "alpha", "beta"),
      label: "next",
      style: "dashed" as const,
      color: "red" as const,
      role: "escalation",
      from: { objectId: "alpha", anchor: "right" as const },
      to: { objectId: "beta", anchor: "top" as const, position: [0.5, 0] as [number, number] },
      waypoints: [[10, 20], [40, 20]] as Array<[number, number]>,
    };
    const shape = {
      ...box("alpha", 0, 0, 160, 96, "arrow-shape"),
      direction: "left" as const,
      style: { shape: "chevron" as const },
    };
    const sticky = {
      ...box("beta", 320, 0, 176, 128, "sticky"),
      color: "yellow" as const,
      author: "Ford",
    };
    const digest = formatBoardDigest(makeDocument([shape, sticky], [edge]));

    expect(digest).toContain(
      "  alpha arrow-shape \"alpha\" 0,0 160×96 shape=chevron dir=left",
    );
    // Explicit default color (sticky yellow) is elided; author renders.
    expect(digest).toContain('  beta sticky "beta" 320,0 176×128 author="Ford"');
    expect(digest).toContain(
      '  alpha-beta alpha→beta "next" dashed red role="escalation" anchors=right→top pos=auto→0.5,0 wp=10,20→40,20',
    );
  });

  test("keeps annotations OUT of the digest — they belong to user_requests", () => {
    const document = makeDocument(
      [box("task", 0, 0), box("other", 320, 0)],
      [connect("task-other", "task", "other")],
    );
    document.annotations = [
      {
        id: "comment-task",
        target: { kind: "object", objectId: "task" },
        intent: "note",
        status: "open",
        body: "Keep this as the entry point",
        createdBy: "human",
      },
    ] satisfies InteractiveCanvasAnnotation[];

    const digest = formatBoardDigest(document);
    expect(digest).not.toContain("comment-task");
    expect(digest).not.toContain("ANNOTATIONS");
    expect(digest).not.toContain("Keep this as the entry point");
  });

  test("renders placeholders for an empty board and a frameless board", () => {
    const frameless = formatBoardDigest(makeDocument([box("only", 0, 0)]));
    expect(frameless).toContain("BOARD · no locked frame");
    expect(frameless).toContain('  only rectangle "only" 0,0 160×96');
    expect(frameless).toContain("EDGES\n  (none)");

    const empty = formatBoardDigest(makeDocument([]));
    expect(empty).toContain("  (no objects)");
  });

  test("marks an empty section explicitly", () => {
    const digest = formatBoardDigest(makeDocument([
      { ...box("solo", 0, 0, 480, 320, "section"), text: "Solo" },
    ]));
    expect(digest).toContain('  solo section "Solo" 0,0 480×320\n    (empty)');
  });

  test("clips long text with a visible elided-length marker", () => {
    const digest = formatBoardDigest(makeDocument([
      { ...box("wordy", 0, 0), text: `multi\nline ${"x".repeat(200)}` },
    ]));
    expect(digest).toContain("multi line");
    expect(digest).toMatch(/…\(\+\d+ch\)/);
    expect(digest).not.toContain("x".repeat(100));
  });
});

describe("digest characterization", () => {
  test("digest text is byte-for-byte identical for every representative document", () => {
    const actual = Object.fromEntries(
      characterizationDocuments().map(({ name, document }) => [
        name,
        formatBoardDigest(document),
      ]),
    );
    expect(actual).toEqual(DIGEST_TEXT_SNAPSHOTS);
  });

  test("full formatted diagnostics text is identical for the same documents", () => {
    const actual = Object.fromEntries(
      characterizationDocuments().map(({ name, document }) => [
        name,
        formatDiagnostics(runDiagnostics(document)),
      ]),
    );
    expect(actual).toEqual(DIAGNOSTICS_TEXT_SNAPSHOTS);
  });
});
