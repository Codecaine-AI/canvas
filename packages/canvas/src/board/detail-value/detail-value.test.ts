/**
 * The Jev detail check as canvas_check and finalize use it: checkDetailValues
 * on an opened board file, then the finishing lints and finalize. Every Jev
 * call goes to a fake fetch; nothing here touches the network.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";

import { FINISHING_RULES, sessionDiagnostics } from "../../lints";
import { toolFinalize } from "../../session/tools/workflow/finalize";
import {
  callToolkitTool,
  checkDetailValues,
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
  instructions: { node: { name: string; detail: string; section: string; wired_to: string[] } };
  criteria: Record<string, unknown>;
}

/**
 * A fake Jev: answers each question with p(remove) from `pRemove` by detail
 * text (0 when unlisted), and records every request body it received.
 */
function fakeJev(pRemove: Record<string, number>) {
  const bodies: Array<{ model: string; state: unknown; questions: Record<string, SentQuestion> }> = [];
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    const answers = Object.fromEntries(Object.entries(body.questions as Record<string, SentQuestion>).map(([id, question]) => {
      const remove = pRemove[question.instructions.node.detail] ?? 0;
      const choice = remove > 0.5 ? "remove" : "keep";
      return [id, {
        type: "choice",
        choice,
        probabilities: { keep: 1 - remove, remove },
        confidence: Math.abs(2 * remove - 1),
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
    expect(jev.bodies[0]!.state).toEqual({ board_title: "Shop checkout" });
    const sent = Object.values(jev.bodies[0]!.questions).map((question) => question.instructions.node);
    expect(sent).toContainEqual({ name: "Payment step", detail: "part of checkout", section: "Checkout", wired_to: ["Orders table"] });
    expect(Object.keys(Object.values(jev.bodies[0]!.questions)[0]!.criteria)).toEqual(["keep", "remove"]);

    const findings = detailFindings(file);
    expect(findings.map(({ severity, at, suggestion }) => ({ severity, at, suggestion })))
      .toEqual([{ severity: "error", at: ["pay"], suggestion: 'update_text pay detail ""' }]);
    const blocked = toolFinalize(file.session, "committed", "Tidied the board.", () => {});
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toContain('detail-value: pay\'s detail "part of checkout" adds no fact');

    await callToolkitTool(file, "update_text", { id: "pay", detail: "" });
    expect(detailFindings(file)).toEqual([]);
    expect(toolFinalize(file.session, "committed", "Cleared a filler detail.", () => {}).isError).toBeUndefined();

    // A re-check of the unchanged board asks nothing.
    const again = await checkDetailValues(file, { apiKey: "test-key", cache, fetch: jev.fetch, limiter: instant });
    expect(again).toBe("DETAIL · Jev judged 1 node detail (0 asked, 1 cached) · 0 to remove (confidence ≥ 0.3)");
    expect(jev.bodies).toHaveLength(1);
  });

  test("a remove below the confidence threshold is no finding", async () => {
    const file = openCanvasFile(boardFile());
    // p(remove) 0.6 is confidence 0.2, under the 0.3 cut.
    const jev = fakeJev({ "part of checkout": 0.6 });
    await checkDetailValues(file, { apiKey: "test-key", cache: memoryDetailCache(), fetch: jev.fetch, limiter: instant });
    expect(detailFindings(file)).toEqual([]);
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
});
