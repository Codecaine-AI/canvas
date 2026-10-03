// Node ESM host: resolves the package by name (exports -> src/*.ts, run with
// Node's type stripping), loads HarfBuzz and prints sample results as JSON.
import { activeBackend, fitText, measureWidth, useHarfBuzz, wrapText } from "@codecaine-ai/text-measure/headless";

await useHarfBuzz();
const font = { family: "Inter", size: 14 };
const samples = ["Hamburgefonstiv", "ASCII arrows -> => <- <=> -->", "Static export is read-only by construction"];
console.log(
  JSON.stringify({
    backend: activeBackend(),
    results: samples.map((text) => ({
      width: measureWidth(text, font),
      lines: wrapText(text, font, { maxWidth: 120, lineHeight: 21 }).lines.map((line) => line.text),
      verdict: fitText(text, font, { width: 120, lineHeight: 21, maxLines: 1 }).verdict,
    })),
  }),
);
