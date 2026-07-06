"use client";

import { useEffect, useId, useSyncExternalStore } from "react";

/**
 * Tooltip — shared dark hover-label used by all FigJam chrome
 * components (dock buttons, context-toolbar controls, etc.).
 *
 * Ground truth: the one confirmed tooltip in the source recording is the
 * "Line style" label over the connector toolbar's line-style icon (fj-029) —
 * a plain dark rounded-rect label, no arrow/caret rendered at this
 * resolution. This component intentionally keeps that same plain shape
 * rather than inventing an arrow/caret we have no pixel evidence for.
 *
 * Standalone (W2-chrome): no floating-ui anchoring here — callers position
 * this relative to their own trigger via a wrapping `position: relative`
 * element (see CanvasDock.tsx for the pattern). W3 may swap this for a
 * floating-ui-anchored version if absolute-positioned tooltips clip against
 * dock edges in the real editor; the prop contract below is designed to
 * survive that swap unchanged.
 */

export type TooltipPlacement = "top" | "bottom";

export type TooltipProps = {
  label: string;
  visible: boolean;
  placement?: TooltipPlacement;
  /** Optional id for aria-describedby wiring by the caller. */
  id?: string;
};

const TOOLTIP_BG = "#1D1D1D";
const TOOLTIP_TEXT = "#FFFFFF";
const TOOLTIP_EVENT = "chrome-tooltip-change";

let activeTooltipId: string | null = null;

function setActiveTooltip(id: string | null) {
  activeTooltipId = id;
  window.dispatchEvent(new Event(TOOLTIP_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(TOOLTIP_EVENT, callback);
  return () => window.removeEventListener(TOOLTIP_EVENT, callback);
}

export function Tooltip({ label, visible, placement = "top", id }: TooltipProps) {
  const fallbackId = useId();
  const tooltipId = id ?? fallbackId;
  const currentTooltipId = useSyncExternalStore(
    subscribe,
    () => activeTooltipId,
    () => null,
  );

  useEffect(() => {
    if (!visible) {
      if (activeTooltipId === tooltipId) setActiveTooltip(null);
      return;
    }
    setActiveTooltip(tooltipId);
    return () => {
      if (activeTooltipId === tooltipId) setActiveTooltip(null);
    };
  }, [tooltipId, visible]);

  if (!visible || currentTooltipId !== tooltipId) return null;

  return (
    <span
      id={tooltipId}
      role="tooltip"
      data-chrome-tooltip=""
      data-placement={placement}
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        width: "max-content",
        maxWidth: "none",
        top: placement === "top" ? "auto" : "calc(100% + 8px)",
        bottom: placement === "top" ? "calc(100% + 8px)" : "auto",
        whiteSpace: "nowrap",
        overflow: "visible",
        background: TOOLTIP_BG,
        color: TOOLTIP_TEXT,
        fontSize: 12,
        lineHeight: "16px",
        fontWeight: 500,
        padding: "4px 8px",
        borderRadius: 6,
        pointerEvents: "none",
        zIndex: 60,
      }}
    >
      {label}
    </span>
  );
}
