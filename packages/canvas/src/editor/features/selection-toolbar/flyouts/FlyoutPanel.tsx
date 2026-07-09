"use client";

import { useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { EDITOR_STYLE } from "../../../components/editor-style";

export type FlyoutPanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function FlyoutPanel({ children, className, style, ...props }: FlyoutPanelProps) {
  return (
    <div
      {...props}
      data-toolbar-flyout-panel=""
      className={className}
      style={{
        background: EDITOR_STYLE.selectionToolbarBg,
        borderRadius: EDITOR_STYLE.flyoutRadiusPx,
        padding: EDITOR_STYLE.flyoutPaddingPx,
        boxShadow: EDITOR_STYLE.flyoutShadow,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type FlyoutMenuButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role"> & {
  active?: boolean;
  leadingIcon?: ReactNode;
};

export function FlyoutMenuButton({
  active,
  leadingIcon,
  children,
  className,
  style,
  type,
  onMouseEnter,
  onMouseLeave,
  ...props
}: FlyoutMenuButtonProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      {...props}
      type={type ?? "button"}
      role="menuitem"
      className={className}
      onMouseEnter={(event) => {
        setHovered(true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setHovered(false);
        onMouseLeave?.(event);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: EDITOR_STYLE.flyoutItemHeightPx,
        padding: "0 12px",
        borderRadius: EDITOR_STYLE.flyoutItemRadiusPx,
        border: "none",
        background: active
          ? EDITOR_STYLE.accentPurple
          : hovered
            ? "rgba(255,255,255,0.10)"
            : "transparent",
        color: "#FFFFFF",
        cursor: "pointer",
        fontSize: 13,
        textAlign: "left",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {leadingIcon}
      {children}
    </button>
  );
}
