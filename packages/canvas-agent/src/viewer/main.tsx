import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@agent-kernel/viewer-ui/styles";
import "@agent-kernel/viewer-shell/styles";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
