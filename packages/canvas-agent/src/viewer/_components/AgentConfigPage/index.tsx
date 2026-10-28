import { AgentPromptLabContainer, PromptStyleSidebar, usePromptStyleSettings } from "@codecaine-ai/agent-kernel-viewer-ui";
import { AgentSurface } from "../../shared/_components/AgentSurface";
import { AgentServiceDownNotice } from "../../shared/_components/AgentServiceDownNotice";
import { AgentFetchErrorNotice } from "../../shared/_components/AgentFetchErrorNotice";
import {
  AGENT_API_BASE,
  LAYOUT_AGENT_NAME,
  catalogAgentDetailPath,
} from "../../shared/kernel-api";
import { useAgentJson } from "../../shared/useAgentJson";
import { isRecord } from "../../shared/utils";
import { usePromptStyleSidebar } from "./usePromptStyleSidebar";

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
  const { settings, update, reset } = usePromptStyleSettings();
  const { styleSidebar, setStyleSidebar, styleSidebarDocked, closeStyleSidebar, setStyleSidebarWidth } = usePromptStyleSidebar();

  if (state.status === "loading") {
    return <p className="text-ui-lg text-muted-foreground">Loading agent config...</p>;
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
    <AgentSurface className="flex h-[var(--research-workspace-height)] min-h-140 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5 font-mono">
        <h2 className="text-ui-sm font-bold text-ink">{LAYOUT_AGENT_NAME}</h2>
        {promptHash ? (
          <span
            title={`Saved prompt revision ${promptHash}`}
            className="truncate rounded border border-status-success-border bg-status-success-fill/30 px-1.5 py-0.5 text-micro text-status-success"
          >
            {promptHash}
          </span>
        ) : null}
        <button
          aria-label="Prompt style"
          aria-pressed={styleSidebar.open}
          className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 text-ui-2xs font-semibold uppercase tracking-micro text-muted-foreground transition-colors hover:border-status-info-border hover:text-foreground"
          onClick={() =>
            setStyleSidebar((current) => ({
              ...current,
              open: !current.open,
            }))
          }
          title="Toggle style sidebar"
          type="button"
        >
          Style
        </button>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden p-3">
          <AgentPromptLabContainer
            baseUrl={AGENT_API_BASE}
            agentName={LAYOUT_AGENT_NAME}
            className="h-full"
            styleSettings={settings}
          />
        </div>
        <PromptStyleSidebar
          docked={styleSidebarDocked}
          onChange={update}
          onClose={closeStyleSidebar}
          onReset={reset}
          onWidthChange={setStyleSidebarWidth}
          open={styleSidebar.open}
          settings={settings}
          width={styleSidebar.width}
        />
      </div>
    </AgentSurface>
  );
}
