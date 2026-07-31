import {
  AgentPromptLabContainer,
  usePromptStyleSettings,
} from "@agent-kernel/viewer-ui";
import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH,
  PromptStyleSidebar,
  clampPromptStyleSidebarWidth,
} from "./PromptStyleSidebar";

const PROMPT_STYLE_SIDEBAR_STORAGE_KEY =
  "canvasAgent.promptStyleSidebar.v1";
const PROMPT_STYLE_SIDEBAR_BREAKPOINT = "(min-width: 1440px)";

interface PromptStyleSidebarState {
  open: boolean;
  width: number;
}

const DEFAULT_PROMPT_STYLE_SIDEBAR_STATE: PromptStyleSidebarState = {
  open: false,
  width: PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH,
};

function readPromptStyleSidebarState(): PromptStyleSidebarState {
  if (typeof window === "undefined") {
    return DEFAULT_PROMPT_STYLE_SIDEBAR_STATE;
  }

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(PROMPT_STYLE_SIDEBAR_STORAGE_KEY) ?? "null",
    ) as unknown;

    if (
      typeof stored !== "object" ||
      stored === null ||
      !("open" in stored) ||
      typeof stored.open !== "boolean" ||
      !("width" in stored) ||
      typeof stored.width !== "number" ||
      !Number.isFinite(stored.width)
    ) {
      return DEFAULT_PROMPT_STYLE_SIDEBAR_STATE;
    }

    return {
      open: stored.open,
      width: clampPromptStyleSidebarWidth(stored.width),
    };
  } catch {
    return DEFAULT_PROMPT_STYLE_SIDEBAR_STATE;
  }
}

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
  const [styleSidebar, setStyleSidebar] =
    useState<PromptStyleSidebarState>(DEFAULT_PROMPT_STYLE_SIDEBAR_STATE);
  const [styleSidebarStateLoaded, setStyleSidebarStateLoaded] = useState(false);
  const [styleSidebarDocked, setStyleSidebarDocked] = useState(false);
  const styleSidebarStateReadRef = useRef(false);

  const closeStyleSidebar = useCallback(() => {
    setStyleSidebar((current) => ({ ...current, open: false }));
  }, []);

  const setStyleSidebarWidth = useCallback((width: number) => {
    setStyleSidebar((current) => ({
      ...current,
      width: clampPromptStyleSidebarWidth(width),
    }));
  }, []);

  useEffect(() => {
    if (styleSidebarStateReadRef.current) {
      return;
    }

    styleSidebarStateReadRef.current = true;
    setStyleSidebar(readPromptStyleSidebarState());
    setStyleSidebarStateLoaded(true);
  }, []);

  useEffect(() => {
    if (!styleSidebarStateLoaded || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        PROMPT_STYLE_SIDEBAR_STORAGE_KEY,
        JSON.stringify(styleSidebar),
      );
    } catch {
      // Persistence is optional when browser storage is unavailable.
    }
  }, [styleSidebar, styleSidebarStateLoaded]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(PROMPT_STYLE_SIDEBAR_BREAKPOINT);
    const handleChange = (event: MediaQueryListEvent) => {
      setStyleSidebarDocked(event.matches);
    };

    setStyleSidebarDocked(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

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
        <button
          aria-pressed={styleSidebar.open}
          className="ml-auto shrink-0 rounded-[2px] border border-border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:border-status-info-border hover:text-foreground"
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
