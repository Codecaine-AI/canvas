/**
 * <lints> — the open findings, re-run over the live draft every request.
 *
 * The tag's attrs are the only place the counts appear; the body is the
 * findings themselves, grouped under one <errors> and one <warnings> child so
 * severity is structure rather than a prefix to parse. A clean board is a
 * self-closing tag. Without a live read the spawn-time counts stand in and
 * the body says where the stale report lives.
 */
import { block } from "./block";
import type { LivePicture } from "./live";
import type { BoardWorkState } from "../shape";

function severityGroup(tag: "errors" | "warnings", lines: string[]): string[] {
  if (lines.length === 0) return [];
  return [`<${tag}>`, ...lines.map((line) => `    ${line}`), `</${tag}>`];
}

export function lintsBlock(state: BoardWorkState, live: LivePicture | null): string[] {
  if (!live) {
    const was = state.seeded.lints;
    return block(
      "lints",
      `errors="${was.errors}" warnings="${was.warnings}"`,
      "(spawn-time counts; the live report is inside the stale board snapshot above)",
    );
  }
  const body = [
    ...severityGroup("errors", live.errorLines),
    ...severityGroup("warnings", live.warningLines),
  ].join("\n");
  return block("lints", `errors="${live.errors}" warnings="${live.warnings}"`, body);
}
