/**
 * The canvas guidance source manifest: every text `canvas_guidance` serves,
 * in one list. The guidance snapshot id hashes this list, so
 * `canvas_capabilities` and the action log name the guidance a process served.
 * `canvasGuidanceTopics` builds the ten served topics from these sources.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { DEFAULT_CANVAS_STYLE } from "../theme/canvas-style";
import { renderXmlMarkdown, type PromptDocument } from "@codecaine-ai/prompt-kit";

import { formatStateGrammar } from "./state-grammar";
import { formatStyleGuide } from "./style-guide/format";
import { buildVocabularyDocument } from "../session/perception/contact-sheet";
import { canvasConventions } from "./conventions";
import { DESIGN_TOPICS, type AuthoringTopic } from "./design";
import { canvasRules } from "./rules";
import { VISUAL_PATTERNS, renderVisualPatterns } from "./visual-patterns";
import { colorPalette, visualVocabulary } from "./vocabulary";
import { canvasWorkflow } from "./workflow";

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

const CANVAS = "packages/canvas/src";
const PROMPT_PATH = `${CANVAS}/authoring/prompt/prompt.json`;

/** The file that owns each `canvas_guidance` topic. */
const TOPIC_PATHS: Record<string, string> = {
  workflow: `${CANVAS}/authoring/workflow.ts`,
  rules: `${CANVAS}/authoring/rules.ts`,
  diagram_design: `${CANVAS}/authoring/design.ts`,
  visual_vocabulary: `${CANVAS}/authoring/vocabulary.ts`,
  color_palette: `${CANVAS}/authoring/vocabulary.ts`,
  canvas_conventions: `${CANVAS}/authoring/conventions.ts`,
};

/** The layout-editor system prompt, rendered from prompt.json as Prompt Kit renders system.md. */
function layoutEditorPrompt(): string {
  const raw = readFileSync(new URL("./prompt/prompt.json", import.meta.url), "utf8");
  return renderXmlMarkdown(JSON.parse(raw) as PromptDocument);
}

/**
 * Every source, in manifest order. The contact sheet's source is its input
 * document in the default style, so hashing it needs no rasterization.
 */
export function canvasGuidanceSources(topics: readonly AuthoringTopic[] = canvasAuthoringTopics()): GuidanceSource[] {
  const workflow = canvasWorkflow();
  const rules = canvasRules();
  return [
    { id: workflow.id, path: TOPIC_PATHS.workflow!, text: workflow.text, title: workflow.title },
    { id: rules.id, path: TOPIC_PATHS.rules!, text: rules.text, title: rules.title },
    { id: "prompt", path: PROMPT_PATH, text: layoutEditorPrompt() },
    { id: "state_grammar", path: `${CANVAS}/authoring/state-grammar.ts`, text: formatStateGrammar() },
    { id: "aesthetic", path: `${CANVAS}/authoring/style-guide/aesthetic.ts`, text: formatStyleGuide() },
    { id: "visual_patterns", path: `${CANVAS}/authoring/visual-patterns.ts`, text: renderVisualPatterns() },
    ...topics.map(topic => ({
      id: topic.id,
      path: TOPIC_PATHS[topic.id] ?? `${CANVAS}/authoring`,
      text: topic.text,
      title: topic.title,
    })),
    {
      id: "contact_sheet",
      path: `${CANVAS}/session/perception/contact-sheet.ts`,
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

/** One served topic: the heading `canvas_guidance` prints, and its text. */
export interface GuidanceTopic {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  /** The source ids the topic is built from, for the generated file's stamp. */
  readonly sources: readonly string[];
}

const tagged = (tag: string, text: string) =>
  `<${tag}>\n${text.split("\n").map(line => line ? `    ${line}` : line).join("\n")}\n</${tag}>`;

/** The layout editor's standing context, kept whole: its prompt, the state grammar and the aesthetic. */
function operatingContext(source: (id: string) => GuidanceSource): string {
  return [
    "The reading key for MCP results, and the house style.",
    "",
    "- `canvas_open` returns the board digest and lints, every edit returns its delta and lint changes,",
    "  and `look` renders one region. The state grammar says how to read them.",
    "- The aesthetic topic is the house style.",
    "",
    "## State Grammar",
    "",
    tagged("state_grammar", source("state_grammar").text),
    "",
    "## Aesthetic",
    "",
    tagged("style_guide", source("aesthetic").text),
  ].join("\n");
}

/** The visual patterns as Markdown, one heading and sketch per pattern. */
function visualPatternsMarkdown(): string {
  return [
    `The ${VISUAL_PATTERNS.length} patterns a diagram composes. Each sketch is conceptual, not literal coordinates.`,
    ...VISUAL_PATTERNS.flatMap(pattern => [
      "",
      `## ${pattern.name} (\`${pattern.id}\`)`,
      "",
      pattern.description,
      "",
      "```text",
      pattern.ascii,
      "```",
      "",
      `Use case: ${pattern.useCase}`,
    ]),
  ].join("\n");
}

/** The ten `canvas_guidance` topics, the gated workflow first, built from `sources`. */
export function canvasGuidanceTopics(sources: readonly GuidanceSource[] = canvasGuidanceSources()): GuidanceTopic[] {
  const source = (id: string) => {
    const found = sources.find(entry => entry.id === id);
    if (!found) throw new Error(`canvas guidance manifest has no "${id}" source`);
    return found;
  };
  const plain = (id: string, title?: string): GuidanceTopic =>
    ({ id, title: title ?? source(id).title ?? id, text: source(id).text, sources: [id] });
  return [
    plain("workflow"),
    plain("rules"),
    {
      id: "operating_context",
      title: "Operating Context",
      text: operatingContext(source),
      sources: ["state_grammar", "aesthetic"],
    },
    plain("state_grammar", "State Grammar"),
    plain("aesthetic", "Aesthetic"),
    { id: "visual_patterns", title: "Visual Patterns", text: visualPatternsMarkdown(), sources: ["visual_patterns"] },
    plain("diagram_design"),
    plain("visual_vocabulary"),
    plain("color_palette"),
    plain("canvas_conventions"),
  ];
}
