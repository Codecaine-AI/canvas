/**
 * Renders ALL registered style topics (./index STYLE_TOPICS) as nested XML
 * blocks: the aesthetic guidance source (../sources).
 *
 * Static by design: no per-session variation. The system prompt only
 * summarizes its core taste.
 */
import { STYLE_TOPICS } from "./index";
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

/**
 * A framing line, then the prose topics as nested XML blocks. The craft targets
 * are served once, in topic canvas_conventions, not here as well.
 */
export function formatStyleGuide(): string {
  const topics = STYLE_TOPICS
    .map((topic) => topicBlock(topic.id, topic.prose))
    .join("\n\n");
  return `The house style preferences: deliberate defaults for visual judgment, not laws.\n\n${topics}`;
}
