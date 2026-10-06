import { useCallback, useState } from "react";
import type { AgentRenderTarget } from "./types";

export function useAgentRenderViewer() {
  const [target, setTarget] = useState<AgentRenderTarget | null>(null);
  const closeRender = useCallback(() => setTarget(null), []);

  return {
    target,
    openRender: setTarget,
    closeRender,
  };
}
