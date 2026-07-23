/**
 * v5 Phase-B context wiring gate: the style-guide loader injects every
 * registered style topic; the board-state loader renders the spawn snapshot
 * (or its fallback line); the layout-editor context sidecar assembles the
 * three tagged blocks in declaration order; and the kernel config registers
 * all three custom loaders.
 */
import { describe, expect, test } from "bun:test";

import type { LoadedMap, SpawnContext } from "@agent-kernel/kernel/context";

import { STYLE_TOPICS } from "../src/styles";
import {
  formatStyleGuide,
  styleGuideLoader,
} from "../src/harness/loaders/style-guide";
import {
  BOARD_STATE_FALLBACK,
  boardStateLoader,
} from "../src/harness/loaders/board-state";
import { context as layoutEditorContext } from "../src/harness/agent-catalog/layout-editor/context";

const RESOLVE_CTX = { cwd: "/" };

function loadedInput(kind: string, content: string): LoadedMap[number] {
  return {
    decl: { kind },
    status: "ok",
    content,
    bytes: Buffer.byteLength(content, "utf8"),
    hash: "",
    fromCache: false,
  };
}

describe("style-guide loader", () => {
  test("output contains every topic title as a heading, in order", async () => {
    const result = await styleGuideLoader.resolve({ kind: "style-guide" }, RESOLVE_CTX);
    expect(result.status).toBe("ok");
    let cursor = -1;
    for (const topic of STYLE_TOPICS) {
      const at = result.content.indexOf(`## ${topic.title}`);
      expect(at, topic.id).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  test("output contains every topic's prose verbatim", async () => {
    const result = await styleGuideLoader.resolve({ kind: "style-guide" }, RESOLVE_CTX);
    for (const topic of STYLE_TOPICS) {
      expect(result.content, topic.id).toContain(topic.prose);
    }
  });

  test("is static: no sessionData involved, same bytes every resolve", async () => {
    const a = await styleGuideLoader.resolve({ kind: "style-guide" }, RESOLVE_CTX);
    const b = await styleGuideLoader.resolve(
      { kind: "style-guide" },
      { cwd: "/elsewhere", sessionData: { boardState: "ignored" } },
    );
    expect(a.content).toBe(b.content);
    expect(a.content).toBe(formatStyleGuide());
  });
});

describe("board-state loader", () => {
  test("renders sessionData.boardState verbatim", async () => {
    const boardState = "FRAME 0,0 2752x1744\nNODES\n- seed-idle rectangle …\nLINTS · clean";
    const result = await boardStateLoader.resolve(
      { kind: "board-state" },
      { cwd: "/", sessionData: { boardState } },
    );
    expect(result.status).toBe("ok");
    expect(result.content).toBe(boardState);
  });

  test("falls back to the pointer line when the snapshot is absent or empty", async () => {
    const absent = await boardStateLoader.resolve({ kind: "board-state" }, { cwd: "/" });
    expect(absent.content).toBe(BOARD_STATE_FALLBACK);

    const empty = await boardStateLoader.resolve(
      { kind: "board-state" },
      { cwd: "/", sessionData: { boardState: "" } },
    );
    expect(empty.content).toBe(BOARD_STATE_FALLBACK);

    const wrongType = await boardStateLoader.resolve(
      { kind: "board-state" },
      { cwd: "/", sessionData: { boardState: 42 } },
    );
    expect(wrongType.content).toBe(BOARD_STATE_FALLBACK);
  });
});

describe("layout-editor context sidecar", () => {
  test("declares the three loaders in block order", () => {
    expect(layoutEditorContext.loaders.map((decl) => decl.kind)).toEqual([
      "editor-state",
      "style-guide",
      "board-state",
    ]);
  });

  test("assemble wraps each loaded input in its tagged block", async () => {
    const loaded: LoadedMap = [
      loadedInput("editor-state", "canvas: c1 (baseline abc)"),
      loadedInput("style-guide", formatStyleGuide()),
      loadedInput("board-state", BOARD_STATE_FALLBACK),
    ];
    const assembled = await layoutEditorContext.assemble(loaded, {} as SpawnContext);

    expect(assembled).toContain("<editor_state>\ncanvas: c1 (baseline abc)\n</editor_state>");
    expect(assembled).toContain(`<board_state>\n${BOARD_STATE_FALLBACK}\n</board_state>`);
    expect(assembled).toContain("<style_guide>\n");
    for (const topic of STYLE_TOPICS) {
      expect(assembled).toContain(`## ${topic.title}`);
    }
    // Block order matches declaration order.
    expect(assembled.indexOf("<editor_state>")).toBeLessThan(assembled.indexOf("<style_guide>"));
    expect(assembled.indexOf("<style_guide>")).toBeLessThan(assembled.indexOf("<board_state>"));
  });

  test("assemble keeps an empty input's block as an empty tag pair", async () => {
    const loaded: LoadedMap = [loadedInput("editor-state", "")];
    const assembled = await layoutEditorContext.assemble(loaded, {} as SpawnContext);
    expect(assembled).toContain("<editor_state>\n</editor_state>");
  });
});

describe("kernel loader registration", () => {
  test("kernel.ts registers all three custom loaders", () => {
    // createLayoutKernel wires `loaders: [editorStateLoader, styleGuideLoader,
    // boardStateLoader]`; booting a kernel here would touch trace.db, so this
    // gate reads the wiring statically.
    const source = require("node:fs").readFileSync(
      require("node:path").join(import.meta.dir, "..", "src", "harness", "kernel.ts"),
      "utf8",
    ) as string;
    expect(source).toContain("loaders: [editorStateLoader, styleGuideLoader, boardStateLoader]");
  });
});
