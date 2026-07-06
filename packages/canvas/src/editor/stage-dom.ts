import type { CanvasPoint } from "../state/geometry";

/** Client (viewport) coords -> stage-relative screen coords, for screenToWorld(). */
export function stageScreenPointFromClient(
  event: Pick<PointerEvent | MouseEvent, "clientX" | "clientY">,
  stage: HTMLElement,
): CanvasPoint {
  const rect = stage.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function stageFromEventTarget(target: Element): HTMLElement | null {
  const stage = target.closest("[data-canvas-stage='true']");
  return stage instanceof HTMLElement ? stage : null;
}
