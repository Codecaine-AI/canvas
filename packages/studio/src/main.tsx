import "@codecaine-ai/text-measure/fonts.css";
import { useBrowserFonts } from "@codecaine-ai/text-measure/browser";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Measure text with the browser's own canvas once the bundled faces
// (fonts.css) have loaded; until then the approximate table backend measures.
// The canvas stage and the gallery lay out again on the switch.
void useBrowserFonts().then(({ backend, reason }) => {
  if (reason) console.warn(`text-measure stays on the ${backend} backend: ${reason}`);
});
