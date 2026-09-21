import { createHash } from "node:crypto";
import type { Loader } from "@agent-kernel/kernel/context";
import { canvasAuthoringTopics } from "../../authoring";

/** Each shared topic is a separately named, inspectable standing-context block. */
export const authoringLoaders: readonly Loader[] = canvasAuthoringTopics().map(topic => ({
  kind: `canvas-${topic.id.replaceAll("_", "-")}`,
  async resolve() {
    return {
      status: "ok" as const,
      content: topic.text,
      bytes: Buffer.byteLength(topic.text, "utf8"),
      hash: createHash("sha256").update(topic.text).digest("hex"),
    };
  },
}));
