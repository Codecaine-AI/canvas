/**
 * The Jev detail check as canvas_check and finalize use it: checkDetailValues
 * on an opened board file, then the finishing lints and finalize. Every Jev
 * call goes to a fake fetch; nothing here touches the network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";

import { FINISHING_RULES, sessionDiagnostics } from "../../lints";
import { toolFinalize } from "../../session/tools/workflow/finalize";
import {
  callToolkitTool,
  checkDetailValues,
  fileDetailCache,
  memoryDetailCache,
  openCanvasFile,
} from "../../toolkit";

await useHarfBuzz();

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const node = (id: string, text: string, detail: string, y: number) => ({
  id,
  type: "icon",
  text,
  detail,
  color: "blue",
  parentId: "s1",
  geometry: { x: 120, y, width: 280, height: 120 },
  style: { shape: "icon" },
  icon: "table",
});

/** A board with one section, a filler detail, a real fact, and one wire between them. */
function boardFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "detail-value-"));
  dirs.push(dir);
  const path = join(dir, "shop.canvas.json");
  writeFileSync(path, JSON.stringify({
    schemaVersion: 1,
    id: "shop",
    title: "Shop checkout",
    mode: "diagram",
    viewport: { x: 0, y: 0, zoom: 1 },
    objects: [
      { id: "page", type: "section", text: "Shop checkout", color: "white", parentId: null, geometry: { x: 0, y: 0, width: 600, height: 700 } },
      { id: "s1", type: "section", text: "Checkout", color: "gray", parentId: "page", geometry: { x: 80, y: 80, width: 400, height: 500 }, style: { shape: "section" } },
      node("pay", "Payment step", "part of checkout", 160),
      node("orders", "Orders table", "status, total_cents", 380),
    ],
    connections: [
      { id: "pay-orders", from: { objectId: "pay", anchor: "bottom" }, to: { objectId: "orders", anchor: "top" }, style: "solid", arrow: "forward" },
    ],
    annotations: [],
  }));
  return path;
}

interface SentQuestion {
  instructions: {
    question: string;
    node: { name: string; detail: string; section: string; wired_to: string[]; wire_labels: string[]; other_details: string[] };
  };
  criteria: Record<string, unknown>;
}

type SentNode = SentQuestion["instructions"]["node"];

/**
 * A fake Jev: answers each question with p(remove) from `pRemove`, by detail
 * text (0 when unlisted) or from the question's node, and records every
 * request body it received.
 */
function fakeJev(
  pRemove: Record<string, number> | ((node: SentNode) => number),
  options: { boardTitle?: string; beforeAnswer?: (call: number) => Promise<void> } = {},
) {
  const bodies: Array<{ model: string; state: { board_title: string; board_notes: string[] }; questions: Record<string, SentQuestion> }> = [];
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    await options.beforeAnswer?.(bodies.length);
    // With `boardTitle`, only questions about that board get p(remove) from `pRemove`.
    const onBoard = options.boardTitle === undefined || body.state.board_title === options.boardTitle;
    const answers = Object.fromEntries(Object.entries(body.questions as Record<string, SentQuestion>).map(([id, question]) => {
      const sent = question.instructions.node;
      const remove = !onBoard ? 0 : typeof pRemove === "function" ? pRemove(sent) : pRemove[sent.detail] ?? 0;
      const choice = remove > 0.5 ? "remove" : "keep";
      return [id, {
        type: "choice",
        choice,
        probabilities: { keep: 1 - remove, remove },
        // Rounded like Jev's own answers (p 0.7 comes back as confidence 0.4, not 0.3999…).
        confidence: Math.round(Math.abs(2 * remove - 1) * 1000) / 1000,
      }];
    }));
    return Response.json({ model: body.model, answers, usage: { input_tokens: 700, output_tokens: 2 } });
  }) as typeof globalThis.fetch;
  return { fetch, bodies };
}

const instant = { wait: async () => {} };
const noSleep = async () => {};

const detailFindings = (file: ReturnType<typeof openCanvasFile>) =>
  sessionDiagnostics(file.session, FINISHING_RULES).filter((diagnostic) => diagnostic.rule === "detail-value");

describe("detail-value", () => {
  test("a detail Jev is sure adds nothing blocks finalize until update_text clears it", async () => {
    const file = openCanvasFile(boardFile());
    const jev = fakeJev({ "part of checkout": 0.95 });
    const cache = memoryDetailCache();

    const line = await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });

    expect(line).toBe("DETAIL · Jev judged 2 node details (2 asked, 0 cached) · 1 to remove (confidence ≥ 0.3) · 700 input tokens");
    // Both questions went in one request, carrying the board, section, and wired neighbors.
    expect(jev.bodies).toHaveLength(1);
    expect(jev.bodies[0]!.state).toEqual({ board_title: "Shop checkout", board_notes: [] });
    const sent = Object.values(jev.bodies[0]!.questions).map((question) => question.instructions.node);
    expect(sent).toContainEqual({
      name: "Payment step",
      detail: "part of checkout",
      section: "Checkout",
      wired_to: ["Orders table"],
      wire_labels: [],
      other_details: ["Orders table: status, total_cents"],
    });
    // `remove` is the default: it is the first option, and the question keeps a detail only for an exact fact.
    const question = Object.values(jev.bodies[0]!.questions)[0]!;
    expect(Object.keys(question.criteria)).toEqual(["remove", "keep"]);
    expect(question.instructions.question).toContain("Answer `remove` when it states no exact fact");
    const remove = question.criteria.remove as { counts_as_remove: string[] };
    expect(remove.counts_as_remove).toContainEqual(expect.stringContaining("what the box does"));

    const findings = detailFindings(file);
    expect(findings.map(({ severity, at, suggestion }) => ({ severity, at, suggestion })))
      .toEqual([{ severity: "error", at: ["pay"], suggestion: 'update_text pay detail ""' }]);
    const blocked = toolFinalize(file.session, "committed", "Tidied the board.", () => {});
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toContain('detail-value: pay\'s detail "part of checkout" adds no fact');

    await callToolkitTool(file, "update_text", { id: "pay", detail: "" });
    expect(detailFindings(file)).toEqual([]);
    expect(toolFinalize(file.session, "committed", "Cleared a filler detail.", () => {}).isError).toBeUndefined();

    // The cleared detail was context for the orders question, so it is asked again once.
    const again = await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });
    expect(again).toBe("DETAIL · Jev judged 1 node detail (1 asked, 0 cached) · 0 to remove (confidence ≥ 0.3) · 700 input tokens");
    // A re-check of the unchanged board asks nothing.
    const third = await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });
    expect(third).toBe("DETAIL · Jev judged 1 node detail (0 asked, 1 cached) · 0 to remove (confidence ≥ 0.3)");
    expect(jev.bodies).toHaveLength(2);
  });

  test("a remove is a finding from p(remove) 0.65, and below it is none", async () => {
    // p(remove) 0.65 is confidence 0.3, the cut; 0.62 is confidence 0.24, under it.
    for (const [pRemove, findings] of [[0.65, 1], [0.62, 0]] as const) {
      const file = openCanvasFile(boardFile());
      const jev = fakeJev({ "part of checkout": pRemove });
      await checkDetailValues(file, { apiKey: "test-key", cache: memoryDetailCache(), fetch: jev.fetch, limiter: instant });
      expect(detailFindings(file)).toHaveLength(findings);
    }
  });

  const failing = (respond: () => Response) => (async () => respond()) as unknown as typeof fetch;
  test.each([
    { name: "no key", apiKey: undefined, fetch: undefined, line: "DETAIL · not checked (TYPESAFE_API_KEY is not set)" },
    { name: "a refused key", apiKey: "bad", fetch: failing(() => new Response("{}", { status: 401 })), line: "DETAIL · not checked (Jev HTTP 401)" },
    { name: "a malformed answer", apiKey: "test-key", fetch: failing(() => Response.json({ model: "jev-1.14.0", answers: {}, usage: { input_tokens: 1, output_tokens: 0 } })), line: "DETAIL · not checked (invalid Jev response envelope)" },
    { name: "a network that stays down", apiKey: "test-key", fetch: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch, line: "DETAIL · not checked (Jev network request failed after 4 attempts)" },
  ])("$name: one not-checked line and no finding", async ({ apiKey, fetch, line }) => {
    const file = openCanvasFile(boardFile());
    expect(await checkDetailValues(file, { apiKey, cache: memoryDetailCache(), fetch, limiter: instant, sleep: noSleep })).toBe(line);
    expect(detailFindings(file)).toEqual([]);
  });

  test("a rate-limited request is retried and then judged", async () => {
    const file = openCanvasFile(boardFile());
    const jev = fakeJev({ "part of checkout": 0.95 });
    let calls = 0;
    const flaky = (async (url: unknown, init?: RequestInit) =>
      ++calls === 1 ? new Response("{}", { status: 429 }) : jev.fetch(url as string, init)) as typeof fetch;
    const line = await checkDetailValues(file, { apiKey: "test-key", cache: memoryDetailCache(), fetch: flaky, limiter: instant, sleep: noSleep });
    expect(calls).toBe(2);
    expect(line).toContain("1 to remove");
  });

  test("a verdict is for one board title: a retitled board is asked again", async () => {
    const file = openCanvasFile(boardFile());
    const cache = memoryDetailCache();
    const jev = fakeJev({ "part of checkout": 0.95 }, { boardTitle: "Shop checkout" });
    await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });
    expect(detailFindings(file).map((finding) => finding.at)).toEqual([["pay"]]);

    await callToolkitTool(file, "set_board_title", { title: "Payment step reference" });
    expect(detailFindings(file)).toEqual([]);
    const line = await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });
    expect(line).toContain("(2 asked, 0 cached) · 0 to remove");
    expect(jev.bodies.map((body) => body.state.board_title)).toEqual(["Shop checkout", "Payment step reference"]);
    expect(detailFindings(file)).toEqual([]);
  });

  test("a detail edited while Jev answers is judged before canvas_check reports", async () => {
    const file = openCanvasFile(boardFile());
    const jev = fakeJev({ "the payment one": 0.95 }, {
      beforeAnswer: async (call) => {
        if (call === 1) await callToolkitTool(file, "update_text", { id: "pay", detail: "the payment one" });
      },
    });
    const line = await checkDetailValues(file, { apiKey: "test-key", cache: memoryDetailCache(), fetch: jev.fetch, limiter: instant });

    expect(jev.bodies.map((body) => Object.values(body.questions).map((question) => question.instructions.node.detail)))
      // The edit is context for the orders question too, so the second round asks both.
      .toEqual([["part of checkout", "status, total_cents"], ["the payment one", "status, total_cents"]]);
    expect(line).toContain("Jev judged 2 node details (4 asked, 0 cached) · 1 to remove"); // asks add up across both rounds
    expect(detailFindings(file).map((finding) => finding.message)).toEqual([
      expect.stringContaining('pay\'s detail "the payment one" adds no fact'),
    ]);
    expect(toolFinalize(file.session, "committed", "Edited a detail.", () => {}).isError).toBe(true);
  });

  test("a check that cannot run drops the verdicts it held, so nothing blocks", async () => {
    const cache = memoryDetailCache();
    const jev = fakeJev({ "part of checkout": 0.95 });
    const file = openCanvasFile(boardFile());
    await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });
    expect(detailFindings(file)).toHaveLength(1);

    // A failed recheck after an edit: the line says not checked, and the old removal no longer blocks.
    await callToolkitTool(file, "update_text", { id: "orders", detail: "status, total_cents, currency" });
    const refused = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect(await checkDetailValues(file, { apiKey: "test-key", cache, fetch: refused, limiter: instant, sleep: noSleep }))
      .toBe("DETAIL · not checked (Jev HTTP 401)");
    expect(detailFindings(file)).toEqual([]);

    // A cache primed by an earlier run blocks nothing on a board checked without a key.
    const other = openCanvasFile(boardFile());
    expect(await checkDetailValues(other, { apiKey: undefined, cache, limiter: instant }))
      .toBe("DETAIL · not checked (TYPESAFE_API_KEY is not set)");
    expect(detailFindings(other)).toEqual([]);
  });

  test("two caches on one file keep each other's verdicts", () => {
    const dir = mkdtempSync(join(tmpdir(), "detail-cache-"));
    dirs.push(dir);
    const path = join(dir, "detail-value.json");
    const verdict = (choice: "keep" | "remove") =>
      ({ choice, confidence: 0.9, pRemove: choice === "remove" ? 0.95 : 0.05, model: "jev-1.14.0" });
    const first = fileDetailCache(path);
    const second = fileDetailCache(path);
    expect(first.get("a")).toBeUndefined();
    second.set([["b", verdict("keep")]]);
    first.set([["a", verdict("remove")]]);

    const entries = JSON.parse(readFileSync(path, "utf8")).entries;
    expect(Object.keys(entries).sort()).toEqual(["a", "b"]);
    expect(fileDetailCache(path).get("b")).toEqual(verdict("keep"));
  });

  test("writers in separate processes that read first keep every verdict", async () => {
    const dir = mkdtempSync(join(tmpdir(), "detail-cache-"));
    dirs.push(dir);
    const path = join(dir, "detail-value.json");
    const writer = join(dir, "writer.ts");
    const module = join(import.meta.dir, "index.ts");
    writeFileSync(writer, [
      `import { fileDetailCache } from ${JSON.stringify(module)};`,
      "const cache = fileDetailCache(process.argv[2]!); cache.get('absent'); console.log('ready');",
      "await Bun.stdin.text();",
      "cache.set([[process.argv[3]!, { choice: 'keep', confidence: 0.9, pRemove: 0.05, model: 'jev-1.14.0' }]]);",
    ].join("\n"));
    const writers = Array.from({ length: 5 }, (_, index) =>
      Bun.spawn(["bun", writer, path, `k${index}`], { stdin: "pipe", stdout: "pipe" }));
    // Every writer has read the (empty) file before any of them writes.
    await Promise.all(writers.map(async (child) => {
      const reader = child.stdout.getReader();
      let text = "";
      while (!text.includes("ready")) text += new TextDecoder().decode((await reader.read()).value);
      reader.releaseLock();
    }));
    for (const child of writers) {
      child.stdin.write("go\n");
      child.stdin.end();
    }
    await Promise.all(writers.map((child) => child.exited));
    expect(Object.keys(JSON.parse(readFileSync(path, "utf8")).entries).sort()).toEqual(["k0", "k1", "k2", "k3", "k4"]);
  });

  /**
   * A board where every fact a detail might repeat sits somewhere else: a
   * sticky note, a wire label, a box in the same section, a wired box in
   * another section, and a copy of the same detail on another box.
   */
  function contextBoard(): string {
    const dir = mkdtempSync(join(tmpdir(), "detail-context-"));
    dirs.push(dir);
    const path = join(dir, "jobs.canvas.json");
    const box = (id: string, text: string, detail: string, parentId: string, y: number) =>
      ({ ...node(id, text, detail, y), parentId });
    writeFileSync(path, JSON.stringify({
      schemaVersion: 1,
      id: "jobs",
      title: "Job runner",
      mode: "diagram",
      viewport: { x: 0, y: 0, zoom: 1 },
      objects: [
        { id: "page", type: "section", text: "Job runner", color: "white", parentId: null, geometry: { x: 0, y: 0, width: 1400, height: 900 } },
        { id: "s1", type: "section", text: "Queue", color: "gray", parentId: "page", geometry: { x: 80, y: 80, width: 400, height: 700 }, style: { shape: "section" } },
        { id: "s2", type: "section", text: "Workers", color: "gray", parentId: "page", geometry: { x: 600, y: 80, width: 400, height: 700 }, style: { shape: "section" } },
        { id: "s3", type: "section", text: "Archive", color: "gray", parentId: "page", geometry: { x: 1050, y: 80, width: 300, height: 300 }, style: { shape: "section" } },
        box("retry", "retry", "until it clears, max 3", "s1", 120),
        box("cron", "cron", "later · not in v1", "s1", 280),
        box("hook", "hook", "later · not in v1", "s1", 440),
        box("send", "send", "jobs send-email", "s2", 120),
        box("far", "far", "bucket cold-archive", "s3", 120),
        { id: "note", type: "sticky", text: "### Retry\n\nRetry **until it clears**, at most 3 attempts.", parentId: "page", geometry: { x: 80, y: 800, width: 300, height: 80 } },
      ],
      connections: [
        { id: "retry-send", from: { objectId: "retry", anchor: "right" }, to: { objectId: "send", anchor: "left" }, label: "on failure", style: "solid", arrow: "forward" },
      ],
      annotations: [],
    }));
    return path;
  }

  test("each question sees the board context that can make its detail redundant", async () => {
    const file = openCanvasFile(contextBoard());
    const jev = fakeJev({});
    await checkDetailValues(file, { apiKey: "test-key", cache: memoryDetailCache(), fetch: jev.fetch, limiter: instant });

    // Every sticky note rides once in the shared state, on one line without Markdown marks.
    expect(jev.bodies[0]!.state.board_notes).toEqual(["Retry Retry until it clears, at most 3 attempts."]);
    const byName = new Map(jev.bodies.flatMap((body) => Object.values(body.questions)).map((question) => [question.instructions.node.name, question.instructions.node]));
    // retry: its wire's label, the other details in its section, and its wired neighbor's in another section.
    expect(byName.get("retry")).toMatchObject({
      wire_labels: ["on failure"],
      other_details: ["cron: later · not in v1", "hook: later · not in v1", "send: jobs send-email"],
    });
    // A copy of a detail is never its context: hook never sees cron's "later · not in v1".
    expect(byName.get("hook")!.other_details).toEqual(["retry: until it clears, max 3"]);
    // A box in another section with no wire is not context.
    expect(byName.get("retry")!.other_details.join(" ")).not.toContain("cold-archive");
    // A novel exact fact wins over the remove list.
    expect(byName.get("retry") && Object.values(jev.bodies[0]!.questions)[0]!.instructions.question)
      .toContain("Answer `keep` when it holds even one exact fact found nowhere else");
  });

  test("a changed sticky note asks every question on the board again", async () => {
    const file = openCanvasFile(contextBoard());
    const cache = memoryDetailCache();
    const jev = fakeJev({ "until it clears, max 3": 0.9 });
    await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });
    expect(detailFindings(file).map((finding) => finding.at)).toEqual([["retry"]]);

    await callToolkitTool(file, "update_text", { id: "note", text: "Workers run in one pool." });
    // The old verdict saw a note that no longer exists, so it no longer blocks.
    expect(detailFindings(file)).toEqual([]);
    const line = await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });
    expect(line).toContain("(5 asked, 0 cached)");
    expect(jev.bodies.at(-1)!.state.board_notes).toEqual(["Workers run in one pool."]);
  });

  test("a board's questions split into requests Jev accepts by size", async () => {
    // Long notes and 60 details in one section: as one request this passes Jev's ~64k-token limit.
    const dir = mkdtempSync(join(tmpdir(), "detail-size-"));
    dirs.push(dir);
    const path = join(dir, "big.canvas.json");
    const note = (index: number) => ({
      id: `note${index}`, type: "sticky", parentId: "page",
      text: "Retry policy: ".concat("attempts, backoff and jitter values; ".repeat(20)),
      geometry: { x: 80 + index * 320, y: 40, width: 300, height: 200 },
    });
    writeFileSync(path, JSON.stringify({
      schemaVersion: 1, id: "big", title: "Big board", mode: "diagram", viewport: { x: 0, y: 0, zoom: 1 },
      objects: [
        { id: "page", type: "section", text: "Big board", color: "white", parentId: null, geometry: { x: 0, y: 0, width: 4000, height: 9000 } },
        { id: "s1", type: "section", text: "Steps", color: "gray", parentId: "page", geometry: { x: 80, y: 300, width: 3800, height: 8600 }, style: { shape: "section" } },
        ...[0, 1, 2, 3].map(note),
        ...Array.from({ length: 60 }, (_, index) => node(`step${index}`, `step ${index}`, `queue-${index} · max ${index}`, 320 + index * 140)),
      ],
      connections: [],
      annotations: [],
    }));
    const file = openCanvasFile(path);
    const jev = fakeJev({});
    const line = await checkDetailValues(file, { apiKey: "test-key", cache: memoryDetailCache(), fetch: jev.fetch, limiter: instant });
    expect(line).toContain("Jev judged 60 node details (60 asked, 0 cached)");
    expect(jev.bodies.length).toBeGreaterThan(2);
    for (const body of jev.bodies) expect(JSON.stringify(body).length).toBeLessThanOrEqual(120_000);
  });
  /**
   * Boxes that all carry one detail, written to the board out of reading
   * order, in one section. A box with `round` is wired to its own session box
   * by a wire with that label.
   */
  function copiesBoard(boxes: Array<{ id: string; name: string; x: number; y: number; round?: string }>): string {
    const dir = mkdtempSync(join(tmpdir(), "detail-copies-"));
    dirs.push(dir);
    const path = join(dir, "runs.canvas.json");
    writeFileSync(path, JSON.stringify({
      schemaVersion: 1, id: "runs", title: "Agent runs", mode: "diagram", viewport: { x: 0, y: 0, zoom: 1 },
      objects: [
        { id: "page", type: "section", text: "Agent runs", color: "white", parentId: null, geometry: { x: 0, y: 0, width: 1000, height: 1000 } },
        { id: "s1", type: "section", text: "Kernel side", color: "gray", parentId: "page", geometry: { x: 80, y: 80, width: 840, height: 800 }, style: { shape: "section" } },
        ...boxes.map(({ id, name, x, y }) => ({ ...node(id, name, "pi_session_id · container_id", y), geometry: { x, y, width: 280, height: 120 } })),
        ...boxes.filter((box) => box.round).map(({ id, x, y }) => ({ ...node(`${id}-session`, "session", "", y), geometry: { x: x + 160, y: y + 40, width: 100, height: 60 } })),
      ],
      connections: boxes.filter((box) => box.round).map(({ id, round }) => ({
        id: `${id}-wire`, from: { objectId: id, anchor: "right" }, to: { objectId: `${id}-session`, anchor: "left" }, label: round, style: "solid", arrow: "forward",
      })),
      annotations: [],
    }));
    return path;
  }

  const fiveRows = [
    { id: "r4", name: "agent_runs row", x: 120, y: 600 },
    { id: "r2", name: "agent_runs row", x: 120, y: 280 },
    { id: "r1", name: "agent_runs row", x: 120, y: 120 },
    { id: "r5", name: "agent_runs row", x: 520, y: 600 },
    { id: "r3", name: "agent_runs row", x: 520, y: 280 },
  ];

  test("copies of one detail never make each other redundant", async () => {
    const file = openCanvasFile(copiesBoard(fiveRows));
    // Jev removes a detail it sees repeated nearby, as it did on five agent_runs rows.
    const jev = fakeJev((sent) => sent.other_details.some((line) => line.endsWith(`: ${sent.detail}`)) ? 0.99 : 0.2);
    const line = await checkDetailValues(file, { apiKey: "test-key", cache: memoryDetailCache(), fetch: jev.fetch, limiter: instant });
    const sent = jev.bodies.flatMap((body) => Object.values(body.questions)).map((question) => question.instructions.node);
    // Five copies with one question between them (same name, section and context), and it sees no copy.
    expect(sent.map((node) => node.other_details)).toEqual([[]]);
    expect(line).toBe("DETAIL · Jev judged 5 node details (1 asked, 4 cached) · 0 to remove (confidence ≥ 0.3) · 700 input tokens");
    expect(detailFindings(file)).toEqual([]);
  });

  test("when Jev would remove every copy, none is a finding", async () => {
    // The fact must survive in one copy, and removing all but the first now
    // would remove the first on the next check.
    const file = openCanvasFile(copiesBoard(fiveRows));
    const jev = fakeJev({ "pi_session_id · container_id": 0.99 });
    const line = await checkDetailValues(file, { apiKey: "test-key", cache: memoryDetailCache(), fetch: jev.fetch, limiter: instant });
    expect(line).toContain("0 to remove");
    expect(detailFindings(file)).toEqual([]);
  });

  test("the first copy in reading order keeps the fact, and clearing the rest never removes it", async () => {
    // Reading order is top to bottom, then left to right: left (y 120) comes first.
    const file = openCanvasFile(copiesBoard([
      { id: "low", name: "agent_runs row", x: 120, y: 440, round: "round 3" },
      { id: "right", name: "agent_runs row", x: 520, y: 120, round: "round 2" },
      { id: "left", name: "agent_runs row", x: 120, y: 120, round: "round 1" },
    ]));
    const cache = memoryDetailCache();
    // Jev keeps only the round 1 copy, and removes any detail it sees repeated nearby.
    const jev = fakeJev((sent) =>
      sent.wire_labels.includes("round 1") && !sent.other_details.some((line) => line.endsWith(`: ${sent.detail}`)) ? 0.2 : 0.99);
    await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });
    const findings = detailFindings(file);
    expect(findings.map((finding) => finding.at[0]).sort()).toEqual(["low", "right"]);

    // Apply the whole batch, then check again.
    for (const finding of findings) await callToolkitTool(file, "update_text", { id: finding.at[0]!, detail: "" });
    const again = await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });
    // The kept copy's question never saw the others, so it is not asked again and stays a keep.
    expect(again).toBe("DETAIL · Jev judged 1 node detail (0 asked, 1 cached) · 0 to remove (confidence ≥ 0.3)");
    expect(detailFindings(file)).toEqual([]);
    expect(file.session.draft.objects.find((object) => object.id === "left")!.detail).toBe("pi_session_id · container_id");
  });
  test("a host name keeps its line even when the rest repeats a wire label", async () => {
    // Jev removed "command-center · version 1" under a "version 1" wire; the question now names the case.
    const file = openCanvasFile(boardFile());
    const jev = fakeJev({});
    await checkDetailValues(file, { apiKey: "test-key", cache: memoryDetailCache(), fetch: jev.fetch, limiter: instant });
    const question = Object.values(jev.bodies[0]!.questions)[0]!;
    expect(question.instructions.question).toContain("such as the name of the machine it runs on, even if the rest of the line describes the box's role or repeats a wire label");
    const keep = question.criteria.keep as { counts_as_keep: string[]; examples: Array<Record<string, unknown>> };
    expect(keep.counts_as_keep).toContainEqual(expect.stringContaining("the name of the host, machine, device or cluster it runs on"));
    expect(keep.examples).toContainEqual({ name: "On-site", section: "Where jobs run", wire_labels: ["phase one"], detail: "back-office · phase one" });
  });
});
