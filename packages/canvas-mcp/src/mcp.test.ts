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

import { createCanvasMcpServer, MCP_INSTRUCTIONS } from "./mcp";
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
    const server = createCanvasMcpServer(tempWorkspace());
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
    expect(tools).toHaveLength(3 + 25 + 6);
  });

  test("tools/list carries the name + detail fields and the section header glyph", async () => {
    const server = createCanvasMcpServer(tempWorkspace());
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
    const server = createCanvasMcpServer(tempWorkspace());
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
});
