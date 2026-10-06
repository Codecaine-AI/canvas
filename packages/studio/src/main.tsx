// The design-system fonts first, as their own stylesheet: Inter 3.19 and IBM
// Plex Mono 2.5, the woff2 files @codecaine-ai/text-measure measures with
// (byte-identical), so the stage paints what lints and layout measured. Vite
// resolves fonts.css's url()s from its own folder only when it loads the file
// itself; inlined into index.css, @tailwindcss/postcss rebuilds the rules and
// the urls would resolve from src/. Vite fingerprints the woff2 files into
// dist/assets/, which the Electron server serves as font/woff2.
import "@codecaine-ai/design-system/fonts.css";
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
// (fonts.css above) have loaded; until then the approximate table backend
// measures.
// The canvas stage and the gallery lay out again on the switch.
void useBrowserFonts().then(({ backend, reason }) => {
  if (reason) console.warn(`text-measure stays on the ${backend} backend: ${reason}`);
});
