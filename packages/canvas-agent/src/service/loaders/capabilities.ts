/**
 * The <capabilities> context block loader. The block itself is assembled in
 * src/catalog/layout-editor/context/capabilities/ as four flat kind
 * sections.
 * Each section combines hand-written framing, completeness-guarded operation
 * declarations, and the generated schema fragments used by OBJECTS and
 * CONNECTIONS.
 *
 * Static by design, like the style guide: no sessionData and no per-spawn
 * variation.
 */
import { createHash } from "node:crypto";

import type { Loader, LoaderResult } from "@agent-kernel/kernel/context";

import { formatCapabilities } from "../../catalog/layout-editor/context/capabilities";

export { formatCapabilities };

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export const capabilitiesLoader: Loader = {
  kind: "capabilities",
  async resolve(_decl, _ctx): Promise<LoaderResult> {
    const content = formatCapabilities();
    return {
      status: "ok",
      content,
      bytes: Buffer.byteLength(content, "utf8"),
      hash: sha256(content),
    };
  },
};
