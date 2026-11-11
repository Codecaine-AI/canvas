/**
 * The canvas service against real canvas files: the toolkit edits a temp copy
 * of a checked-in board and every applied edit lands on disk; an external
 * save makes the next edit refuse instead of clobbering; the injected page
 * frame never reaches the file.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCanvasService } from "./service";

const REPO_CANVASES = join(import.meta.dir, "..", "..", "..", "canvases");
const SOURCE_ID = "v2-flow";

const workspaces: string[] = [];
afterEach(() => {
  for (const dir of workspaces.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A temp workspace whose canvases/ holds `id` with the given document. */
function workspaceWith(id: string, document: unknown): { workspace: string; path: string } {
  const workspace = mkdtempSync(join(tmpdir(), "canvas-mcp-"));
  workspaces.push(workspace);
  mkdirSync(join(workspace, "canvases"));
  const path = join(workspace, "canvases", `${id}.canvas.json`);
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  return { workspace, path };
}

function realCanvas(): any {
  return JSON.parse(readFileSync(join(REPO_CANVASES, `${SOURCE_ID}.canvas.json`), "utf8"));
}

function readDoc(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
}

describe("canvas service", () => {
  test("canvas_open reports the broken wires an older file holds", async () => {
    const original = realCanvas();
    const node = original.objects.find((object: any) => object.type !== "section" && object.type !== "sticky");
    const twin = { ...node, id: "twin" };
    const broken = {
      ...original,
      objects: [...original.objects, twin],
      connections: [
        ...original.connections,
        { id: "loop-wire", from: { objectId: node.id }, to: { objectId: node.id } },
        { id: "flat-wire", from: { objectId: node.id }, to: { objectId: "twin" } },
      ],
    };
    const { workspace } = workspaceWith(SOURCE_ID, broken);
    const service = createCanvasService({ workspace });

    const opened = textOf(await service.call("canvas_open", { canvas: SOURCE_ID }));

    expect(opened).toContain("BROKEN WIRES · 2 in this file");
    expect(opened).toContain(`loop-wire connects ${node.id} to itself`);
    expect(opened).toContain(`flat-wire has zero length: ${node.id} and twin share one center`);
    const clean = workspaceWith(SOURCE_ID, original);
    const cleanText = textOf(await createCanvasService({ workspace: clean.workspace }).call("canvas_open", { canvas: SOURCE_ID }));
    expect(cleanText).not.toContain("BROKEN WIRES");
  });

  test("place_sticky then move save each edit to the canvas file", async () => {
    const original = realCanvas();
    const { workspace, path } = workspaceWith(SOURCE_ID, original);
    const service = createCanvasService({ workspace });

    const opened = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(opened.isError).toBeUndefined();
    expect(textOf(opened)).toContain("BOARD");
    expect(textOf(opened)).toMatch(new RegExp(`^OPENED · ${SOURCE_ID} .* · canvases/${SOURCE_ID}\\.canvas\\.json · sha256:[0-9a-f]{64}\n`));

    const placed = await service.call("place_sticky", { id: "mcp-note", text: "Hello from MCP", at: [960, 1600] });
    expect(placed.isError).toBeUndefined();
    expect(textOf(placed)).toContain("APPLIED · place_sticky mcp-note");
    expect(textOf(placed)).toContain(`SAVED · canvases/${SOURCE_ID}.canvas.json`);
    const afterPlace = readDoc(path);
    expect(afterPlace.objects.find((object: any) => object.id === "mcp-note")?.geometry)
      .toMatchObject({ x: 960, y: 1600 });

    const moved = await service.call("move", { id: "mcp-note", by: { dx: 64, dy: 32 } });
    expect(moved.isError).toBeUndefined();
    // No residual: replaying the patch through the canvas reducer reproduced the draft.
    expect(textOf(placed)).not.toContain("NOTE ·");
    expect(textOf(moved)).not.toContain("NOTE ·");
    const afterMove = readDoc(path);
    const movedNote = afterMove.objects.find((object: any) => object.id === "mcp-note");
    // The gesture snaps, so assert the move landed and matches the session's draft exactly.
    expect(movedNote.geometry.x).toBeGreaterThan(960);
    expect(movedNote.geometry.y).toBeGreaterThan(1600);
    const draftNote = service.activeCanvas()!.session.draft.objects.find((object) => object.id === "mcp-note");
    expect(movedNote.geometry).toEqual(draftNote!.geometry);

    // Exactly one object was added: every original id survives, nothing else joined.
    const ids = afterMove.objects.map((object: any) => object.id).sort();
    expect(ids).toEqual([...original.objects.map((object: any) => object.id), "mcp-note"].sort());
    expect(afterMove.connections).toEqual(original.connections);
  });

  test("an injected page frame is draft-only and never written", async () => {
    // Drop every section so the board has no root frame and the session injects one at open.
    const original = realCanvas();
    const objects = original.objects
      .filter((object: any) => object.type !== "section")
      .map((object: any) => ({ ...object, parentId: null }));
    const kept = new Set(objects.map((object: any) => object.id));
    const frameless = {
      ...original,
      objects,
      connections: original.connections.filter((connection: any) =>
        kept.has(connection.from.objectId) && kept.has(connection.to.objectId)),
      annotations: [],
    };
    const { workspace, path } = workspaceWith("frameless", frameless);
    const service = createCanvasService({ workspace });

    await service.call("canvas_open", { canvas: "frameless" });
    expect(service.activeCanvas()?.injectedFrameId).toBe("page-frame");
    expect(service.activeCanvas()?.session.draft.objects.some((object) => object.id === "page-frame")).toBe(true);

    const placed = await service.call("place_sticky", { id: "frameless-note", text: "No frame", at: [960, 1600] });
    expect(placed.isError).toBeUndefined();
    const moved = await service.call("move", { id: "frameless-note", by: { dx: 32, dy: 0 } });
    expect(moved.isError).toBeUndefined();
    expect(textOf(moved)).toContain("SAVED ·");
    expect(textOf(moved)).not.toContain("NOTE ·");

    const saved = readDoc(path);
    expect(saved.objects.some((object: any) => object.id === "page-frame")).toBe(false);
    expect(saved.objects.some((object: any) => object.parentId === "page-frame")).toBe(false);
    expect(saved.objects).toHaveLength(frameless.objects.length + 1);
  });

  test("an external write makes the next edit refuse until canvas_open", async () => {
    const { workspace, path } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });
    await service.call("canvas_open", { canvas: SOURCE_ID });

    // Someone else saves the board (Studio, a text editor) after the open.
    const external = { ...readDoc(path), title: "Renamed elsewhere" };
    const externalText = `${JSON.stringify(external, null, 2)}\n`;
    writeFileSync(path, externalText);

    const refused = await service.call("place_sticky", { id: "late-note", text: "Too late", at: [960, 1600] });
    expect(refused.isError).toBe(true);
    expect(textOf(refused)).toContain("changed on disk");
    expect(textOf(refused)).toContain("canvas_open");
    expect(readFileSync(path, "utf8")).toBe(externalText);

    // The session stays refused, even for a call that would not write.
    const stillRefused = await service.call("move", { id: "late-note", by: { dx: 16, dy: 0 } });
    expect(stillRefused.isError).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(externalText);

    // Re-opening reads the external save and edits resume on top of it.
    await service.call("canvas_open", { canvas: SOURCE_ID });
    const placed = await service.call("place_sticky", { id: "late-note", text: "After reload", at: [960, 1600] });
    expect(placed.isError).toBeUndefined();
    const saved = readDoc(path);
    expect(saved.title).toBe("Renamed elsewhere");
    expect(saved.objects.some((object: any) => object.id === "late-note")).toBe(true);
  });

  test("toolkit tools refuse before canvas_open and on invalid arguments", async () => {
    const { workspace, path } = workspaceWith(SOURCE_ID, realCanvas());
    const before = readFileSync(path, "utf8");
    const service = createCanvasService({ workspace });

    const closed = await service.call("move", { id: "page-frame", by: { dx: 16, dy: 0 } });
    expect(closed.isError).toBe(true);
    expect(textOf(closed)).toContain("canvas_open");

    await service.call("canvas_open", { canvas: SOURCE_ID });
    const invalid = await service.call("move", { id: "page-frame", by: [16, 0] });
    expect(invalid.isError).toBe(true);
    expect(textOf(invalid)).toContain("Validation failed");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  test("workflow tools: look returns renders; describe_board and annotate persist", async () => {
    const { workspace, path } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });
    await service.call("canvas_open", { canvas: SOURCE_ID });

    const looked = await service.call("look", { view: "page-frame" });
    expect(looked.isError).toBeUndefined();
    expect(looked.content.some((item) => item.type === "image" && item.mimeType === "image/png")).toBe(true);
    expect(textOf(looked)).not.toContain("SAVED");

    await service.call("describe_board", { title: "Retitled by MCP" });
    const target = readDoc(path).objects.find((object: any) => object.id !== "page-frame").id;
    const asked = await service.call("annotate", { objectId: target, body: "Is this step still needed?" });
    expect(asked.isError).toBeUndefined();

    const saved = readDoc(path);
    expect(saved.title).toBe("Retitled by MCP");
    expect(saved.annotations.some((annotation: any) =>
      annotation.target.objectId === target && annotation.createdBy === "agent")).toBe(true);

    const names = service.listTools().map((tool) => tool.name);
    expect(names).not.toContain("finalize");
    expect(names).toEqual(expect.arrayContaining(["look", "describe_board", "annotate", "resolve_request"]));
  });

  test("a null field reaches describe_board and annotate as absent, and an empty one is still refused", async () => {
    const { workspace, path } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });
    await service.call("canvas_open", { canvas: SOURCE_ID });
    const target = readDoc(path).objects.find((object: any) => object.id !== "page-frame").id;

    const renamed = await service.call("describe_board", { title: "Renamed", description: null });
    expect(renamed.isError).toBeUndefined();
    expect(textOf(renamed)).not.toContain("DELTA · description");
    const emptied = await service.call("describe_board", { title: "", description: "# Kept" });
    expect(textOf(emptied)).toBe("describe_board rejected: title must be a non-empty string — the board is never left nameless.");

    const asked = await service.call("annotate", { objectId: target, thread: null, body: "Still needed?" });
    expect(asked.isError).toBeUndefined();
    const replied = await service.call("annotate", { objectId: null, thread: "R1", body: "Yes." });
    expect(replied.isError).toBeUndefined();

    const saved = readDoc(path);
    expect(saved.title).toBe("Renamed");
    expect(saved.description).not.toBe("# Kept");
    const thread = saved.annotations.find((annotation: any) => annotation.target.objectId === target);
    expect(thread.replies.map((reply: any) => reply.body)).toEqual(["Yes."]);
  });

  test("a null mode reaches move and resize as absent through the tool boundary", async () => {
    const { workspace, path } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });
    await service.call("canvas_open", { canvas: SOURCE_ID });
    await service.call("place_sticky", { id: "null-a", text: "A", at: [960, 1600] });
    await service.call("place_sticky", { id: "null-b", text: "B", at: [1360, 1600] });

    const nudged = await service.call("move", { id: "null-a", to: null, by: { dx: 40, dy: 0 } });
    expect(textOf(nudged)).toContain("APPLIED · move null-a +40,+0 → (1000, 1600)");
    const widened = await service.call("resize", { id: "null-a", like: null, width: 400, height: null });
    expect(textOf(widened)).toContain("APPLIED · resize null-a → 400×");
    const matched = await service.call("resize", { id: "null-b", like: "null-a", width: null, height: null });
    expect(textOf(matched)).toContain("(matching null-a)");
    const empty = await service.call("resize", { id: "null-b", like: null, width: null, height: null });
    expect(textOf(empty)).toContain("asks for no change");

    const saved = readDoc(path).objects.filter((object: any) => object.id.startsWith("null-"));
    expect(saved.map((object: any) => object.geometry.width)).toEqual([400, 400]);
  });

  test("a null mode reaches arrange and route as absent through the tool boundary", async () => {
    const { workspace, path } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });
    await service.call("canvas_open", { canvas: SOURCE_ID });
    await service.call("place_sticky", { id: "row-a", text: "A", at: [960, 1600] });
    await service.call("place_sticky", { id: "row-b", text: "B", at: [1400, 1640] });
    await service.call("connect", { id: "row-edge", from: { objectId: "row-a" }, to: { objectId: "row-b" } });

    const aligned = await service.call("arrange", { ids: ["row-a", "row-b"], align: "top", space: null });
    expect(textOf(aligned)).toContain("APPLIED · arrange align top · row-a, row-b → top edges at y=1600");
    const spaced = await service.call("arrange", {
      ids: ["row-a", "row-b"],
      align: null,
      space: { axis: "horizontal", gap: 80 },
    });
    expect(textOf(spaced)).toContain("APPLIED · arrange space horizontal gap 80");
    const neither = await service.call("arrange", { ids: ["row-a", "row-b"], align: null, space: null });
    expect(textOf(neither)).toContain("send exactly one of align or space");

    const reset = await service.call("route", { id: "row-edge", points: null, shift: null, reset: true });
    expect(textOf(reset)).toContain("NO-OP · route row-edge — this edge is already on the auto-router");
    const notReset = await service.call("route", { id: "row-edge", points: null, shift: null, reset: false });
    expect(textOf(notReset)).toContain("send exactly one of points, shift or reset");

    const saved = readDoc(path).objects.filter((object: any) => object.id.startsWith("row-"));
    expect(saved.map((object: any) => object.geometry.y)).toEqual([1600, 1600]);
  });

  test("canvas_open reads canvases/canvas-style.json, and look renders with it", async () => {
    const { workspace } = workspaceWith(SOURCE_ID, realCanvas());
    const stylePath = join(workspace, "canvases", "canvas-style.json");
    const service = createCanvasService({ workspace });
    /** sha256 of the close-up PNG `look` returns — the pixels, compared by digest. */
    const lookPng = async (): Promise<string> => {
      const looked = await service.call("look", { view: "section-interview-inputs" });
      expect(looked.isError).toBeUndefined();
      const image = looked.content.find((item) => item.type === "image");
      expect(image).toBeDefined();
      return createHash("sha256").update((image as { data: string }).data).digest("hex");
    };

    // No style file: the defaults — the schematic-light theme, reported, with no overrides.
    const plain = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(textOf(plain)).toContain("STYLE · theme schematic-light");
    expect(textOf(plain)).not.toContain("workspace overrides");
    const defaultPng = await lookPng();

    // A style saved in Studio is picked up by the next canvas_open and changes the render.
    // This is the pre-theme flat format, which reads as figjam overrides.
    const overrides = { shapeCornerRadiusPx: 16, shapeBorderWidthPx: 6, sectionCornerRadiusPx: 16 };
    writeFileSync(stylePath, JSON.stringify(overrides));
    const styled = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(styled.isError).toBeUndefined();
    expect(textOf(styled)).toContain(
      "STYLE · theme figjam · workspace overrides: shapeCornerRadiusPx=16, shapeBorderWidthPx=6, sectionCornerRadiusPx=16",
    );
    expect(await lookPng()).not.toBe(defaultPng);

    // The settings format Studio writes now: another active theme is reported by
    // name, with palette overrides one ink per color.
    writeFileSync(stylePath, JSON.stringify({
      theme: "schematic-dark",
      themes: { "schematic-dark": { shapeCornerRadiusPx: 4, palette: { red: "#FF0000" } }, figjam: overrides },
    }));
    const dark = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(dark.isError).toBeUndefined();
    expect(textOf(dark)).toContain("STYLE · theme schematic-dark · workspace overrides: shapeCornerRadiusPx=4, palette.red=#FF0000");

    // A malformed file never blocks the open: it reads as the defaults.
    writeFileSync(stylePath, "{ not json");
    const malformed = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(malformed.isError).toBeUndefined();
    expect(textOf(malformed)).toContain("STYLE · theme schematic-light");
    expect(textOf(malformed)).not.toContain("workspace overrides");
    expect(await lookPng()).toBe(defaultPng);
  });

  test("no lint judges a name's wording, a person's or the agent's", async () => {
    // v2-flow, as its author left it, holds two long names.
    const { workspace } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });

    const opened = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(textOf(opened)).toContain('"Does Response Provide Enough Context to Answer the Research Objective"');
    expect(textOf(opened)).not.toContain("emphasis-box-research-objective's name");

    // A long name the agent writes adds no error either.
    const renamed = await service.call("update_text", {
      id: "chip-adapt-question",
      text: "Adapt the next question based on the whole interview history",
    });
    expect(renamed.isError).toBeUndefined();
    expect(textOf(renamed)).toMatch(/LINTS · (clean|no new errors)/);
    expect(textOf(renamed)).not.toContain("chip-adapt-question's name");
  });

  test("a section's header glyph saves to the file and reads back in the digest; a node detail is dropped, never saved", async () => {
    const { workspace, path } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });
    await service.call("canvas_open", { canvas: SOURCE_ID });

    const placed = await service.call("place_section", {
      id: "mcp-services",
      text: "Bun services",
      at: [4000, 0],
      size: { width: 480, height: 320 },
      icon: "brand-bun",
    });
    expect(placed.isError).toBeUndefined();
    // place_shape has no detail field: the schema refuses one.
    const refused = await service.call("place_shape", { id: "mcp-db", type: "database", at: [4040, 80], detail: ":5432" });
    expect(refused.isError).toBe(true);
    const shape = await service.call("place_shape", { id: "mcp-db", type: "database", at: [4040, 80] });
    expect(shape.isError).toBeUndefined();
    const named = await service.call("update_text", { id: "mcp-db", text: "Postgres", detail: "16 · :5432" });
    expect(named.isError).toBeUndefined();
    expect(textOf(named)).toContain("detail dropped — a node shows its name only");
    // No residual: the reducer's replay reproduced the draft, glyph included.
    for (const result of [placed, shape, named]) expect(textOf(result)).not.toContain("NOTE ·");

    const saved = readDoc(path);
    expect(saved.objects.find((object: any) => object.id === "mcp-services")).toMatchObject({
      type: "section",
      icon: "brand-bun",
    });
    expect(saved.objects.find((object: any) => object.id === "mcp-services")).not.toHaveProperty("detail");
    expect(saved.objects.find((object: any) => object.id === "mcp-db")).toMatchObject({
      type: "icon",
      icon: "database",
      text: "Postgres",
    });
    expect(saved.objects.find((object: any) => object.id === "mcp-db")).not.toHaveProperty("detail");

    const reopened = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(textOf(reopened)).toContain('mcp-services section "Bun services"');
    expect(textOf(reopened)).toContain("icon=brand-bun");
    expect(textOf(reopened)).toContain('mcp-db database "Postgres"');
    expect(textOf(reopened)).not.toContain("detail=");

    // An enum miss on the folded type vocabulary comes back with the names it was
    // reaching for, appended to the schema's own refusal.
    const enumMiss = await service.call("place_shape", { id: "mcp-pg", type: "postgres", at: [4040, 240] });
    expect(enumMiss.isError).toBe(true);
    expect(textOf(enumMiss)).toContain("Validation failed");
    expect(textOf(enumMiss)).toContain('hint · type "postgres": did you mean "brand-postgres"?');
    const swapMiss = await service.call("change_shape", { id: "mcp-db", patch: { type: "Redis" } });
    expect(textOf(swapMiss)).toContain('hint · patch.type "Redis": did you mean "brand-redis"?');
  });

  test("canvas_list and canvas_guidance", async () => {
    const { workspace } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });

    const listed = await service.call("canvas_list", {});
    expect(textOf(listed)).toBe(`CANVASES · 1 in canvases\n  ${SOURCE_ID}  ${JSON.stringify(realCanvas().title)}  ${realCanvas().objects.length} objects`);

    const topics = await service.call("canvas_guidance", {});
    expect(textOf(topics)).toMatch(/^  diagram_design  ".+"  ~\d+ tokens$/m);

    const topic = await service.call("canvas_guidance", { topic: "diagram_design" });
    expect(topic.isError).toBeUndefined();
    expect(textOf(topic).length).toBeGreaterThan(1000);

    // Guidance is the lazy path: opening a board carries none of it.
    const opened = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(textOf(opened)).not.toContain(textOf(topic).split("\n").at(-1)!);
  });
});
