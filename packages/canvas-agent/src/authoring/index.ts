/** Shared authoring reference for internal context and future external adapters. */
import { createHash } from "node:crypto";
import { DESIGN_TOPICS, type AuthoringTopic } from "./design";
import { visualVocabulary, colorPalette } from "./vocabulary";
import { canvasConventions } from "./conventions";

export type { AuthoringTopic } from "./design";
export { VISUAL_PATTERNS, renderVisualPatterns, type VisualPattern } from "./visual-patterns";

export function canvasAuthoringTopics(): readonly AuthoringTopic[] {
  return [...DESIGN_TOPICS, visualVocabulary(), colorPalette(), canvasConventions()];
}

export function formatAuthoringTopic(topic: AuthoringTopic): string {
  const body = topic.text.split("\n").map(line => line ? `    ${line}` : "").join("\n");
  return `<${topic.id}>\n${body}\n</${topic.id}>`;
}

/** No kernel boot, session creation, or agent spawn is needed to read guidance. */
export function getCanvasAuthoringGuidance() {
  const topics = canvasAuthoringTopics();
  const text = topics.map(formatAuthoringTopic).join("\n\n");
  return {
    schemaVersion: 1 as const,
    snapshotId: `sha256:${createHash("sha256").update(text).digest("hex")}`,
    topics,
    text,
  };
}
