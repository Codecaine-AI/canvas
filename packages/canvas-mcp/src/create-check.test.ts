/**
 * canvas_create, canvas_check, and canvas_open on a page sidecar, driven only
 * through the service's tool calls, as an agent drives them.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCanvasService, type CanvasToolResult } from "./service";

const REPO_CANVASES = join(import.meta.dir, "..", "..", "..", "canvases");

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "canvas-mcp-check-"));
  dirs.push(dir);
  return dir;
}

function textOf(result: CanvasToolResult): string {
  return result.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n");
}

function pngOf(result: CanvasToolResult): Buffer {
  const images = result.content.flatMap((item) => (item.type === "image" ? [item] : []));
  expect(images).toHaveLength(1);
  expect(images[0]!.mimeType).toBe("image/png");
  return Buffer.from(images[0]!.data, "base64");
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** The facts canvas_check prints, read back from its text. */
function checked(result: CanvasToolResult) {
  const text = textOf(result);
  const head = /^CHECKED · .* · (\d+) nodes? · (\d+) edges? · /m.exec(text);
  const render = /^RENDER · whole board · (\d+)×(\d+) px · bounds x (-?\d+)\.\.(-?\d+) · y (-?\d+)\.\.(-?\d+)$/m.exec(text);
  const lints = /^LINTS · (?:clean · )?(\d+) errors? · (\d+) warnings? · (\d+) notes?$/m.exec(text);
  if (!head || !render || !lints) throw new Error(`unexpected canvas_check text:\n${text}`);
  const [, nodes, edges] = head.map(Number);
  const [, pxWidth, pxHeight, left, right, top, bottom] = render.map(Number);
  const [, errors, warnings, notes] = lints.map(Number);
  return {
    text,
    nodes: nodes!,
    edges: edges!,
    px: { width: pxWidth!, height: pxHeight! },
    bounds: { left: left!, right: right!, top: top!, bottom: bottom! },
    errors: errors!,
    warnings: warnings!,
    notes: notes!,
  };
}

async function call(service: ReturnType<typeof createCanvasService>, name: string, args: Record<string, unknown>) {
  const result = await service.call(name, args);
  if (result.isError) throw new Error(`${name} failed:\n${textOf(result)}`);
  return result;
}

/** A five-state chart in the form the statechart skill writes. */
const CHECKOUT_CHART = `stateDiagram-v2
  s0: Cart open
  s1: Paying
  s2: Paid
  s3: Payment failed
  s4: Shipped
  [*] --> s0
  s0 --> s1: you press pay
  s1 --> s2: the card clears
  s1 --> s3: the card is declined
  s3 --> s1: you try again
  s3 --> s0: you edit the cart
  s2 --> s4: the warehouse ships it
  classDef breaks fill:#ffecee,stroke:#e72e3b,stroke-width:2.5px,color:#cd2834
  class s0 teal
  class s1 yellow
  class s2 yellow
  class s3 yellow
  class s4 purple
  class s3 breaks
`;

/** The statechart color classes, in the board's color roster. */
const GROUP_COLORS: Record<string, string> = { teal: "teal", yellow: "yellow", purple: "violet", pink: "pink", tan: "orange" };

function parseChart(chart: string) {
  const states = [...chart.matchAll(/^ {2}(s\d+): (.+)$/gm)].map(([, id, label]) => ({ id: id!, label: label! }));
  const arrows = [...chart.matchAll(/^ {2}(s\d+) --> (s\d+): (.+)$/gm)].map(([, from, to, label]) => ({ from: from!, to: to!, label: label! }));
  const groups = new Map([...chart.matchAll(/^ {2}class (s\d+) (\w+)$/gm)]
    .filter(([, , cls]) => cls !== "breaks" && cls !== "mayBreak")
    .map(([, id, cls]) => [id!, GROUP_COLORS[cls!]!]));
  const breaks = new Set([...chart.matchAll(/^ {2}class (s\d+) breaks$/gm)].map(([, id]) => id!));
  return { states, arrows, groups, breaks };
}

describe("canvas_create and canvas_check", () => {
  test("a new board goes from empty to lint-clean through the tools alone", async () => {
    const workspace = tempDir();
    const service = createCanvasService({ workspace });

    const created = await call(service, "canvas_create", { canvas: "pr3-flow", title: "Request flow" });
    expect(textOf(created)).toMatch(/^CREATED · pr3-flow "Request flow" · canvases\/pr3-flow\.canvas\.json · sha256:[0-9a-f]{64}\n/);
    expect(textOf(created)).toContain("BOARD");
    expect(textOf(created)).toContain("SAVED · canvases/pr3-flow.canvas.json");
    const path = join(workspace, "canvases", "pr3-flow.canvas.json");
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ id: "pr3-flow", title: "Request flow", connections: [] });

    const again = await service.call("canvas_create", { canvas: "pr3-flow", title: "Other" });
    expect(again.isError).toBe(true);
    expect(textOf(again)).toContain("already exists");

    for (const [id, type, x, name] of [
      ["client", "human", 80, "Browser"],
      ["api", "process", 520, "API server"],
      ["db", "database", 960, "Postgres"],
    ] as const) {
      await call(service, "place_shape", { id, type, at: [x, 140] });
      await call(service, "update_text", { id, text: name });
    }
    await call(service, "connect", { id: "e1", from: { objectId: "client" }, to: { objectId: "api" } });
    await call(service, "connect", { id: "e2", from: { objectId: "api" }, to: { objectId: "db" } });

    // The row ran past the page, and the page grew to hold it: no fit_section call.
    const result = await call(service, "canvas_check", {});
    const check = checked(result);
    expect(check.errors).toBe(0);
    expect(check.text).toContain("LINTS · clean");
    expect(check.nodes).toBe(3);
    expect(check.edges).toBe(2);
    expect(pngSize(pngOf(result))).toEqual(check.px);
    // The saved board holds what was drawn.
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved.objects.map((object: { id: string }) => object.id).sort()).toEqual(["api", "client", "db", "page-frame"]);
    expect(saved.connections).toHaveLength(2);
  });

  test("a sticky whose text clips is a TEXT note, never a finding", async () => {
    const workspace = tempDir();
    const service = createCanvasService({ workspace });
    await call(service, "canvas_create", { canvas: "sticky-clip", title: "Sticky clip" });
    const rows = Array.from({ length: 30 }, (_, index) => `row ${index + 1}`).join("\n");
    await call(service, "place_sticky", { id: "payload", text: rows, at: [80, 120] });
    // A write fits a note to its text, so only a board written before that rule
    // still holds a note that clips: give the file such a legacy height.
    const path = join(workspace, "canvases", "sticky-clip.canvas.json");
    const board = JSON.parse(readFileSync(path, "utf8"));
    board.objects.find((object: { id: string }) => object.id === "payload").geometry.height = 120;
    writeFileSync(path, JSON.stringify(board, null, 2));
    await call(service, "canvas_open", { canvas: "sticky-clip" });

    const check = checked(await call(service, "canvas_check", {}));
    expect(check.text).toContain("LINTS · clean");
    expect(check.text).toContain("TEXT · 1 note (never blocks)");
    expect(check.text).toMatch(/^ {2}sticky payload clips its text: .*shorten the text\)$/m);
  });

  test("a chart.mmd redraws on a board with equal node and edge counts", async () => {
    const service = createCanvasService({ workspace: tempDir() });
    const chart = parseChart(CHECKOUT_CHART);
    await call(service, "canvas_create", { canvas: "pr3-checkout-states", title: "Checkout states" });

    for (const [index, state] of chart.states.entries()) {
      await call(service, "place_shape", { id: state.id, type: "process", at: [80 + (index % 3) * 520, 120 + Math.floor(index / 3) * 360] });
      await call(service, "update_text", { id: state.id, text: state.label });
      await call(service, "change_color", { id: state.id, color: chart.breaks.has(state.id) ? "red" : chart.groups.get(state.id)! });
    }
    for (const [index, arrow] of chart.arrows.entries()) {
      await call(service, "connect", { id: `a${index}`, from: { objectId: arrow.from }, to: { objectId: arrow.to }, label: arrow.label });
    }

    const check = checked(await call(service, "canvas_check", {}));
    expect(check.errors).toBe(0);
    expect(check.nodes).toBe(chart.states.length);
    expect(check.edges).toBe(chart.arrows.length);
    expect(chart.states).toHaveLength(5);
    expect(chart.arrows).toHaveLength(6);
    // The red mark and the group colors landed on the nodes.
    const draft = service.activeCanvas()!.session.draft;
    expect(draft.objects.find((object) => object.id === "s3")?.color).toBe("red");
    expect(draft.objects.find((object) => object.id === "s4")?.color).toBe("violet");
  });

  test("canvas_open on a page sidecar edits that file, and canvas_check renders its full bounds", async () => {
    const workspace = tempDir();
    mkdirSync(join(workspace, "canvases"));
    const page = join(workspace, "docs", "20-flows", "assets", "canvases");
    mkdirSync(page, { recursive: true });
    const sidecar = join(page, "v2-flow.canvas.json");
    writeFileSync(sidecar, readFileSync(join(REPO_CANVASES, "v2-flow.canvas.json")));
    const shown = "docs/20-flows/assets/canvases/v2-flow.canvas.json";
    const service = createCanvasService({ workspace });

    const opened = await call(service, "canvas_open", { canvas: sidecar });
    expect(textOf(opened).split("\n")[0]).toStartWith(`OPENED · v2-flow "`);
    expect(textOf(opened).split("\n")[0]).toContain(` · ${shown} · sha256:`);

    const before = JSON.parse(readFileSync(sidecar, "utf8"));
    const target = before.objects.find((object: { type: string }) => object.type !== "section");
    const moved = await call(service, "move_by", { id: target.id, dx: 40, dy: 0 });
    expect(textOf(moved)).toContain(`SAVED · ${shown}`);
    const after = JSON.parse(readFileSync(sidecar, "utf8"));
    // The gesture snaps to the grid, so the saved x moved right and matches the draft.
    const savedX = after.objects.find((object: { id: string }) => object.id === target.id).geometry.x;
    expect(savedX).toBeGreaterThan(target.geometry.x);
    expect(savedX).toBe(service.activeCanvas()!.session.draft.objects.find((object) => object.id === target.id)!.geometry.x);
    // Nothing landed under the workspace's canvases/.
    expect(existsSync(join(workspace, "canvases", "v2-flow.canvas.json"))).toBe(false);

    const result = await call(service, "canvas_check", {});
    const check = checked(result);
    expect(check.nodes + after.objects.filter((object: { type: string }) => object.type === "section" || object.type === "sticky").length)
      .toBe(after.objects.length);
    expect(check.edges).toBe(after.connections.length);
    // The PNG is the camera at scale: every object lies inside the camera, and
    // the image's aspect ratio is the camera's.
    const size = pngSize(pngOf(result));
    expect(size).toEqual(check.px);
    for (const object of after.objects) {
      const { x, y, width, height } = object.geometry;
      expect(x).toBeGreaterThanOrEqual(check.bounds.left);
      expect(y).toBeGreaterThanOrEqual(check.bounds.top);
      expect(x + width).toBeLessThanOrEqual(check.bounds.right);
      expect(y + height).toBeLessThanOrEqual(check.bounds.bottom);
    }
    const cameraAspect = (check.bounds.right - check.bounds.left) / (check.bounds.bottom - check.bounds.top);
    expect(Math.abs(size.width / size.height - cameraAspect) / cameraAspect).toBeLessThan(0.01);

    // A workspace-relative path names a sidecar too; a non-board path is refused.
    const relative = await service.call("canvas_open", { canvas: "canvases/../nowhere/x.canvas.json" });
    expect(relative.isError).toBe(true);
    expect(textOf(relative)).toContain(`no board file at ${join(workspace, "nowhere", "x.canvas.json")}`);
    const notBoard = await service.call("canvas_open", { canvas: "docs/page/doc.json" });
    expect(notBoard.isError).toBe(true);
  });

  test("canvas_open refuses a board file outside the workspace root", async () => {
    const parent = tempDir();
    const workspace = join(parent, "ws");
    mkdirSync(join(workspace, "canvases"), { recursive: true });
    const outside = join(parent, "outside.canvas.json");
    const board = readFileSync(join(REPO_CANVASES, "v2-flow.canvas.json"));
    writeFileSync(outside, board);
    symlinkSync(outside, join(workspace, "canvases", "link.canvas.json"));
    const service = createCanvasService({ workspace });

    for (const canvas of ["../outside.canvas.json", outside, "canvases/link.canvas.json", "link"]) {
      const refused = await service.call("canvas_open", { canvas });
      expect(refused.isError).toBe(true);
      expect(textOf(refused)).toContain("is outside the workspace");
    }
    // Nothing opened, so no edit can reach the outside file.
    expect(service.activeCanvas()).toBeNull();
    expect((await service.call("set_board_title", { title: "Hijacked" })).isError).toBe(true);
    expect(readFileSync(outside)).toEqual(board);

    // A sidecar in any folder under the root opens.
    const sidecar = join(workspace, "some", "page", "assets", "canvases", "x.canvas.json");
    mkdirSync(join(sidecar, ".."), { recursive: true });
    writeFileSync(sidecar, board);
    const opened = await call(service, "canvas_open", { canvas: "some/page/assets/canvases/x.canvas.json" });
    expect(textOf(opened)).toContain(" · some/page/assets/canvases/x.canvas.json · sha256:");
  });

  test("canvas_check refuses a conflicted board until canvas_open reloads it", async () => {
    const service = createCanvasService({ workspace: tempDir() });
    await call(service, "canvas_create", { canvas: "conflict", title: "Conflict" });
    const path = service.activeCanvas()!.canvasPath;
    await call(service, "place_shape", { id: "a", type: "process", at: [80, 140] });

    // Someone else saves the board: canvas_check refuses it before any edit tries to save.
    writeFileSync(path, `${JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), title: "Saved elsewhere" }, null, 2)}\n`);
    const refused = await service.call("canvas_check", {});
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toContain("Call canvas_open again");
    expect(refused.content.some((item) => item.type === "image")).toBe(false);

    // Every gesture now gives the same refusal.
    const gesture = await service.call("move_by", { id: "a", dx: 16, dy: 0 });
    expect(gesture.isError).toBe(true);
    expect(textOf(gesture)).toBe(textOf(refused));

    await call(service, "canvas_open", { canvas: "conflict" });
    const check = checked(await call(service, "canvas_check", {}));
    expect(check.nodes).toBe(1);
  });

  test("canvas_check needs an open board", async () => {
    const result = await createCanvasService({ workspace: tempDir() }).call("canvas_check", {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("No canvas is open");
  });
});
