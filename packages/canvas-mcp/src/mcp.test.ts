/**
 * The MCP surface itself, over the SDK's in-memory transport and over real
 * stdio: tools/list carries every gesture with the agent's own schema, and a
 * spawned `codecaine-canvas mcp` answers initialize, tools/list, canvas_open,
 * and an edit.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { operationTools, workflowTools } from "@codecaine-ai/canvas-agent/toolkit";

import { openActionLog } from "@codecaine-ai/action-log";
import { createCanvasMcpServer,MCP_INSTRUCTIONS } from "./mcp";
import { jsonSchema } from "./service";

const REPO_CANVASES = join(import.meta.dir, "..", "..", "..", "canvases");
const CLI = join(import.meta.dir, "cli.ts");

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function tempWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "canvas-mcp-protocol-"));
  cleanups.push(() => rmSync(workspace, { recursive: true, force: true }));
  mkdirSync(join(workspace, "canvases"));
  copyFileSync(join(REPO_CANVASES, "v2-flow.canvas.json"), join(workspace, "canvases", "v2-flow.canvas.json"));
  return workspace;
}

describe("canvas MCP server", () => {
  test("tools/list exposes all 25 operation tools with their exact names, descriptions, and schemas", async () => {
    const server = createCanvasMcpServer({ workspace: tempWorkspace() });
    const client = new Client({ name: "canvas-mcp-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    cleanups.push(() => client.close());

    expect(client.getInstructions()).toBe(MCP_INSTRUCTIONS);
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(operationTools).toHaveLength(25);
    for (const operation of operationTools) {
      const listed = byName.get(operation.name);
      expect(listed, operation.name).toBeDefined();
      expect(listed!.description).toBe(operation.description);
      expect(listed!.inputSchema).toEqual(jsonSchema(operation.parameters));
    }
    for (const workflow of workflowTools.filter((tool) => tool.name !== "finalize")) {
      expect(byName.get(workflow.name)?.inputSchema).toEqual(jsonSchema(workflow.parameters));
    }
    expect(byName.has("finalize")).toBe(false);
    expect(tools.slice(0, 3).map((tool) => tool.name)).toEqual(["canvas_list", "canvas_open", "canvas_guidance"]);
    expect(tools).toHaveLength(5 + 25 + 6);
  });

  test("tools/list carries the name + detail fields and the section header glyph", async () => {
    const server = createCanvasMcpServer({ workspace: tempWorkspace() });
    const client = new Client({ name: "canvas-mcp-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    cleanups.push(() => client.close());

    const { tools } = await client.listTools();
    const schema = (name: string) => tools.find((tool) => tool.name === name)!.inputSchema as {
      properties: Record<string, any>;
      required?: string[];
    };

    expect(Object.keys(schema("place_section").properties)).toEqual(["id", "text", "at", "size", "detail", "icon"]);
    expect(schema("place_section").required).toEqual(["id", "text", "at"]);
    expect(Object.keys(schema("place_shape").properties)).toEqual(["id", "type", "at", "detail"]);
    expect(Object.keys(schema("clone").properties)).toContain("detail");
    // update_text: either field alone, so only the id is required.
    expect(Object.keys(schema("update_text").properties)).toEqual(["id", "text", "detail"]);
    expect(schema("update_text").required).toEqual(["id"]);
    expect(Object.keys(schema("change_shape").properties.patch.properties)).toEqual(["type", "direction", "icon"]);
  });

  test("no listed schema carries a draft-07 tuple, which the Anthropic API rejects", async () => {
    const server = createCanvasMcpServer({ workspace: tempWorkspace() });
    const client = new Client({ name: "canvas-mcp-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    cleanups.push(() => client.close());

    const offenders: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (node === null || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (Array.isArray(record.items) || "additionalItems" in record) offenders.push(path);
      for (const [key, value] of Object.entries(record)) walk(value, `${path}/${key}`);
    };
    const { tools } = await client.listTools();
    for (const tool of tools) walk(tool.inputSchema, tool.name);
    expect(offenders).toEqual([]);

    const at = (tools.find((tool) => tool.name === "place_sticky")!.inputSchema.properties as any).at;
    expect(at).toMatchObject({ type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 });
  });

  test("stdio: initialize, tools/list, canvas_open, and one edit", async () => {
    const workspace = tempWorkspace();
    const path = join(workspace, "canvases", "v2-flow.canvas.json");
    const client = new Client({ name: "canvas-mcp-stdio-test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [CLI, "mcp", "--workspace", workspace],
      cwd: workspace,
      stderr: "pipe",
    }));
    cleanups.push(() => client.close());

    expect(client.getServerVersion()?.name).toBe("codecaine-canvas");
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("place_sticky");

    const opened = await client.callTool({ name: "canvas_open", arguments: { canvas: "v2-flow" } });
    expect(opened.isError).toBeFalsy();
    expect((opened.content as Array<{ text: string }>)[0]!.text).toContain("OPENED · v2-flow");

    const placed = await client.callTool({
      name: "place_sticky",
      arguments: { id: "stdio-note", text: "Over stdio", at: [960, 1600] },
    });
    expect(placed.isError).toBeFalsy();
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved.objects.some((object: { id: string }) => object.id === "stdio-note")).toBe(true);
  }, 30_000);

  test("stdio: --workspace contains every path, the project resolves first, and --canvases holds the ids", async () => {
    const root = mkdtempSync(join(tmpdir(), "canvas-mcp-roots-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const board = join(REPO_CANVASES, "v2-flow.canvas.json");
    // Workspace w has no canvases/. Project w/proj has its own; w/bare does not.
    const [workspace, boards, elsewhere] = ["w", "boards", "elsewhere"].map((name) => join(root, name));
    const [project, bare] = ["proj", "bare"].map((name) => join(workspace, name));
    const sidecar = join(workspace, "pages", "x", "assets", "canvases", "a.canvas.json");
    const projectBoard = join(project, "canvases", "v2.canvas.json");
    const stray = join(elsewhere, "a.canvas.json");
    for (const dir of [join(sidecar, ".."), join(projectBoard, ".."), bare, boards, elsewhere]) {
      mkdirSync(dir, { recursive: true });
    }
    for (const path of [sidecar, projectBoard, join(boards, "standalone.canvas.json"), stray]) copyFileSync(board, path);

    const session = async (cwd: string) => {
      const client = new Client({ name: "canvas-mcp-stdio-test", version: "1.0.0" });
      await client.connect(new StdioClientTransport({
        command: process.execPath,
        args: [CLI, "mcp", "--workspace", workspace, "--canvases", boards],
        cwd,
        stderr: "pipe",
      }));
      cleanups.push(() => client.close());
      return async (canvas: string) => {
        const result = await client.callTool({ name: "canvas_open", arguments: { canvas } });
        return { isError: Boolean(result.isError), text: (result.content as Array<{ text: string }>)[0]!.text };
      };
    };

    const inProject = await session(project);
    const relative = await inProject("canvases/v2.canvas.json");
    expect(relative.isError).toBe(false);
    expect(relative.text).toContain(" · proj/canvases/v2.canvas.json · sha256:");

    const projectId = await inProject("v2");
    expect(projectId.isError).toBe(false);
    expect(projectId.text).toContain(" · proj/canvases/v2.canvas.json · sha256:");

    // Not in the project, so the path resolves against the workspace.
    const page = await inProject("pages/x/assets/canvases/a.canvas.json");
    expect(page.isError).toBe(false);
    expect(page.text).toContain(" · pages/x/assets/canvases/a.canvas.json · sha256:");

    for (const outside of ["../../elsewhere/a.canvas.json", stray]) {
      const refused = await inProject(outside);
      expect(refused.isError).toBe(true);
      expect(refused.text).toContain("is outside the workspace");
    }

    const byId = await (await session(bare))("standalone");
    expect(byId.isError).toBe(false);
    expect(byId.text).toContain(` · ${join(boards, "standalone.canvas.json")} · sha256:`);
  }, 30_000);

  test("stdio: an edit's APPLIED line, lint delta, and fix guidance reach what Claude Code and Codex show", async () => {
    const workspace = tempWorkspace();
    const client = new Client({ name: "canvas-mcp-stdio-test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [CLI, "mcp", "--workspace", workspace],
      cwd: workspace,
      stderr: "pipe",
    }));
    cleanups.push(() => client.close());
    // Both harnesses show structuredContent instead of the text blocks when a
    // result has it, so a result must carry text blocks only.
    const shown = (result: Awaited<ReturnType<typeof client.callTool>>) => {
      expect(result.structuredContent).toBeUndefined();
      return (result.content as Array<{ type: string; text?: string }>)
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n");
    };

    const opened = await client.callTool({ name: "canvas_open", arguments: { canvas: "v2-flow" } });
    expect(shown(opened)).toContain("OPENED · v2-flow");
    expect(shown(opened)).toContain("BOARD");

    const raised = await client.callTool({
      name: "place_shape",
      arguments: { id: "fb-shape", type: "process", at: [960, 1600], detail: "A detail written as a whole sentence that runs far past one fact" },
    });
    expect(raised.isError).toBeFalsy();
    expect(shown(raised)).toContain("APPLIED · place_shape fb-shape");
    expect(shown(raised)).toMatch(/LINTS · \+\d+ −0/);
    expect(shown(raised)).toContain("detail-too-long: fb-shape's detail has");
    expect(shown(raised)).toContain("cut the detail to one fact with update_text fb-shape");

    const cleared = await client.callTool({ name: "update_text", arguments: { id: "fb-shape", detail: "One fact" } });
    expect(shown(cleared)).toContain("APPLIED · update_text fb-shape");
    expect(shown(cleared)).toMatch(/LINTS · \+0 −\d+/);
    expect(shown(cleared)).toContain("− W");
    expect(shown(cleared)).toMatch(/detail-too-long.*\(resolved\)/);
  }, 30_000);
});

describe("canvas MCP action log", () => {
  const savedEnv = { log: process.env.CODECAINE_ACTION_LOG, thread: process.env.T3CODE_THREAD_ID };
  afterEach(() => {
    for (const [key, value] of [["CODECAINE_ACTION_LOG", savedEnv.log], ["T3CODE_THREAD_ID", savedEnv.thread]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  async function connect(workspace = tempWorkspace()) {
    const server = createCanvasMcpServer({ workspace });
    const client = new Client({ name: "canvas-mcp-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    cleanups.push(() => client.close());
    return client;
  }

  function logPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "canvas-mcp-log-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, "log.sqlite");
    process.env.CODECAINE_ACTION_LOG = path;
    return path;
  }

  test("a call with T3CODE_THREAD_ID writes one record with that thread and tool", async () => {
    const path = logPath();
    process.env.T3CODE_THREAD_ID = "thread-env";
    const client = await connect();
    await client.callTool({ name: "canvas_list", arguments: {} });

    const log = openActionLog({ path });
    cleanups.push(() => log.close());
    const records = log.query({ threadId: "thread-env" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ tool: "canvas_list", target: "-", result: "ok" });
  });

  test("canvas_open with thread_id joins the whole run to that thread without the env variable", async () => {
    const path = logPath();
    delete process.env.T3CODE_THREAD_ID;
    const client = await connect();
    await client.callTool({ name: "canvas_open", arguments: { canvas: "v2-flow", thread_id: "thread-arg" } });
    await client.callTool({ name: "place_sticky", arguments: { id: "log-note", text: "Logged", at: [960, 1600] } });
    await client.callTool({ name: "canvas_guidance", arguments: {} });
    await client.callTool({ name: "canvas_open", arguments: { canvas: "no-such-board" } });
    await client.callTool({ name: "canvas_create", arguments: { canvas: "v2-flow", title: "Taken" } });
    await client.callTool({ name: "canvas_open", arguments: { canvas: "canvases/v2-flow.canvas.json" } });

    const log = openActionLog({ path });
    cleanups.push(() => log.close());
    const records = log.query({ threadId: "thread-arg" });
    expect(records.map((record) => [record.tool, record.target, record.result])).toEqual([
      ["canvas_open", "v2-flow", "ok"],
      ["place_sticky", "v2-flow", expect.stringMatching(/^ok/)],
      ["canvas_guidance", "-", "ok"],
      ["canvas_open", "no-such-board", "refused"],
      ["canvas_create", "v2-flow", "refused"],
      ["canvas_open", "v2-flow", "ok"],
    ]);
    expect(records[2]!.snapshotId).toMatch(/\S/);
  });

  test("two opens in flight at once each log the board they opened", async () => {
    const path = logPath();
    delete process.env.T3CODE_THREAD_ID;
    const workspace = tempWorkspace();
    copyFileSync(join(workspace, "canvases", "v2-flow.canvas.json"), join(workspace, "canvases", "board-b.canvas.json"));
    const client = await connect(workspace);
    await Promise.all([
      client.callTool({ name: "canvas_open", arguments: { canvas: "v2-flow", thread_id: "thread-race" } }),
      client.callTool({ name: "canvas_open", arguments: { canvas: "board-b" } }),
    ]);
    const log = openActionLog({ path });
    cleanups.push(() => log.close());
    const opens = log.query({ threadId: "thread-race" }).map((record) => record.target).sort();
    expect(opens).toEqual(["board-b", "v2-flow"]);
  });

  test("a failed log write never fails the tool call", async () => {
    process.env.CODECAINE_ACTION_LOG = "/dev/null/blocked/log.sqlite";
    const client = await connect();
    const result = await client.callTool({ name: "canvas_list", arguments: {} });
    expect(result.isError).toBeFalsy();
  });
});
