"use client";

import { useEffect, useId, useSyncExternalStore, type CSSProperties } from "react";

/**
 * Tooltip — shared dark hover-label used by all FigJam trim
 * components (dock buttons, selection-toolbar controls, etc.).
 *
 * Ground truth: the shape picker uses a small caret to visually connect the
 * hover label to the active icon, matching FigJam's anchored tooltip feel.
 *
 * Standalone (W2-trim): no floating-ui anchoring here — callers position
 * this relative to their own trigger via a wrapping `position: relative`
 * element (see CanvasDock.tsx for the pattern). W3 may swap this for a
 * floating-ui-anchored version if absolute-positioned tooltips clip against
 * dock edges in the real editor; the prop contract below is designed to
 * survive that swap unchanged.
 */

export type TooltipPlacement = "top" | "bottom";
export type TooltipAlign = "start" | "center" | "end";

export type TooltipProps = {
  label: string;
  visible: boolean;
  placement?: TooltipPlacement;
  align?: TooltipAlign;
  caretOffset?: CSSProperties["left"];
  /** Optional id for aria-describedby wiring by the caller. */
  id?: string;
};

const TOOLTIP_BG = "#1D1D1D";
const TOOLTIP_TEXT = "#FFFFFF";
const TOOLTIP_EVENT = "trim-tooltip-change";

let activeTooltipId: string | null = null;

function setActiveTooltip(id: string | null) {
  activeTooltipId = id;
  window.dispatchEvent(new Event(TOOLTIP_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(TOOLTIP_EVENT, callback);
  return () => window.removeEventListener(TOOLTIP_EVENT, callback);
}

function tooltipHorizontalStyle(align: TooltipAlign): CSSProperties {
  if (align === "start") {
    return {
      left: 0,
      right: "auto",
      transform: "none",
    };
  }
  if (align === "end") {
    return {
      left: "auto",
      right: 0,
      transform: "none",
    };
  }
  return {
    left: "50%",
    right: "auto",
    transform: "translateX(-50%)",
  };
}

function tooltipCaretStyle(
  placement: TooltipPlacement,
  caretOffset: CSSProperties["left"] = "50%",
): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    left: caretOffset,
    width: 0,
    height: 0,
    transform: "translateX(-50%)",
    pointerEvents: "none",
  };

  if (placement === "bottom") {
    return {
      ...base,
      top: -6,
      borderLeft: "6px solid transparent",
      borderRight: "6px solid transparent",
      borderBottom: `6px solid ${TOOLTIP_BG}`,
    };
  }

  return {
    ...base,
    bottom: -6,
    borderLeft: "6px solid transparent",
    borderRight: "6px solid transparent",
    borderTop: `6px solid ${TOOLTIP_BG}`,
  };
}

export function Tooltip({
  label,
  visible,
  placement = "top",
  align = "center",
  caretOffset = "50%",
  id,
}: TooltipProps) {
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
      data-trim-tooltip=""
      data-placement={placement}
      data-align={align}
      style={{
        position: "absolute",
        ...tooltipHorizontalStyle(align),
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
      <span
        aria-hidden="true"
        data-trim-tooltip-caret=""
        style={tooltipCaretStyle(placement, caretOffset)}
      />
      {label}
    </span>
  );
}
