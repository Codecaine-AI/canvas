import { AgentPromptLabContainer } from "@agent-kernel/viewer-ui";
import { AgentSurface } from "../components/AgentSurface";
import {
  AGENT_API_BASE,
  LAYOUT_AGENT_NAME,
  catalogAgentDetailPath,
} from "../lib/kernel-api";
import {
  AgentFetchErrorNotice,
  AgentServiceDownNotice,
  isRecord,
  useAgentJson,
} from "../hooks/use-agent-json";

/**
 * Agent config — the layout agent's manifest + prompt through the REAL
 * prompt lab (HARNESS-SETUP-PLAN.md §2b/§4): viewer-ui's
 * AgentPromptLabContainer over the kernel's standard catalog API (mounted by
 * the harness under /api/agent/kernel/catalog/...). Prompt edits PUT the
 * prompt-kit PromptDocument through the catalog service — canonicalization,
 * validation and the new promptHash all come back from the kernel; the lab
 * shows the saved hash as a chip and the revision history (with prompt-kit
 * document diffs) underneath.
 *
 * The initial fetch goes through useAgentJson only for the calm
 * "service is not running" empty state; once the catalog answers, the lab
 * container owns all fetching (detail, saves, revisions, stats).
 */
export function AgentConfigPage() {
  const state = useAgentJson(catalogAgentDetailPath(LAYOUT_AGENT_NAME));

  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading agent config...</p>;
  }
  if (state.status === "unavailable") {
    return <AgentServiceDownNotice subject="The layout agent's manifest and prompt" />;
  }
  if (state.status === "error") {
    return <AgentFetchErrorNotice message={state.message} />;
  }

  const promptHash =
    isRecord(state.data) && typeof state.data.promptHash === "string"
      ? state.data.promptHash
      : null;

  return (
    <AgentSurface className="flex h-full min-h-[560px] flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5 font-mono">
        <h2 className="text-[13px] font-bold">{LAYOUT_AGENT_NAME}</h2>
        {promptHash ? (
          <span
            title={`Saved prompt revision ${promptHash}`}
            className="truncate rounded-[2px] border border-status-success-border bg-status-success-fill/30 px-1.5 py-0.5 text-[10px] text-status-success"
          >
            {promptHash}
          </span>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">
          Edits write to the agent catalog on disk
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <AgentPromptLabContainer
          baseUrl={AGENT_API_BASE}
          agentName={LAYOUT_AGENT_NAME}
          className="h-full"
        />
      </div>
    </AgentSurface>
  );
}
