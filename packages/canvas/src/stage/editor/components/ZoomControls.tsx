"use client";

import { memo, useState } from "react";
import { cssVar } from "@codecaine-ai/design-system";
import { EDITOR_STYLE } from "./editor-style";
import { Tooltip } from "../../../ui/Tooltip";
import { MinusIcon, PlusIcon } from "../../../ui/icons";

/**
 * ZoomControls — bottom-right zoom pill (matches the dock: light chrome that
 * follows the app theme).
 *
 * Ground truth: figjam-trim-catalog.md section 8 / figjam-bottom-dock-spec
 * both describe a smaller light-gray pill at bottom-right containing ONLY
 * "-"/"+" with NO percentage readout observed in any frame (fj-001,
 * ~x=1330-1410, y=1045-1075). The task brief asks for "-, %, +" — we render
 * the percentage as an optional slot (shown when `zoomPercent` is supplied)
 * since it's genuinely useful trim, but keep it easy to omit for strict
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

const PILL_HEIGHT = cssVar("space.8");
const PILL_RADIUS = EDITOR_STYLE.dockRadius;
const GLYPH_COLOR = EDITOR_STYLE.dockGlyphColor;
const HOVER_BG = EDITOR_STYLE.dockHoverBg;

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
          borderRadius: cssVar("radius.base"),
          border: "none",
          background: hovered ? HOVER_BG : "transparent",
          color: GLYPH_COLOR,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.4 : 1,
          padding: 0,
        }}
      >
        {children}
      </button>
      <Tooltip label={label} visible={hovered && !disabled} placement="top" />
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
        gap: cssVar("space.0-5"),
        height: PILL_HEIGHT,
        borderRadius: PILL_RADIUS,
        background: EDITOR_STYLE.bottomToolbarBg,
        boxShadow: EDITOR_STYLE.dockShadow,
        padding: `0 ${cssVar("space.1-5")}`,
        boxSizing: "border-box",
      }}
    >
      <ZoomButton label="Zoom out" onClick={onZoomOut} disabled={disabled}>
        <MinusIcon className="h-4 w-4" />
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
            fontSize: cssVar("font.size.ui-xs"),
            fontVariantNumeric: "tabular-nums",
            color: GLYPH_COLOR,
            padding: `0 ${cssVar("space.1")}`,
            cursor: disabled ? "default" : "pointer",
            minWidth: 36,
          }}
        >
          {Math.round(zoomPercent * 100)}%
        </button>
      ) : null}

      <ZoomButton label="Zoom in" onClick={onZoomIn} disabled={disabled}>
        <PlusIcon className="h-4 w-4" />
      </ZoomButton>
    </div>
  );
}

export const ZoomControls = memo(ZoomControlsComponent);

export const ZOOM_CONTROLS_HEIGHT_PX = PILL_HEIGHT;
export const ZOOM_CONTROLS_RADIUS_PX = PILL_RADIUS;
