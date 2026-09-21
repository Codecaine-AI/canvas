/**
 * Section ② wiring gate: design guidance and operating references appear as
 * named context blocks; the quality checklist stays in the system prompt.
 *
 * The board-state / editor-state / user-requests loaders retired when the
 * layout-editor's state/ sidecar took over the working picture, so what remains of
 * them here is their formatters, which section ③ now renders through.
 */
import { describe, expect, test } from "bun:test";

import type { LoadedMap, SpawnContext } from "@agent-kernel/kernel/context";

import {
  CRAFT_TARGETS,
  STYLE_TOPICS,
  type CraftTargets,
} from "../src/catalog/layout-editor/context/style-guide";
import {
  formatCraftTargets,
  formatStyleGuide,
  styleGuideLoader,
} from "../src/service/loaders/style-guide";
import {
  USER_REQUESTS_EMPTY,
  formatRequestQueue,
  type RequestQueueEntry,
} from "../src/service/session/snapshots/user-requests";
import {
  formatStateGrammar,
  stateGrammarLoader,
} from "../src/service/loaders/state-grammar";
import {
  DIGEST_DEFAULTS_LEGEND,
  DIGEST_GRAMMAR,
  DIGEST_ROUTE_LEGEND,
} from "../src/board/digest";
import { FINISHING_RULES, LAYOUT_RULES } from "../src/board/lints";
import { context as layoutEditorContext } from "../src/catalog/layout-editor/context";
import { canvasAuthoringTopics, formatAuthoringTopic } from "../src/authoring";
import { authoringLoaders } from "../src/service/loaders/authoring";
import { OBJECT_PREFERENCES } from "../../canvas/src/objects/registry";
import { VISUAL_PATTERNS } from "../src/authoring";

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
      "<craft_targets>\n    Starting dimensions for local peer groups",
    );
    expect(result.content).toContain(
      "section sizes and counts follow meaning",
    );
  });

  test("output carries every craft-target number", async () => {
    const result = await styleGuideLoader.resolve({ kind: "style-guide" }, RESOLVE_CTX);
    const craft = result.content.match(
      /<craft_targets>\n([\s\S]*?)\n<\/craft_targets>/,
    )?.[1];
    expect(craft).toBeDefined();
    for (const renderedTarget of [
      "280×100",
      "240",
      "140 across a row",
      "100 down a column",
      "140 side by side",
      "160 between stacked rows",
      "40 inside every frame",
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
      nodeWidth: 340,
      arrowCorridor: 120,
    };
    const rendered = formatCraftTargets(customTargets);

    expect(rendered).toContain("flow node: 340×100");
    expect(rendered).toContain("arrow corridor: 120");
    expect(rendered).not.toContain("280×100");
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

describe("state-grammar loader", () => {
  test("quotes the digest line grammars verbatim — the key cannot drift", async () => {
    const result = await stateGrammarLoader.resolve({ kind: "state-grammar" }, RESOLVE_CTX);
    expect(result.status).toBe("ok");
    expect(result.content).toContain(DIGEST_GRAMMAR);
    expect(result.content).toContain(DIGEST_DEFAULTS_LEGEND);
    expect(result.content).toContain(DIGEST_ROUTE_LEGEND);
  });

  test("names the full lint roster from the registry, finishing rules included", () => {
    const content = formatStateGrammar();
    for (const rule of FINISHING_RULES) {
      expect(content, rule.id).toContain(rule.id);
    }
    expect(content).toContain(
      `always-on rules: ${LAYOUT_RULES.map((rule) => rule.id).join(", ")}`,
    );
  });

  test("keys every state child and the two result families", () => {
    const content = formatStateGrammar();
    for (const tag of [
      "board",
      "recent_ops",
      "diff",
      "lints",
      "requests",
      "views",
      "recent_conversation",
      "results",
      "look",
    ]) {
      expect(content, tag).toContain(`<${tag}>`);
      expect(content, tag).toContain(`</${tag}>`);
    }
  });

  test("keys the result headers and the edge extras", () => {
    const content = formatStateGrammar();
    for (const header of [
      "APPLIED ·",
      "- DELTA\n",
      "LINTS · +new −resolved",
      "- ROUTES\n",
      "REQUESTS · none | k/n disposed",
      "NO-OP ·",
      "DIAGNOSTICS",
      "MEASURES ·",
      "LOOK ·",
    ]) {
      expect(content, header).toContain(header);
    }
    expect(content).toContain("lp=along[@offset]");
    expect(content).toContain("author=");
    expect(content).not.toContain(" icon,");
  });

  test("is static: same bytes every resolve", async () => {
    const a = await stateGrammarLoader.resolve({ kind: "state-grammar" }, RESOLVE_CTX);
    const b = await stateGrammarLoader.resolve(
      { kind: "state-grammar" },
      { cwd: "/elsewhere", sessionData: { boardState: "ignored" } },
    );
    expect(a.content).toBe(b.content);
    expect(a.content).toBe(formatStateGrammar());
  });
});

describe("request queue rendering", () => {
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
    expect(text).toContain('R1 open  object:task  human — "Keep this as the entry point"');
    // Disposed entries carry the note, not the body.
    expect(text).toContain('R2 done "relabeled the edge"');
    expect(text).toContain('R3 declined "area is reserved for the legend"');
    // Region targets render their rect; whitespace collapses but nothing is elided.
    expect(text).toContain(
      'R4 open  region:400,34 200×120  human — "Add an outcomes list here"',
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

    expect(text).toContain('R1 open  object:task  human — "Split this into two steps"');
    expect(text).toContain('    ↳ agent — "Which two?"');
    expect(text).toContain('    ↳ human — "prep and run"');
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

    expect(text).toContain('R1 open  object:task  agent — "Is this the retry path?"');
  });
});

const CONTACT_SHEET_CAPTION =
  "the board vocabulary — every object type, icon glyph, and color rendered and labeled,"
  + " plus the connection arrows and styles; the visual reference for everything the board"
  + " can draw";
const EXEMPLAR_CAPTION =
  "a finished board in the house style — a taste reference, not this board";

describe("layout-editor context sidecar", () => {
  test("declares design before operating references without the system quality checklist", () => {
    // The working-picture loaders retired: board / editor / requests are
    // rendered fresh into section ③ by state/, never pinned here.
    expect(layoutEditorContext.loaders.map((decl) => decl.kind)).toEqual([
      ...authoringLoaders.map(loader => loader.kind),
      "state-grammar",
    ]);
  });

  test("internal context receives exactly the shared authoring topic bytes", async () => {
    const topics = canvasAuthoringTopics();
    const loaded = await Promise.all(authoringLoaders.map(async loader => {
      const result = await loader.resolve({ kind: loader.kind }, RESOLVE_CTX);
      expect(result.status).toBe("ok");
      return loadedInput(loader.kind, result.content);
    }));
    const assembled = await layoutEditorContext.assemble(loaded, {} as SpawnContext);
    for (const topic of topics) expect(assembled).toContain(formatAuthoringTopic(topic));
    expect(assembled).not.toContain("<core_philosophy>");
    expect(assembled).not.toContain("<depth_assessment>");
    expect(assembled).not.toContain("Diagrams should ARGUE, not DISPLAY.");
    expect(assembled).not.toContain("<quality_checklist>");
    expect(assembled).not.toContain("Quality checklist.");
  });

  test("the complete context resolves catalogs once without draft placeholders or the old style guide", async () => {
    const registry = [...authoringLoaders, stateGrammarLoader];
    const loaded = await Promise.all(layoutEditorContext.loaders.map(async decl => {
      const loader = registry.find(entry => entry.kind === decl.kind)!;
      const result = await loader.resolve(decl, RESOLVE_CTX);
      return loadedInput(decl.kind, result.content);
    }));
    const assembled = await layoutEditorContext.assemble(loaded, {} as SpawnContext);
    for (const entry of OBJECT_PREFERENCES) {
      expect(assembled.split(`- ${entry.name} (`)).toHaveLength(2);
    }
    for (const pattern of VISUAL_PATTERNS) {
      expect(assembled.split(`<pattern id="${pattern.id}"`)).toHaveLength(2);
    }
    expect(assembled).not.toContain("<capabilities>");
    expect(assembled).not.toContain("<gestures>");
    expect(assembled).not.toContain("<include ");
    expect(assembled).not.toContain("<style_guide>");
    expect(assembled).toContain("<creation_defaults>");
    expect(assembled).toContain("<spacing_targets>");
    expect(assembled).toContain("<level_1_summary_flow>");
  });

  test("assemble wraps each loaded input in its tagged block", async () => {
    const loaded: LoadedMap = [
      loadedInput("canvas-diagram-design", canvasAuthoringTopics()[0]!.text),
      loadedInput("state-grammar", formatStateGrammar()),
    ];
    const assembled = await layoutEditorContext.assemble(loaded, {} as SpawnContext);

    const indented = (text: string): string => text
      .split("\n")
      .map((line) => (line.length > 0 ? `    ${line}` : line))
      .join("\n");
    expect(assembled).toContain(`<diagram_design>\n${indented(canvasAuthoringTopics()[0]!.text)}\n</diagram_design>`);
    expect(assembled).toContain(`<state_grammar>\n${indented(formatStateGrammar())}\n</state_grammar>`);
    expect(assembled).not.toContain("<style_guide>");
    // Block order matches declaration order.
    expect(assembled.indexOf("<diagram_design>")).toBeLessThan(assembled.indexOf("<state_grammar>"));
    // Nothing that moved to the state side is emitted here any more.
    expect(assembled).not.toContain("<board_state>");
    expect(assembled).not.toContain("<editor_state>");
    expect(assembled).not.toContain("<user_requests>");
  });

  test("assemble keeps an empty input's block as an empty tag pair", async () => {
    const loaded: LoadedMap = [loadedInput("state-grammar", "")];
    const assembled = await layoutEditorContext.assemble(loaded, {} as SpawnContext);
    expect(assembled).toContain("<state_grammar>\n</state_grammar>");
  });

  test("assembleImages returns exemplar-then-contact-sheet as image/png blocks", async () => {
    const ctx = {
      sessionData: {
        bootImages: { exemplar: "RVhFTVBMQVI=", contactSheet: "U0hFRVQ=" },
      },
    } as unknown as SpawnContext;

    const images = await layoutEditorContext.assembleImages!([], ctx);

    expect(images).toEqual([
      { data: "RVhFTVBMQVI=", mimeType: "image/png" },
      { data: "U0hFRVQ=", mimeType: "image/png" },
    ]);
  });

  test("a board payload is never delivered as a context image", async () => {
    // Working picture rides section ③ from the eager session render; even if a
    // stale caller put one here it must not become a pinned context image.
    const images = await layoutEditorContext.assembleImages!(
      [],
      { sessionData: { bootImages: { board: "Qk9BUkQ=" } } } as unknown as SpawnContext,
    );
    expect(images).toEqual([]);
  });

  test("assembleImages skips missing payloads and degrades to text-only", async () => {
    // No sessionData at all.
    expect(await layoutEditorContext.assembleImages!([], {} as SpawnContext)).toEqual([]);
    // sessionData without bootImages.
    expect(await layoutEditorContext.assembleImages!(
      [],
      { sessionData: { boardState: "BOARD" } } as unknown as SpawnContext,
    )).toEqual([]);
    // A missing contact sheet: only the exemplar rides along.
    expect(await layoutEditorContext.assembleImages!(
      [],
      { sessionData: { bootImages: { exemplar: "RVhFTVBMQVI=" } } } as unknown as SpawnContext,
    )).toEqual([{ data: "RVhFTVBMQVI=", mimeType: "image/png" }]);
    // Empty strings and wrong types never become image blocks.
    expect(await layoutEditorContext.assembleImages!(
      [],
      { sessionData: { bootImages: { exemplar: "", contactSheet: 7 } } } as unknown as SpawnContext,
    )).toEqual([]);
  });

  test("assemble appends the caption line for both images, after the blocks", async () => {
    const loaded: LoadedMap = [loadedInput("state-grammar", "GRAMMAR")];
    const ctx = {
      sessionData: { bootImages: { exemplar: "RVhFTVBMQVI=", contactSheet: "U0hFRVQ=" } },
    } as unknown as SpawnContext;

    const assembled = await layoutEditorContext.assemble(loaded, ctx);

    expect(assembled.endsWith(
      `\n\nimages attached: (1) ${EXEMPLAR_CAPTION}, (2) ${CONTACT_SHEET_CAPTION}`,
    )).toBe(true);
    // The blocks themselves are untouched.
    expect(assembled).toContain("<state_grammar>\n    GRAMMAR\n</state_grammar>");
    // Caption count matches the images assembleImages delivers for the same ctx.
    const images = await layoutEditorContext.assembleImages!([], ctx);
    expect(images.length).toBe(2);
  });

  test("caption numbering follows delivery order when one image is missing", async () => {
    const loaded: LoadedMap = [loadedInput("state-grammar", "GRAMMAR")];

    const sheetOnly = {
      sessionData: { bootImages: { contactSheet: "U0hFRVQ=" } },
    } as unknown as SpawnContext;
    const sheetText = await layoutEditorContext.assemble(loaded, sheetOnly);
    expect(sheetText.endsWith(`\n\nimages attached: (1) ${CONTACT_SHEET_CAPTION}`)).toBe(true);
    expect((await layoutEditorContext.assembleImages!([], sheetOnly)).length).toBe(1);

    const exemplarOnly = {
      sessionData: { bootImages: { exemplar: "RVhFTVBMQVI=" } },
    } as unknown as SpawnContext;
    const exemplarText = await layoutEditorContext.assemble(loaded, exemplarOnly);
    expect(exemplarText.endsWith(`\n\nimages attached: (1) ${EXEMPLAR_CAPTION}`)).toBe(true);
    expect((await layoutEditorContext.assembleImages!([], exemplarOnly)).length).toBe(1);
  });

  test("assemble omits the caption line whenever no image is delivered", async () => {
    const loaded: LoadedMap = [loadedInput("state-grammar", "GRAMMAR")];
    const bare = await layoutEditorContext.assemble(loaded, {} as SpawnContext);
    expect(bare).toBe("<state_grammar>\n    GRAMMAR\n</state_grammar>");

    // Empty strings and wrong types produce no images, so no caption either.
    const junk = {
      sessionData: { bootImages: { exemplar: "", contactSheet: 7 } },
    } as unknown as SpawnContext;
    expect(await layoutEditorContext.assemble(loaded, junk)).toBe(bare);
    expect(await layoutEditorContext.assembleImages!([], junk)).toEqual([]);
  });
});

describe("kernel loader registration", () => {
  test("kernel.ts registers shared design and operating-reference loaders", () => {
    // Booting a kernel here would touch trace.db, so this gate reads the
    // wiring statically.
    const source = require("node:fs").readFileSync(
      require("node:path").join(import.meta.dir, "..", "src", "service", "kernel.ts"),
      "utf8",
    ) as string;
    const loadersEntry = source.match(/loaders: \[[^\]]*\]/);
    expect(loadersEntry).not.toBeNull();
    for (const loader of ["...authoringLoaders", "stateGrammarLoader", "styleGuideLoader"]) {
      expect(loadersEntry![0], loader).toContain(loader);
    }
    for (const retired of [
      "capabilitiesLoader",
      "editorStateLoader",
      "userRequestsLoader",
      "boardStateLoader",
    ]) {
      expect(loadersEntry![0], retired).not.toContain(retired);
    }
  });
});
