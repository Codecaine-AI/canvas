import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// @codecaine-ai/design-system first, in its load order (guide/consume.md): fonts, tokens, the
// agent-viewer host contract, the shell layout. The viewer packages' sheets and index.css follow.
import "@codecaine-ai/design-system/fonts.css";
import "@codecaine-ai/design-system/tokens.css";
import "@codecaine-ai/design-system/host-contract.css";
import "@codecaine-ai/design-system/layout.css";
import "@codecaine-ai/agent-kernel-viewer-ui/styles";
import "@codecaine-ai/agent-kernel-viewer-shell/styles";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
