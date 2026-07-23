/**
 * Context wiring gate: the style-guide loader injects every registered style
 * topic; the board-state and user-requests loaders render their spawn
 * snapshots (or fallback lines); the layout-editor context sidecar assembles
 * the four tagged blocks in declaration order; and the kernel config
 * registers all four custom loaders.
 */
import { describe, expect, test } from "bun:test";

import type { LoadedMap, SpawnContext } from "@agent-kernel/kernel/context";

import { STYLE_TOPICS } from "../src/agent/styles";
import {
  formatStyleGuide,
  styleGuideLoader,
} from "../src/agent/loaders/style-guide";
import {
  BOARD_STATE_FALLBACK,
  boardStateLoader,
} from "../src/agent/loaders/board-state";
import {
  USER_REQUESTS_EMPTY,
  formatUserRequests,
  userRequestsLoader,
} from "../src/agent/loaders/user-requests";
import { context as layoutEditorContext } from "../src/agent/catalog/layout-editor/context";

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

describe("user-requests loader", () => {
  test("renders sessionData.userRequests verbatim and falls back when absent", async () => {
    const userRequests = formatUserRequests([
      {
        id: "req-1",
        target: { kind: "object", objectId: "task" },
        intent: "agent-request",
        status: "open",
        body: "Split this into two steps",
      },
    ]);
    const present = await userRequestsLoader.resolve(
      { kind: "user-requests" },
      { cwd: "/", sessionData: { userRequests } },
    );
    expect(present.status).toBe("ok");
    expect(present.content).toBe(userRequests);

    const absent = await userRequestsLoader.resolve({ kind: "user-requests" }, { cwd: "/" });
    expect(absent.content).toBe(USER_REQUESTS_EMPTY);
  });

  test("formats every target kind, defaults status to open, and marks the empty queue", () => {
    const text = formatUserRequests([
      {
        id: "on-object",
        target: { kind: "object", objectId: "task" },
        intent: "note",
        status: "open",
        body: "Keep this as the entry point",
      },
      {
        id: "on-edge",
        target: { kind: "connection", connectionId: "task-other" },
        intent: "agent-request",
        status: "applied",
        body: "Make the relationship clearer",
      },
      {
        id: "on-region",
        target: { kind: "region", region: { x: 12, y: 34, width: 200, height: 120 } },
        intent: "agent-request",
        body: "Use this area for outcomes",
      },
    ]);
    expect(text).toContain("read-only — respond by editing board content");
    expect(text).toContain('  on-object  object:task  note/open  "Keep this as the entry point"');
    expect(text).toContain(
      '  on-edge  connection:task-other  agent-request/applied  "Make the relationship clearer"',
    );
    expect(text).toContain(
      '  on-region  region:12,34 200×120  agent-request/open  "Use this area for outcomes"',
    );
    expect(formatUserRequests([])).toBe(USER_REQUESTS_EMPTY);
  });
});

describe("layout-editor context sidecar", () => {
  test("declares the four loaders in block order", () => {
    expect(layoutEditorContext.loaders.map((decl) => decl.kind)).toEqual([
      "editor-state",
      "user-requests",
      "style-guide",
      "board-state",
    ]);
  });

  test("assemble wraps each loaded input in its tagged block", async () => {
    const loaded: LoadedMap = [
      loadedInput("editor-state", "canvas: c1 (baseline abc)"),
      loadedInput("user-requests", USER_REQUESTS_EMPTY),
      loadedInput("style-guide", formatStyleGuide()),
      loadedInput("board-state", BOARD_STATE_FALLBACK),
    ];
    const assembled = await layoutEditorContext.assemble(loaded, {} as SpawnContext);

    expect(assembled).toContain("<editor_state>\ncanvas: c1 (baseline abc)\n</editor_state>");
    expect(assembled).toContain(`<user_requests>\n${USER_REQUESTS_EMPTY}\n</user_requests>`);
    expect(assembled).toContain(`<board_state>\n${BOARD_STATE_FALLBACK}\n</board_state>`);
    expect(assembled).toContain("<style_guide>\n");
    for (const topic of STYLE_TOPICS) {
      expect(assembled).toContain(`## ${topic.title}`);
    }
    // Block order matches declaration order.
    expect(assembled.indexOf("<editor_state>")).toBeLessThan(assembled.indexOf("<user_requests>"));
    expect(assembled.indexOf("<user_requests>")).toBeLessThan(assembled.indexOf("<style_guide>"));
    expect(assembled.indexOf("<style_guide>")).toBeLessThan(assembled.indexOf("<board_state>"));
  });

  test("assemble keeps an empty input's block as an empty tag pair", async () => {
    const loaded: LoadedMap = [loadedInput("editor-state", "")];
    const assembled = await layoutEditorContext.assemble(loaded, {} as SpawnContext);
    expect(assembled).toContain("<editor_state>\n</editor_state>");
  });
});

describe("kernel loader registration", () => {
  test("kernel.ts registers all four custom loaders", () => {
    // Booting a kernel here would touch trace.db, so this gate reads the
    // wiring statically.
    const source = require("node:fs").readFileSync(
      require("node:path").join(import.meta.dir, "..", "src", "service", "kernel.ts"),
      "utf8",
    ) as string;
    expect(source).toContain(
      "loaders: [editorStateLoader, userRequestsLoader, styleGuideLoader, boardStateLoader]",
    );
  });
});
