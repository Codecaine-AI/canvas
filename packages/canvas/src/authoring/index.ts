/** Shared authoring reference for internal context and future external adapters. */
import type { AuthoringTopic } from "./design";
import { canvasAuthoringTopics, canvasGuidanceSources, guidanceSnapshot } from "./sources";

export type { AuthoringTopic } from "./design";
export { VISUAL_PATTERNS, renderVisualPatterns, type VisualPattern } from "./visual-patterns";
export { canvasAuthoringTopics, canvasGuidanceSources, guidanceSnapshot, type GuidanceSource } from "./sources";
export { vocabularyContactSheet } from "../service/session/perception/contact-sheet";

export function formatAuthoringTopic(topic: AuthoringTopic): string {
  const body = topic.text.split("\n").map(line => line ? `    ${line}` : "").join("\n");
  return `<${topic.id}>\n${body}\n</${topic.id}>`;
}

/**
 * No kernel boot, session creation, or agent spawn is needed to read guidance.
 * The snapshot id covers every source the canvas skill is generated from.
 */
export function getCanvasAuthoringGuidance() {
  const topics = canvasAuthoringTopics();
  return {
    schemaVersion: 1 as const,
    snapshotId: guidanceSnapshot(canvasGuidanceSources(topics)).snapshotId,
    topics,
    text: topics.map(formatAuthoringTopic).join("\n\n"),
  };
}
