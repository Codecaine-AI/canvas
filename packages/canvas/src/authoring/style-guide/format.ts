/**
 * Renders ALL registered style topics (./index STYLE_TOPICS) and the craft
 * targets as nested XML blocks: the aesthetic guidance source the canvas
 * skill is generated from (../sources).
 *
 * Static by design: no per-session variation. The system prompt only
 * summarizes its core taste.
 */
import { CRAFT_TARGETS, STYLE_TOPICS } from "./index";
import type { CraftTargets } from "./index";
import { formatCraftTargets } from "./craft-targets";
export { formatCraftTargets } from "./craft-targets";

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
