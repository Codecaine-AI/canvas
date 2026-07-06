"use client";

import { memo, useState } from "react";
import { CHROME } from "../render/figjam-tokens";
import { ChromeTooltip } from "./ChromeTooltip";
import { ZoomMinusIcon, ZoomPlusIcon } from "./dock-icons";

/**
 * ZoomControls — bottom-right zoom pill (matches the dock's white styling).
 *
 * Ground truth: figjam-chrome-catalog.md section 8 / figjam-bottom-dock-spec
 * both describe a smaller light-gray pill at bottom-right containing ONLY
 * "-"/"+" with NO percentage readout observed in any frame (fj-001,
 * ~x=1330-1410, y=1045-1075). The task brief asks for "-, %, +" — we render
 * the percentage as an optional slot (shown when `zoomPercent` is supplied)
 * since it's genuinely useful chrome, but keep it easy to omit for strict
 * frame-parity if W3 decides to match the recording exactly with no
 * percentage readout.
 */

export type ZoomControlsProps = {
  zoomPercent?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomPercentClick?: () => void;
  disabled?: boolean;
  className?: string;
};

const PILL_HEIGHT_PX = 32;
const PILL_RADIUS_PX = CHROME.dockRadiusPx;
const GLYPH_CHARCOAL = CHROME.dockGlyphColor;
const HOVER_BG = CHROME.dockHoverBg;

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const clearHover = () => setHovered(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={clearHover}
        onPointerCancel={clearHover}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={clearHover}
        onBlur={clearHover}
        onClick={() => {
          clearHover();
          onClick?.();
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: 8,
          border: "none",
          background: hovered ? HOVER_BG : "transparent",
          color: GLYPH_CHARCOAL,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.4 : 1,
          padding: 0,
        }}
      >
        {children}
      </button>
      <ChromeTooltip label={label} visible={hovered && !disabled} placement="top" />
    </div>
  );
}

function ZoomControlsComponent({
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onZoomPercentClick,
  disabled = false,
  className,
}: ZoomControlsProps) {
  return (
    <div
      role="group"
      aria-label="Zoom controls"
      data-zoom-controls=""
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        height: PILL_HEIGHT_PX,
        borderRadius: PILL_RADIUS_PX,
        background: CHROME.bottomToolbarBg,
        boxShadow: CHROME.dockShadow,
        padding: "0 6px",
        boxSizing: "border-box",
      }}
    >
      <ZoomButton label="Zoom out" onClick={onZoomOut} disabled={disabled}>
        <ZoomMinusIcon className="h-4 w-4" />
      </ZoomButton>

      {zoomPercent != null ? (
        <button
          type="button"
          data-zoom-percent=""
          aria-label={`Zoom level ${Math.round(zoomPercent * 100)}%`}
          disabled={disabled}
          onClick={onZoomPercentClick}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 12,
            color: GLYPH_CHARCOAL,
            padding: "0 4px",
            cursor: disabled ? "default" : "pointer",
            minWidth: 36,
          }}
        >
          {Math.round(zoomPercent * 100)}%
        </button>
      ) : null}

      <ZoomButton label="Zoom in" onClick={onZoomIn} disabled={disabled}>
        <ZoomPlusIcon className="h-4 w-4" />
      </ZoomButton>
    </div>
  );
}

export const ZoomControls = memo(ZoomControlsComponent);

export const ZOOM_CONTROLS_HEIGHT_PX = PILL_HEIGHT_PX;
export const ZOOM_CONTROLS_RADIUS_PX = PILL_RADIUS_PX;
