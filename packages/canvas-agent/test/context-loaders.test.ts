/**
 * Context wiring gate: the style-guide and capabilities loaders inject their
 * static corpora; the board-state and user-requests loaders render their
 * spawn snapshots (or fallback lines); the layout-editor context sidecar
 * assembles the five tagged blocks in declaration order and appends a caption
 * line naming the delivered boot images; and the kernel config registers all
 * five custom loaders.
 */
import { describe, expect, test } from "bun:test";

import type { LoadedMap, SpawnContext } from "@agent-kernel/kernel/context";

import {
  CRAFT_TARGETS,
  STYLE_TOPICS,
  type CraftTargets,
} from "../src/agent/styles";
import {
  formatCraftTargets,
  formatStyleGuide,
  styleGuideLoader,
} from "../src/agent/loaders/style-guide";
import {
  BOARD_STATE_FALLBACK,
  boardStateLoader,
} from "../src/agent/loaders/board-state";
import {
  USER_REQUESTS_EMPTY,
  formatRequestQueue,
  userRequestsLoader,
  type RequestQueueEntry,
} from "../src/agent/loaders/user-requests";
import { formatCapabilities } from "../src/agent/loaders/capabilities";
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
  test("output opens with the framing line, then a blank line", async () => {
    const result = await styleGuideLoader.resolve({ kind: "style-guide" }, RESOLVE_CTX);
    expect(result.status).toBe("ok");
    expect(result.content.startsWith(
      "The house style preferences: deliberate defaults for visual judgment, not laws.\n\n",
    )).toBe(true);
    expect(formatStyleGuide().startsWith(
      "The house style preferences: deliberate defaults for visual judgment, not laws.\n\n",
    )).toBe(true);
  });

  test("output renders every topic as its own tagged block, in order", async () => {
    const result = await styleGuideLoader.resolve({ kind: "style-guide" }, RESOLVE_CTX);
    expect(result.status).toBe("ok");
    let cursor = -1;
    for (const topic of STYLE_TOPICS) {
      const tag = topic.id.replaceAll("-", "_");
      const at = result.content.indexOf(`<${tag}>`);
      expect(at, topic.id).toBeGreaterThan(cursor);
      expect(result.content, topic.id).toContain(`</${tag}>`);
      cursor = at;
    }
  });

  test("output contains every topic's prose, indented inside its block", async () => {
    const result = await styleGuideLoader.resolve({ kind: "style-guide" }, RESOLVE_CTX);
    for (const topic of STYLE_TOPICS) {
      for (const line of topic.prose.split("\n")) {
        if (line.length === 0) continue;
        expect(result.content, topic.id).toContain(`    ${line}`);
      }
    }
  });

  test("output carries a craft-targets block after the prose topics", async () => {
    const result = await styleGuideLoader.resolve({ kind: "style-guide" }, RESOLVE_CTX);
    const aestheticClose = result.content.indexOf("</aesthetic>");
    const craftOpen = result.content.indexOf("<craft_targets>");
    const craftClose = result.content.indexOf("</craft_targets>");

    expect(craftOpen).toBeGreaterThan(aestheticClose);
    expect(craftClose).toBeGreaterThan(craftOpen);
  });

  test("craft targets open with their framing and distinguish targets from lint floors", async () => {
    const result = await styleGuideLoader.resolve({ kind: "style-guide" }, RESOLVE_CTX);
    expect(result.content).toContain(
      "<craft_targets>\n    Targets, not minimums to shave toward:",
    );
    expect(result.content).toContain(
      "The lints mark the clearance below which a board breaks",
    );
  });

  test("output carries every craft-target number", async () => {
    const result = await styleGuideLoader.resolve({ kind: "style-guide" }, RESOLVE_CTX);
    const craft = result.content.match(
      /<craft_targets>\n([\s\S]*?)\n<\/craft_targets>/,
    )?.[1];
    expect(craft).toBeDefined();
    for (const renderedTarget of [
      "288×96",
      "224",
      "144 across a row",
      "96 down a column",
      "144 side by side",
      "160 between stacked rows",
      "48 inside every frame",
      "2–3 nodes",
      "7×",
      "15% ink",
    ]) {
      expect(craft).toContain(renderedTarget);
    }
  });

  test("craft-target lines use the topic block indentation convention", () => {
    const craft = formatStyleGuide().match(
      /<craft_targets>\n([\s\S]*?)\n<\/craft_targets>/,
    )?.[1];
    const indented = formatCraftTargets()
      .split("\n")
      .map((line) => (line.length > 0 ? `    ${line}` : line))
      .join("\n");
    expect(craft).toBe(indented);
  });

  test("formatCraftTargets respects a complete custom target set", () => {
    const customTargets: CraftTargets = {
      ...CRAFT_TARGETS,
      nodeWidth: 333,
      inkShare: 0.23,
    };
    const rendered = formatCraftTargets(customTargets);

    expect(rendered).toContain("flow node: 333×96");
    expect(rendered).toContain("23% ink");
    expect(rendered).not.toContain("288×96");
    expect(rendered).not.toContain("15% ink");
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
    const userRequests = formatRequestQueue([
      {
        alias: "R1",
        annotationId: "req-1",
        target: { kind: "object", objectId: "task" },
        intent: "agent-request",
        status: "open",
        body: "Split this into two steps",
        createdBy: "human",
        replies: [],
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

  test("formats every target kind and status, and marks the empty queue", () => {
    const entries: RequestQueueEntry[] = [
      {
        alias: "R1",
        annotationId: "on-object",
        target: { kind: "object", objectId: "task" },
        intent: "note",
        status: "open",
        body: "Keep this as the entry point",
        createdBy: "human",
        replies: [],
      },
      {
        alias: "R2",
        annotationId: "on-edge",
        target: { kind: "connection", connectionId: "task-other" },
        intent: "agent-request",
        status: "done",
        body: "Make the relationship clearer",
        note: "relabeled the edge",
        createdBy: "human",
        replies: [],
      },
      {
        alias: "R3",
        annotationId: "on-region",
        target: { kind: "region", region: { x: 12, y: 34, width: 200, height: 120 } },
        intent: "agent-request",
        status: "declined",
        body: "Use this area for outcomes",
        note: "area is reserved for the legend",
        createdBy: "human",
        replies: [],
      },
      {
        alias: "R4",
        annotationId: "on-region-2",
        target: { kind: "region", region: { x: 400, y: 34, width: 200, height: 120 } },
        intent: "agent-request",
        status: "open",
        body: "Add an  outcomes\nlist here",
        createdBy: "human",
        replies: [],
      },
    ];
    const text = formatRequestQueue(entries);
    expect(text).toContain("resolve_request");
    expect(text).toContain('  R1 open  object:task  human — "Keep this as the entry point"');
    // Disposed entries carry the note, not the body.
    expect(text).toContain('  R2 done "relabeled the edge"');
    expect(text).toContain('  R3 declined "area is reserved for the legend"');
    // Region targets render their rect; whitespace collapses but nothing is elided.
    expect(text).toContain(
      '  R4 open  region:400,34 200×120  human — "Add an outcomes list here"',
    );
    expect(formatRequestQueue([])).toBe(USER_REQUESTS_EMPTY);
  });

  test("renders an open thread as author-labeled turns, oldest first", () => {
    const text = formatRequestQueue([
      {
        alias: "R1",
        annotationId: "on-object",
        target: { kind: "object", objectId: "task" },
        intent: "agent-request",
        status: "open",
        body: "Split this into two steps",
        createdBy: "human",
        replies: [
          { id: "reply-1", author: "agent", body: "Which two?" },
          { id: "reply-2", author: "human", body: "prep  and\nrun" },
        ],
      },
    ]);

    expect(text).toContain('  R1 open  object:task  human — "Split this into two steps"');
    expect(text).toContain('      ↳ agent — "Which two?"');
    expect(text).toContain('      ↳ human — "prep and run"');
  });

  test("labels a thread the agent opened by its author", () => {
    const text = formatRequestQueue([
      {
        alias: "R1",
        annotationId: "asked",
        target: { kind: "object", objectId: "task" },
        intent: "agent-request",
        status: "open",
        body: "Is this the retry path?",
        createdBy: "agent",
        replies: [],
      },
    ]);

    expect(text).toContain('  R1 open  object:task  agent — "Is this the retry path?"');
  });
});

describe("layout-editor context sidecar", () => {
  test("declares the five loaders in block order", () => {
    expect(layoutEditorContext.loaders.map((decl) => decl.kind)).toEqual([
      "editor-state",
      "user-requests",
      "capabilities",
      "style-guide",
      "board-state",
    ]);
  });

  test("assemble wraps each loaded input in its tagged block", async () => {
    const loaded: LoadedMap = [
      loadedInput("editor-state", "canvas: c1 (baseline abc)"),
      loadedInput("user-requests", USER_REQUESTS_EMPTY),
      loadedInput("capabilities", formatCapabilities()),
      loadedInput("style-guide", formatStyleGuide()),
      loadedInput("board-state", BOARD_STATE_FALLBACK),
    ];
    const assembled = await layoutEditorContext.assemble(loaded, {} as SpawnContext);

    const indented = (text: string): string => text
      .split("\n")
      .map((line) => (line.length > 0 ? `    ${line}` : line))
      .join("\n");
    expect(assembled).toContain("<editor_state>\n    canvas: c1 (baseline abc)\n</editor_state>");
    expect(assembled).toContain(`<user_requests>\n${indented(USER_REQUESTS_EMPTY)}\n</user_requests>`);
    expect(assembled).toContain(`<board_state>\n${indented(BOARD_STATE_FALLBACK)}\n</board_state>`);
    expect(assembled).toContain(`<capabilities>\n${indented(formatCapabilities())}\n</capabilities>`);
    expect(assembled).toContain("<style_guide>\n");
    for (const topic of STYLE_TOPICS) {
      expect(assembled).toContain(`<${topic.id.replaceAll("-", "_")}>`);
    }
    // Block order matches declaration order.
    expect(assembled.indexOf("<editor_state>")).toBeLessThan(assembled.indexOf("<user_requests>"));
    expect(assembled.indexOf("<user_requests>")).toBeLessThan(assembled.indexOf("<capabilities>"));
    expect(assembled.indexOf("<capabilities>")).toBeLessThan(assembled.indexOf("<style_guide>"));
    expect(assembled.indexOf("<style_guide>")).toBeLessThan(assembled.indexOf("<board_state>"));
  });

  test("assemble keeps an empty input's block as an empty tag pair", async () => {
    const loaded: LoadedMap = [loadedInput("editor-state", "")];
    const assembled = await layoutEditorContext.assemble(loaded, {} as SpawnContext);
    expect(assembled).toContain("<editor_state>\n</editor_state>");
  });

  test("assembleImages returns board-then-exemplar as image/png blocks", async () => {
    const ctx = {
      sessionData: {
        bootImages: { board: "Qk9BUkQ=", exemplar: "RVhFTVBMQVI=" },
      },
    } as unknown as SpawnContext;

    const images = await layoutEditorContext.assembleImages!([], ctx);

    expect(images).toEqual([
      { data: "Qk9BUkQ=", mimeType: "image/png" },
      { data: "RVhFTVBMQVI=", mimeType: "image/png" },
    ]);
  });

  test("assembleImages skips missing payloads and degrades to text-only", async () => {
    // No sessionData at all.
    expect(await layoutEditorContext.assembleImages!([], {} as SpawnContext)).toEqual([]);
    // sessionData without bootImages.
    expect(await layoutEditorContext.assembleImages!(
      [],
      { sessionData: { boardState: "BOARD" } } as unknown as SpawnContext,
    )).toEqual([]);
    // A failed board render: only the exemplar rides along.
    expect(await layoutEditorContext.assembleImages!(
      [],
      { sessionData: { bootImages: { exemplar: "RVhFTVBMQVI=" } } } as unknown as SpawnContext,
    )).toEqual([{ data: "RVhFTVBMQVI=", mimeType: "image/png" }]);
    // Empty strings and wrong types never become image blocks.
    expect(await layoutEditorContext.assembleImages!(
      [],
      { sessionData: { bootImages: { board: "", exemplar: 7 } } } as unknown as SpawnContext,
    )).toEqual([]);
  });

  test("assemble appends the caption line for both images, after the blocks", async () => {
    const loaded: LoadedMap = [loadedInput("board-state", BOARD_STATE_FALLBACK)];
    const ctx = {
      sessionData: { bootImages: { board: "Qk9BUkQ=", exemplar: "RVhFTVBMQVI=" } },
    } as unknown as SpawnContext;

    const assembled = await layoutEditorContext.assemble(loaded, ctx);

    expect(assembled.endsWith(
      "\n\nimages attached: (1) the current full-board render, "
      + "(2) a finished board in the house style — a taste reference, not this board",
    )).toBe(true);
    // The blocks themselves are untouched.
    expect(assembled).toContain(`<board_state>\n    ${BOARD_STATE_FALLBACK}\n</board_state>`);
    // Caption count matches the images assembleImages delivers for the same ctx.
    const images = await layoutEditorContext.assembleImages!([], ctx);
    expect(images.length).toBe(2);
  });

  test("caption numbering follows delivery order when one image is missing", async () => {
    const loaded: LoadedMap = [loadedInput("board-state", BOARD_STATE_FALLBACK)];

    const boardOnly = {
      sessionData: { bootImages: { board: "Qk9BUkQ=" } },
    } as unknown as SpawnContext;
    const boardText = await layoutEditorContext.assemble(loaded, boardOnly);
    expect(boardText.endsWith(
      "\n\nimages attached: (1) the current full-board render",
    )).toBe(true);
    expect((await layoutEditorContext.assembleImages!([], boardOnly)).length).toBe(1);

    const exemplarOnly = {
      sessionData: { bootImages: { exemplar: "RVhFTVBMQVI=" } },
    } as unknown as SpawnContext;
    const exemplarText = await layoutEditorContext.assemble(loaded, exemplarOnly);
    expect(exemplarText.endsWith(
      "\n\nimages attached: (1) a finished board in the house style — "
      + "a taste reference, not this board",
    )).toBe(true);
    expect((await layoutEditorContext.assembleImages!([], exemplarOnly)).length).toBe(1);
  });

  test("assemble omits the caption line whenever no image is delivered", async () => {
    const loaded: LoadedMap = [loadedInput("board-state", BOARD_STATE_FALLBACK)];
    const bare = await layoutEditorContext.assemble(loaded, {} as SpawnContext);
    expect(bare).toBe(`<board_state>\n    ${BOARD_STATE_FALLBACK}\n</board_state>`);

    // Empty strings and wrong types produce no images, so no caption either.
    const junk = {
      sessionData: { bootImages: { board: "", exemplar: 7 } },
    } as unknown as SpawnContext;
    expect(await layoutEditorContext.assemble(loaded, junk)).toBe(bare);
    expect(await layoutEditorContext.assembleImages!([], junk)).toEqual([]);
  });
});

describe("kernel loader registration", () => {
  test("kernel.ts registers all five custom loaders", () => {
    // Booting a kernel here would touch trace.db, so this gate reads the
    // wiring statically.
    const source = require("node:fs").readFileSync(
      require("node:path").join(import.meta.dir, "..", "src", "service", "kernel.ts"),
      "utf8",
    ) as string;
    const loadersEntry = source.match(/loaders: \[[^\]]*\]/);
    expect(loadersEntry).not.toBeNull();
    for (const loader of [
      "editorStateLoader",
      "userRequestsLoader",
      "capabilitiesLoader",
      "styleGuideLoader",
      "boardStateLoader",
    ]) {
      expect(loadersEntry![0], loader).toContain(loader);
    }
  });
});
