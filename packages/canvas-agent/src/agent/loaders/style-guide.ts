/**
 * Renders ALL registered style topics (src/agent/styles/ STYLE_TOPICS) and
 * the craft targets as nested XML blocks. The agent's context.ts wraps the
 * content in <style_guide> tags.
 *
 * Static by design: no sessionData and no per-spawn variation. The full craft
 * corpus is present in every session; the system prompt only summarizes its
 * core taste.
 */
import { createHash } from "node:crypto";

import type { Loader, LoaderResult } from "@agent-kernel/kernel/context";

import { CRAFT_TARGETS, STYLE_TOPICS } from "../styles";
import type { CraftTargets } from "../styles";

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

/** The craft targets as tight lines, one dimension per line. */
export function formatCraftTargets(targets: CraftTargets = CRAFT_TARGETS): string {
  const ink = Math.round(targets.inkShare * 100);
  return [
    "Targets, not minimums to shave toward: a group that will not fit them wants splitting into two sections, not tightening. The lints mark the clearance below which a board breaks; these are where a finished board sits.",
    "",
    `- flow node: ${targets.nodeWidth}×${targets.nodeHeight}, never narrower than ${targets.nodeMinWidth}`,
    `- node gaps: ${targets.nodeGapRow} across a row, ${targets.nodeGapColumn} down a column`,
    `- arrow corridor: ${targets.arrowCorridor} of clear channel wherever a wire and its label pass between siblings`,
    `- section gutters: ${targets.sectionGutterSideBySide} side by side, ${targets.sectionGutterStacked} between stacked rows`,
    `- frame padding: ${targets.framePadding} inside every frame before its first child`,
    `- section load: ${targets.nodesPerSectionMin}–${targets.nodesPerSectionMax} nodes; past ${targets.nodesPerSectionMax}, split into two named sections`,
    `- board size: about ${targets.boardAreaMultiple}× the summed node area, so a finished board reads at about ${ink}% ink`,
  ].join("\n");
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
