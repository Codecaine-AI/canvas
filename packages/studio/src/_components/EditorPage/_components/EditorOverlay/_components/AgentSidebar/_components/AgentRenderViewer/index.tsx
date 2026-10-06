import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { XIcon } from "@codecaine-ai/canvas/ui/icons";
import { VIEWER_ENTER_STYLES } from "./constants";
import type { AgentRenderTarget } from "./types";

export type { AgentRenderTarget } from "./types";
export { useAgentRenderViewer } from "./useAgentRenderViewer";
export { agentBoardRenderUrl, agentOperationRenderUrl } from "./utils";

export type AgentRenderViewerProps = {
  target: AgentRenderTarget | null;
  onClose(): void;
};

export function AgentRenderViewer({
  target,
  onClose,
}: AgentRenderViewerProps) {
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "unavailable">(
    "loading",
  );

  useEffect(() => {
    setLoadState("loading");
  }, [target?.src]);

  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, target]);

  if (!target || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={target.caption}
      // A dark region in either app theme: the render sits on a dimmed page,
      // so the overlay and its text take the dark tokens.
      data-theme="dark"
      className="fixed inset-0 z-popover flex items-center justify-center bg-page/85 p-4 sm:p-8"
      onClick={onClose}
    >
      <style>{VIEWER_ENTER_STYLES}</style>
      <div
        data-agent-render-viewer-panel=""
        className="flex h-full w-full flex-col"
        style={{
          animation:
            "studio-agent-render-enter var(--ds-motion-duration-base) var(--ds-motion-easing-emphasized) both",
          willChange: "transform, opacity",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 text-ink">
          <span className="truncate text-ui-xs font-medium">{target.caption}</span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-ink hover:bg-hover hover:text-ink dark:hover:bg-hover"
            aria-label="Close render"
            title="Close render"
            onClick={onClose}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {loadState === "loading" ? (
            <p className="absolute text-ui-xs text-secondary">Loading render…</p>
          ) : null}
          {loadState === "unavailable" ? (
            <div
              data-agent-render-unavailable=""
              className="rounded bg-panel px-4 py-3 text-ui-xs text-secondary"
            >
              Render no longer available
            </div>
          ) : (
            <img
              src={target.src}
              alt={target.caption}
              className={`min-h-0 max-h-full max-w-full object-contain transition-opacity ${
                loadState === "loaded" ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setLoadState("loaded")}
              onError={() => setLoadState("unavailable")}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
