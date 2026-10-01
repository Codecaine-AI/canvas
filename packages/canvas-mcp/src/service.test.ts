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
  test("place_sticky then move_by save each edit to the canvas file", async () => {
    const original = realCanvas();
    const { workspace, path } = workspaceWith(SOURCE_ID, original);
    const service = createCanvasService({ workspace });

    const opened = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(opened.isError).toBeUndefined();
    expect(textOf(opened)).toContain("BOARD");
    expect(opened.structuredContent?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const placed = await service.call("place_sticky", { id: "mcp-note", text: "Hello from MCP", at: [960, 1600] });
    expect(placed.isError).toBeUndefined();
    expect(textOf(placed)).toContain("APPLIED · place_sticky mcp-note");
    expect(textOf(placed)).toContain(`SAVED · canvases/${SOURCE_ID}.canvas.json`);
    const afterPlace = readDoc(path);
    expect(afterPlace.objects.find((object: any) => object.id === "mcp-note")?.geometry)
      .toMatchObject({ x: 960, y: 1600 });

    const moved = await service.call("move_by", { id: "mcp-note", dx: 64, dy: 32 });
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
    const moved = await service.call("move_by", { id: "frameless-note", dx: 32, dy: 0 });
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
    const stillRefused = await service.call("move_by", { id: "late-note", dx: 16, dy: 0 });
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

    const closed = await service.call("move_by", { id: "page-frame", dx: 16, dy: 0 });
    expect(closed.isError).toBe(true);
    expect(textOf(closed)).toContain("canvas_open");

    await service.call("canvas_open", { canvas: SOURCE_ID });
    const invalid = await service.call("move_by", { id: "page-frame", by: [16, 0] });
    expect(invalid.isError).toBe(true);
    expect(textOf(invalid)).toContain("Validation failed");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  test("workflow tools: look returns renders; set_board_title and add_annotation persist", async () => {
    const { workspace, path } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });
    await service.call("canvas_open", { canvas: SOURCE_ID });

    const looked = await service.call("look", { view: "page-frame" });
    expect(looked.isError).toBeUndefined();
    expect(looked.content.some((item) => item.type === "image" && item.mimeType === "image/png")).toBe(true);
    expect(textOf(looked)).not.toContain("SAVED");

    await service.call("set_board_title", { title: "Retitled by MCP" });
    const target = readDoc(path).objects.find((object: any) => object.id !== "page-frame").id;
    const asked = await service.call("add_annotation", { objectId: target, body: "Is this step still needed?" });
    expect(asked.isError).toBeUndefined();

    const saved = readDoc(path);
    expect(saved.title).toBe("Retitled by MCP");
    expect(saved.annotations.some((annotation: any) =>
      annotation.target.objectId === target && annotation.createdBy === "agent")).toBe(true);

    const names = service.listTools().map((tool) => tool.name);
    expect(names).not.toContain("finalize");
    expect(names).toEqual(expect.arrayContaining(["look", "update_description", "set_board_title", "add_annotation", "reply_annotation", "resolve_request"]));
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
    expect(plain.structuredContent?.theme).toBe("schematic-light");
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
    expect(styled.structuredContent?.canvasStyle).toMatchObject({
      theme: "figjam",
      shapeCornerRadiusPx: 16,
      shapeBorderWidthPx: 6,
      sectionCornerRadiusPx: 16,
    });
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
    expect(dark.structuredContent?.theme).toBe("schematic-dark");
    expect(dark.structuredContent?.canvasStyle).toMatchObject({ theme: "schematic-dark", shapeCornerRadiusPx: 4 });

    // A malformed file never blocks the open: it reads as the defaults.
    writeFileSync(stylePath, "{ not json");
    const malformed = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(malformed.isError).toBeUndefined();
    expect(textOf(malformed)).toContain("STYLE · theme schematic-light");
    expect(textOf(malformed)).not.toContain("workspace overrides");
    expect(malformed.structuredContent?.theme).toBe("schematic-light");
    expect(await lookPng()).toBe(defaultPng);
  });

  test("canvas_open never flags a person's own prose names; prose the agent writes is flagged", async () => {
    // v2-flow, as its author left it, holds two long names.
    const { workspace } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });

    const opened = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(textOf(opened)).toContain('"Does Response Provide Enough Context to Answer the Research Objective"');
    expect(textOf(opened)).not.toContain("label-is-prose");

    // An unrelated edit leaves them alone too.
    const moved = await service.call("move_by", { id: "chip-adapt-question", dx: 0, dy: 20 });
    expect(textOf(moved)).not.toContain("label-is-prose");

    // A name the agent writes is the agent's, and the lint judges it.
    const renamed = await service.call("update_text", {
      id: "chip-adapt-question",
      text: "Adapt the next question based on the whole interview history",
    });
    expect(renamed.isError).toBeUndefined();
    expect(textOf(renamed)).toContain("label-is-prose: chip-adapt-question's name has");
    expect(textOf(renamed)).not.toContain("emphasis-box-research-objective's name");
  });

  test("detail and a section's header glyph save to the file and read back in the digest", async () => {
    const { workspace, path } = workspaceWith(SOURCE_ID, realCanvas());
    const service = createCanvasService({ workspace });
    await service.call("canvas_open", { canvas: SOURCE_ID });

    const placed = await service.call("place_section", {
      id: "mcp-services",
      text: "Bun services",
      at: [4000, 0],
      size: { width: 480, height: 320 },
      detail: "127.0.0.1",
      icon: "brand-bun",
    });
    expect(placed.isError).toBeUndefined();
    const shape = await service.call("place_shape", { id: "mcp-db", type: "database", at: [4040, 80], detail: ":5432" });
    expect(shape.isError).toBeUndefined();
    const named = await service.call("update_text", { id: "mcp-db", text: "Postgres", detail: "16 · :5432" });
    expect(named.isError).toBeUndefined();
    // No residual: the reducer's replay reproduced the draft, detail and glyph included.
    for (const result of [placed, shape, named]) expect(textOf(result)).not.toContain("NOTE ·");

    const saved = readDoc(path);
    expect(saved.objects.find((object: any) => object.id === "mcp-services")).toMatchObject({
      type: "section",
      detail: "127.0.0.1",
      icon: "brand-bun",
    });
    expect(saved.objects.find((object: any) => object.id === "mcp-db")).toMatchObject({
      type: "icon",
      icon: "database",
      text: "Postgres",
      detail: "16 · :5432",
    });

    const reopened = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(textOf(reopened)).toContain('mcp-services section "Bun services"');
    expect(textOf(reopened)).toContain('icon=brand-bun detail="127.0.0.1"');
    expect(textOf(reopened)).toContain('mcp-db database "Postgres"');
    expect(textOf(reopened)).toContain('detail="16 · :5432"');

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
    expect(listed.structuredContent?.canvases).toEqual([
      expect.objectContaining({ id: SOURCE_ID, open: false }),
    ]);

    const topics = await service.call("canvas_guidance", {});
    const topicIds = (topics.structuredContent?.topics as Array<{ id: string }>).map((topic) => topic.id);
    expect(topicIds).toContain("diagram_design");
    expect(textOf(topics)).toContain("tokens");

    const topic = await service.call("canvas_guidance", { topic: "diagram_design" });
    expect(topic.isError).toBeUndefined();
    expect(textOf(topic).length).toBeGreaterThan(1000);

    // Guidance is the lazy path: opening a board carries none of it.
    const opened = await service.call("canvas_open", { canvas: SOURCE_ID });
    expect(textOf(opened)).not.toContain(textOf(topic).split("\n").at(-1)!);
  });
});
