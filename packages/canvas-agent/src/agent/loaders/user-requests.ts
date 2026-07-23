/**
 * Renders the <user_requests> block: the read-only queue of user comments and
 * requests (canvas annotations) addressed to the agent. The session store
 * pre-formats the queue at spawn via formatUserRequests and places it at
 * `sessionData.userRequests`; the agent answers requests by editing board
 * content — annotations never appear in the board digest and are never
 * agent-writable.
 */
import { createHash } from "node:crypto";

import type { Loader, LoaderResult } from "@agent-kernel/kernel/context";

import type { AgentRect, AgentSessionAnnotation } from "../../protocol";

export const USER_REQUESTS_EMPTY = "(none — no user comments or requests on this board)";

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function fmt(value: number): string {
  return String(Math.round(value));
}

function regionText(region: AgentRect): string {
  return `${fmt(region.x)},${fmt(region.y)} ${fmt(region.width)}×${fmt(region.height)}`;
}

function targetText(annotation: AgentSessionAnnotation): string {
  switch (annotation.target.kind) {
    case "object":
      return `object:${annotation.target.objectId}`;
    case "connection":
      return `connection:${annotation.target.connectionId}`;
    case "region":
      return `region:${regionText(annotation.target.region)}`;
  }
}

function clip(text: string, max = 200): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  const kept = oneLine.slice(0, max - 1);
  return `${kept}…(+${oneLine.length - kept.length}ch)`;
}

/** The queue text: one line per request, or the explicit empty marker. */
export function formatUserRequests(annotations: readonly AgentSessionAnnotation[]): string {
  if (annotations.length === 0) return USER_REQUESTS_EMPTY;
  const lines = [
    'user comments/requests addressed to you (read-only — respond by editing board content)  # id · target · intent/status · "body"',
  ];
  for (const annotation of annotations) {
    const status = annotation.status ?? "open";
    lines.push(
      `  ${annotation.id}  ${targetText(annotation)}  ${annotation.intent}/${status}  ${JSON.stringify(clip(annotation.body))}`,
    );
  }
  return lines.join("\n");
}

export const userRequestsLoader: Loader = {
  kind: "user-requests",
  async resolve(_decl, ctx): Promise<LoaderResult> {
    const userRequests = ctx.sessionData?.userRequests;
    const content =
      typeof userRequests === "string" && userRequests.length > 0
        ? userRequests
        : USER_REQUESTS_EMPTY;
    return {
      status: "ok",
      content,
      bytes: Buffer.byteLength(content, "utf8"),
      hash: sha256(content),
    };
  },
};
