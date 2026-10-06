import type { PendingNote } from "@/shared/agent";

export const AUTHOR_LABELS: Record<PendingNote["createdBy"], string> = {
  human: "You",
  agent: "Agent",
  system: "System",
};
