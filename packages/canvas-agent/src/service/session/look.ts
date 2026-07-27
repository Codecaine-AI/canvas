/**
 * Read-only perception behind `look`: the model's deliberate step back and the
 * only place expensive perception lives. It returns the full-board truth and
 * an optional section close-up, mutates nothing, and emits no run event.
 */
import type { LayoutToolRenderResult } from "../tool-runtime";
import { lookPerception } from "./perception";
import type { LayoutSession } from "./store";

export function toolLook(
  session: LayoutSession,
  view: string | undefined,
  onRender?: (png: Buffer) => void,
): LayoutToolRenderResult {
  const { diagnostics: _diagnostics, ...result } = lookPerception(
    session,
    { view, onRender },
  );
  return result;
}
