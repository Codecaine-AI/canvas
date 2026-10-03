/// <reference types="bun" />

import { expect, it } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { activeBackend, useTableBackend } from "@codecaine-ai/text-measure";
import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";

import { useTextMeasureVersion } from "../use-text-measure-version";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

it("re-renders with a new version on every text-measure backend switch", async () => {
  const versions: number[] = [];
  function Probe() {
    versions.push(useTextMeasureVersion());
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  // Two switches, standing in for the one the loaded fonts make in the browser.
  act(() => useTableBackend());
  await act(() => useHarfBuzz());
  act(() => root.unmount());

  expect(activeBackend().name).toBe("harfbuzz");
  expect(new Set(versions).size).toBe(3);
});
