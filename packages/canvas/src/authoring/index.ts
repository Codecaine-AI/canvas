/** Shared authoring reference for internal context and future external adapters. */
import type { AuthoringTopic } from "./design";
import { canvasAuthoringTopics, canvasGuidanceSources, canvasGuidanceTopics, guidanceSnapshot } from "./sources";

export type { AuthoringTopic } from "./design";
export { VISUAL_PATTERNS, renderVisualPatterns, type VisualPattern } from "./visual-patterns";
export {
  canvasAuthoringTopics,
  canvasGuidanceSources,
  canvasGuidanceTopics,
  guidanceSnapshot,
  type GuidanceSource,
  type GuidanceTopic,
} from "./sources";
export { CONTACT_SHEET_URI, OPEN_TOOLS } from "./workflow";
export { vocabularyContactSheet } from "../session/perception/contact-sheet";

export function formatAuthoringTopic(topic: AuthoringTopic): string {
  const body = topic.text.split("\n").map(line => line ? `    ${line}` : "").join("\n");
  return `<${topic.id}>\n${body}\n</${topic.id}>`;
}

/**
 * No kernel boot, session creation, or agent spawn is needed to read guidance.
 * The snapshot id covers every source the served guidance is built from, and
 * `topics` are the ten topics `canvas_guidance` serves, the gated workflow first.
 */
export function getCanvasAuthoringGuidance() {
  const sources = canvasGuidanceSources(canvasAuthoringTopics());
  return {
    schemaVersion: 1 as const,
    snapshotId: guidanceSnapshot(sources).snapshotId,
    topics: canvasGuidanceTopics(sources),
  };
}
