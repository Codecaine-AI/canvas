import type { AgentSessionEvent } from "@codecaine-ai/canvas-agent/protocol";

export function describeEvent(event: AgentSessionEvent): string | null {
  switch (event.type) {
    case "fitted":
      return `Read the scope — ${event.scopeObjectIds.length} objects, ${event.boundaryArrowCount} boundary connections.`;
    case "proposal":
      return `Draft ${event.n}…`;
    case "rendering":
      return "Looking at the result…";
    case "proposal-ready":
      return "Proposal ready.";
    case "error":
      return `Something failed: ${event.message}`;
    case "abandoned":
      return event.reason;
    case "delta":
    case "status":
      return null;
  }
}
