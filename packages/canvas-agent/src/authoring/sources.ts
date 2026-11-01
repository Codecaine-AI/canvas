/**
 * The canvas guidance source manifest: every text the canvas skill is
 * generated from, in one list. `canvas_guidance` and the skill's snapshot.json
 * both hash this list, so a skill whose snapshot id differs from the server's
 * was generated from other sources and is stale.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { DEFAULT_CANVAS_STYLE } from "@codecaine-ai/canvas/style";
import { renderXmlMarkdown, type PromptDocument } from "@codecaine-ai/prompt-kit";

import { formatStateGrammar } from "../catalog/layout-editor/context/state-grammar";
import { formatStyleGuide } from "../service/loaders/style-guide";
import { buildVocabularyDocument } from "../service/session/perception/contact-sheet";
import { canvasConventions } from "./conventions";
import { DESIGN_TOPICS, type AuthoringTopic } from "./design";
import { renderVisualPatterns } from "./visual-patterns";
import { colorPalette, visualVocabulary } from "./vocabulary";

export function canvasAuthoringTopics(): readonly AuthoringTopic[] {
  return [...DESIGN_TOPICS, visualVocabulary(), colorPalette(), canvasConventions()];
}

/** One source: its id, the canvas-repo file that owns it, and the text rendered from it. */
export interface GuidanceSource {
  readonly id: string;
  readonly path: string;
  readonly text: string;
  /** A `canvas_guidance` topic's title. */
  readonly title?: string;
}

const AGENT = "packages/canvas-agent/src";
const PROMPT_PATH = `${AGENT}/catalog/layout-editor/prompt/prompt.json`;

/** The file that owns each `canvas_guidance` topic. */
const TOPIC_PATHS: Record<string, string> = {
  diagram_design: `${AGENT}/authoring/design.ts`,
  visual_vocabulary: `${AGENT}/authoring/vocabulary.ts`,
  color_palette: `${AGENT}/authoring/vocabulary.ts`,
  canvas_conventions: `${AGENT}/authoring/conventions.ts`,
};

/** The layout-editor system prompt, rendered from prompt.json as the kernel renders system.md. */
function layoutEditorPrompt(): string {
  const raw = readFileSync(new URL("../catalog/layout-editor/prompt/prompt.json", import.meta.url), "utf8");
  return renderXmlMarkdown(JSON.parse(raw) as PromptDocument);
}

/**
 * Every source, in manifest order. The contact sheet's source is its input
 * document in the default style, so hashing it needs no rasterization.
 */
export function canvasGuidanceSources(topics: readonly AuthoringTopic[] = canvasAuthoringTopics()): GuidanceSource[] {
  return [
    { id: "prompt", path: PROMPT_PATH, text: layoutEditorPrompt() },
    { id: "state_grammar", path: `${AGENT}/catalog/layout-editor/context/state-grammar/index.ts`, text: formatStateGrammar() },
    { id: "aesthetic", path: `${AGENT}/catalog/layout-editor/context/style-guide/aesthetic.ts`, text: formatStyleGuide() },
    { id: "visual_patterns", path: `${AGENT}/authoring/visual-patterns.ts`, text: renderVisualPatterns() },
    ...topics.map(topic => ({
      id: topic.id,
      path: TOPIC_PATHS[topic.id] ?? `${AGENT}/authoring`,
      text: topic.text,
      title: topic.title,
    })),
    {
      id: "contact_sheet",
      path: `${AGENT}/service/session/perception/contact-sheet.ts`,
      text: JSON.stringify(buildVocabularyDocument(DEFAULT_CANVAS_STYLE)),
    },
  ];
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** The per-source hashes and the snapshot id over all of them, in manifest order. */
export function guidanceSnapshot(sources: readonly GuidanceSource[] = canvasGuidanceSources()) {
  const hashed = sources.map(source => ({ id: source.id, path: source.path, sha256: sha256(source.text) }));
  const snapshotId = `sha256:${sha256(hashed.map(source => `${source.id} ${source.sha256}\n`).join(""))}`;
  return { snapshotId, sources: hashed };
}
