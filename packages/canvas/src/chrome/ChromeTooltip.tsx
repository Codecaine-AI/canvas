"use client";

/**
 * ChromeTooltip — shared dark hover-label used by all FigJam chrome
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
 * element (see FigJamDock.tsx for the pattern). W3 may swap this for a
 * floating-ui-anchored version if absolute-positioned tooltips clip against
 * dock edges in the real editor; the prop contract below is designed to
 * survive that swap unchanged.
 */

export type ChromeTooltipPlacement = "top" | "bottom";

export type ChromeTooltipProps = {
  label: string;
  visible: boolean;
  placement?: ChromeTooltipPlacement;
  /** Optional id for aria-describedby wiring by the caller. */
  id?: string;
};

const TOOLTIP_BG = "#1D1D1D";
const TOOLTIP_TEXT = "#FFFFFF";

export function ChromeTooltip({ label, visible, placement = "top", id }: ChromeTooltipProps) {
  if (!visible) return null;

  return (
    <span
      id={id}
      role="tooltip"
      data-chrome-tooltip=""
      data-placement={placement}
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        top: placement === "top" ? "auto" : "calc(100% + 8px)",
        bottom: placement === "top" ? "calc(100% + 8px)" : "auto",
        whiteSpace: "nowrap",
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
