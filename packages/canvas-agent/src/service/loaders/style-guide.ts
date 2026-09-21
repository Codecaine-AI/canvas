/**
 * Renders ALL registered style topics (the layout-editor bundle's
 * context/style-guide/ STYLE_TOPICS) and
 * the craft targets as nested XML blocks. The agent's context/index.ts wraps
 * the content in <style_guide> tags.
 *
 * Static by design: no sessionData and no per-spawn variation. The full craft
 * corpus is present in every session; the system prompt only summarizes its
 * core taste.
 */
import { createHash } from "node:crypto";

import type { Loader, LoaderResult } from "@agent-kernel/kernel/context";

import { CRAFT_TARGETS, STYLE_TOPICS } from "../../catalog/layout-editor/context/style-guide";
import type { CraftTargets } from "../../catalog/layout-editor/context/style-guide";
import { formatCraftTargets } from "../../catalog/layout-editor/context/style-guide/craft-targets";
export { formatCraftTargets } from "../../catalog/layout-editor/context/style-guide/craft-targets";

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const INDENT = "    ";

/** One nested XML block per topic; the tag is the topic id in snake_case. */
function topicBlock(id: string, prose: string): string {
  const tag = id.replaceAll("-", "_");
  const body = prose
    .split("\n")
    .map((line) => (line.length > 0 ? `${INDENT}${line}` : line))
    .join("\n");
  return `<${tag}>\n${body}\n</${tag}>`;
}

/** A framing line, then prose topics and craft targets as nested XML blocks. */
export function formatStyleGuide(targets: CraftTargets = CRAFT_TARGETS): string {
  const topics = STYLE_TOPICS
    .map((topic) => topicBlock(topic.id, topic.prose))
    .join("\n\n");
  const craft = topicBlock("craft-targets", formatCraftTargets(targets));
  return `The house style preferences: deliberate defaults for visual judgment, not laws.\n\n${topics}\n\n${craft}`;
}

export const styleGuideLoader: Loader = {
  kind: "style-guide",
  async resolve(_decl, _ctx): Promise<LoaderResult> {
    const content = formatStyleGuide();
    return {
      status: "ok",
      content,
      bytes: Buffer.byteLength(content, "utf8"),
      hash: sha256(content),
    };
  },
};
