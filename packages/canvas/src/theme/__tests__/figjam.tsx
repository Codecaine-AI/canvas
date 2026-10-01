/**
 * Test helper: render under the figjam theme EXPLICITLY.
 *
 * The default theme is schematic-light (DEFAULT_CANVAS_THEME_ID), so a test
 * that pins figjam output must say so — through these wrappers for React
 * renders, or by passing `FIGJAM_CANVAS_STYLE` as the `canvasStyle` argument
 * of a pure function (static SVG, routing, geometry, text slots).
 */
import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { FIGJAM_CANVAS_STYLE } from "../canvas-style";
import { CanvasStyleProvider } from "../canvas-style-context";

export { FIGJAM_CANVAS_STYLE };

/** A provider pinning the figjam preset for its subtree. */
export function FigjamStyle({ children }: { children?: ReactNode }) {
  return <CanvasStyleProvider value={FIGJAM_CANVAS_STYLE}>{children}</CanvasStyleProvider>;
}

/** `ui` wrapped in the figjam provider (for renderToStaticMarkup and friends). */
export function withFigjam(ui: ReactNode): ReactElement {
  return <FigjamStyle>{ui}</FigjamStyle>;
}

/** testing-library `render` under the figjam theme; `rerender` keeps the provider. */
export function renderFigjam(ui: ReactElement, options: RenderOptions = {}) {
  const Inner = options.wrapper;
  return render(ui, {
    ...options,
    wrapper: ({ children }: { children: ReactNode }) => (
      <FigjamStyle>{Inner ? <Inner>{children}</Inner> : children}</FigjamStyle>
    ),
  });
}
