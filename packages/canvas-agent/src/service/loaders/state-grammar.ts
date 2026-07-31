/**
 * The <state_grammar> context block loader. The block itself is assembled in
 * src/catalog/layout-editor/context/state-grammar/ — the reading key for the
 * bare-value state blocks and tool results, quoting its line grammars from
 * board/digest.ts and the lint registry so it cannot drift from the renderers.
 *
 * Static by design, like capabilities and the style guide: no sessionData and
 * no per-spawn variation.
 */
import { createHash } from "node:crypto";

import type { Loader, LoaderResult } from "@agent-kernel/kernel/context";

import { formatStateGrammar } from "../../catalog/layout-editor/context/state-grammar";

export { formatStateGrammar };

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export const stateGrammarLoader: Loader = {
  kind: "state-grammar",
  async resolve(_decl, _ctx): Promise<LoaderResult> {
    const content = formatStateGrammar();
    return {
      status: "ok",
      content,
      bytes: Buffer.byteLength(content, "utf8"),
      hash: sha256(content),
    };
  },
};
