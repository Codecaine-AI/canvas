import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { XIcon } from "@codecaine-ai/canvas/ui/icons";

export interface AgentRenderTarget {
  src: string;
  caption: string;
}

export function agentBoardRenderUrl(canvasId: string, sessionId: string): string {
  return `/api/canvases/${encodeURIComponent(canvasId)}/agent/sessions/${encodeURIComponent(sessionId)}/board.png`;
}

export function agentOperationRenderUrl(
  canvasId: string,
  sessionId: string,
  operationNumber: number,
): string {
  return `/api/canvases/${encodeURIComponent(canvasId)}/agent/sessions/${encodeURIComponent(sessionId)}/renders/${operationNumber}.png`;
}

const VIEWER_ENTER_STYLES = `
@keyframes studio-agent-render-enter {
  from {
    opacity: 0;
    transform: translate3d(0, 6px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-agent-render-viewer-panel] {
    animation-duration: 1ms !important;
  }
}
`;

export function useAgentRenderViewer() {
  const [target, setTarget] = useState<AgentRenderTarget | null>(null);
  const closeRender = useCallback(() => setTarget(null), []);

  return {
    target,
    openRender: setTarget,
    closeRender,
  };
}

export function AgentRenderViewer({
  target,
  onClose,
}: {
  target: AgentRenderTarget | null;
  onClose(): void;
}) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8"
      onClick={onClose}
    >
      <style>{VIEWER_ENTER_STYLES}</style>
      <div
        data-agent-render-viewer-panel=""
        className="flex h-full w-full flex-col"
        style={{
          animation:
            "studio-agent-render-enter 140ms cubic-bezier(0.22, 1, 0.36, 1) both",
          willChange: "transform, opacity",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 text-white">
          <span className="truncate text-xs font-medium">{target.caption}</span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label="Close render"
            title="Close render"
            onClick={onClose}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {loadState === "loading" ? (
            <p className="absolute text-xs text-white/60">Loading render…</p>
          ) : null}
          {loadState === "unavailable" ? (
            <div
              data-agent-render-unavailable=""
              className="rounded-md bg-white/10 px-4 py-3 text-xs text-white/70"
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
