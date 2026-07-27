/**
 * The seam every tool in this folder goes through.
 *
 * A tool file declares a name, a description, and a parameter schema; the work
 * itself happens in the harness session store, bound at spawn time through the
 * kernel config's `toolRuntime` slot. These helpers are the whole bridge:
 * `requireRuntime` fails loudly if the harness did not bind one, and
 * `toToolResult` turns a runtime result into the kernel's content-block shape,
 * lifting any PNGs the call produced into image blocks.
 */
import type { AgentPrivateTools } from "@agent-kernel/kernel/agent-definition";

import type {
  LayoutToolRenderResult,
  LayoutToolRuntime,
  LayoutToolTextResult,
} from "../../../../service/tool-runtime";

export type { LayoutToolRuntime };

/** The registration API `defineTools` hands each tool file. */
export type ToolRegistrar = Parameters<AgentPrivateTools<LayoutToolRuntime>>[0];

/** What every tool file in this folder exports. */
export type ToolRegistration = (
  pi: ToolRegistrar,
  runtime: LayoutToolRuntime | undefined,
) => void;

export function requireRuntime(runtime: LayoutToolRuntime | undefined): LayoutToolRuntime {
  if (!runtime) {
    throw new Error("canvas-agent layout tool runtime was not provided by the harness.");
  }
  return runtime;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export function toToolResult(
  result: LayoutToolTextResult | LayoutToolRenderResult,
  terminate = false,
) {
  const content: ContentBlock[] = [{ type: "text", text: result.text }];
  if ("pngs" in result && result.pngs) {
    for (const png of result.pngs) {
      content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
    }
  }
  return {
    content,
    details: result.details ?? {},
    isError: result.isError === true,
    ...(terminate && !result.isError ? { terminate: true } : {}),
  };
}
