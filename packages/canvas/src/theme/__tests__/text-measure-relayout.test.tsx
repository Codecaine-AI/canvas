import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";
import { useTableBackend } from "@codecaine-ai/text-measure";
import { CanvasStyleProvider, useCanvasStyle } from "../canvas-style-context";
import type { CanvasStyle } from "../canvas-style";

/**
 * Measured layout (caption bands, chips, routes) depends on the text-measure
 * backend, which a browser host switches once its bundled fonts load. The
 * style provider hands out a fresh copy of the same style after a switch, so
 * every consumer re-renders and every memo keyed on the style measures again.
 */
describe("re-layout on a text-measure backend switch", () => {
  afterEach(async () => {
    cleanup();
    await useHarfBuzz();
  });

  it("re-renders style consumers with a new style identity and the same tokens", async () => {
    const seen: CanvasStyle[] = [];
    function Probe() {
      seen.push(useCanvasStyle());
      return null;
    }
    render(
      <CanvasStyleProvider value={{ theme: "figjam" }}>
        <Probe />
      </CanvasStyleProvider>,
    );
    const before = seen.length;
    const first = seen.at(-1)!;

    await act(async () => {
      useTableBackend();
    });

    expect(seen.length).toBeGreaterThan(before);
    const after = seen.at(-1)!;
    expect(after).not.toBe(first);
    expect(after).toEqual(first);
  });
});
