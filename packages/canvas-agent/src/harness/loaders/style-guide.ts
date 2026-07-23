/**
 * The `style-guide` context loader (v5 Phase B — v5-plan.md §1 Tier B):
 * concatenates ALL registered style topics (src/styles/ STYLE_TOPICS) into
 * one title-headed text block. The agent's context.ts wraps the content in
 * <style_guide> tags.
 *
 * Static by design: no sessionData, no per-spawn variation — the full
 * stylization corpus is represented in-context on every spawn, visible in
 * the trace viewer's context renderer. Context bloat is explicitly accepted
 * (Ford, 2026-07-22).
 */
import { createHash } from "node:crypto";

import type { Loader, LoaderResult } from "@agent-kernel/kernel/context";

import { STYLE_TOPICS } from "../../styles";

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Title-headed sections, one per topic, in registry order. */
export function formatStyleGuide(): string {
  return STYLE_TOPICS
    .map((topic) => `## ${topic.title}\n\n${topic.prose}`)
    .join("\n\n");
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
