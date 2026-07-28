/**
 * The wire contract of the REGISTERED surface, read off the tools the agent
 * bundle actually declares rather than off the specs behind them.
 *
 * Two properties, both invisible from any single tool file:
 *
 *  1. Every root schema is SEALED. An unsealed root accepts whatever the model
 *     invents — `place_sticky {size, color}` or `move_by {ids}` would validate
 *     and be silently dropped, which reads to the model as a gesture that did
 *     something it did not do.
 *  2. No mutator carries `view`. Seeing the board is `look`'s job: `look view:`
 *     takes the close-up, and an edit returns text.
 *
 * The roster count is asserted here too, so a tool added without a home in the
 * roster (docs/30-agent-layout/50-tool-surface/00-overview) has to be argued
 * for, and the pinned order is the registration order
 * (docs/30-agent-layout/50-tool-surface/40-registration-and-seam).
 */
import { describe, expect, test } from "bun:test";

import { validateToolArguments, type Tool } from "@mariozechner/pi-ai";

import { tools } from "../src/catalog/layout-editor/tools";
import type { ToolRegistrar } from "../src/catalog/layout-editor/tools";
import { operationTools } from "../src/service/session/tools/operations";

interface RegisteredTool {
  name: string;
  parameters: {
    type?: string;
    additionalProperties?: unknown;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/** Every tool the bundle registers, collected through a recording registrar. */
function registeredTools(): RegisteredTool[] {
  const collected: RegisteredTool[] = [];
  const pi = {
    on: () => {},
    registerTool: (tool: RegisteredTool) => {
      collected.push(tool);
    },
  } as unknown as ToolRegistrar;
  tools(pi, undefined);
  return collected;
}

/** The seven non-gesture calls — perceive, ask, finish. */
const WORKFLOW_TOOLS = [
  "look",
  "update_description",
  "set_board_title",
  "add_annotation",
  "reply_annotation",
  "resolve_request",
  "finalize",
];

describe("registered tool schemas", () => {
  test("the surface is the gesture roster plus the seven workflow calls", () => {
    const names = registeredTools().map((tool) => tool.name);

    expect(names).toEqual([
      ...operationTools.map((tool) => tool.name),
      ...WORKFLOW_TOOLS,
    ]);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(32);
  });

  test("every root schema is a sealed object", () => {
    for (const tool of registeredTools()) {
      expect(tool.parameters.type, tool.name).toBe("object");
      expect(tool.parameters.additionalProperties, tool.name).toBe(false);
    }
  });

  test("resize rejects a stray like at the wire layer", () => {
    const resize = registeredTools().find((tool) => tool.name === "resize")!;

    expect(() => validateToolArguments(resize as Tool, {
      type: "toolCall",
      id: "stray-resize-like",
      name: "resize",
      arguments: { id: "alpha", width: 200, like: "beta" },
    })).toThrow("must not have additional properties");
  });

  test("no mutator declares view — the close-up is look's", () => {
    const mutators = new Set(operationTools.map((tool) => tool.name));

    for (const tool of registeredTools()) {
      if (!mutators.has(tool.name)) continue;
      expect(Object.keys(tool.parameters.properties ?? {}), tool.name)
        .not.toContain("view");
    }

    // …and `look` is where it lives: one required knob, nothing else.
    const look = registeredTools().find((tool) => tool.name === "look")!;
    expect(Object.keys(look.parameters.properties ?? {})).toEqual(["view"]);
    expect(look.parameters.required).toEqual(["view"]);
  });

  test("look rejects a stray rect knob at the wire layer", () => {
    const look = registeredTools().find((tool) => tool.name === "look")!;

    expect(() => validateToolArguments(look as Tool, {
      type: "toolCall",
      id: "stray-look-at",
      name: "look",
      arguments: { view: "home", at: { x: 0, y: 0, width: 480, height: 200 } },
    })).toThrow("must not have additional properties");
  });
});
