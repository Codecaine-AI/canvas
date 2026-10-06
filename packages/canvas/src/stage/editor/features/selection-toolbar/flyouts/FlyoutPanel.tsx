"use client";

import { useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { cssVar } from "@codecaine-ai/design-system";
import { EDITOR_STYLE } from "../../../components/editor-style";

export type FlyoutPanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

/**
 * The selection toolbar's flyout panel: dark in both app themes, like the
 * toolbar (`data-theme="dark"` on the root, unpinned design-system tokens).
 */
export function FlyoutPanel({ children, className, style, ...props }: FlyoutPanelProps) {
  return (
    <div
      {...props}
      data-toolbar-flyout-panel=""
      data-theme="dark"
      className={className}
      style={{
        background: EDITOR_STYLE.selectionToolbarBg,
        borderRadius: EDITOR_STYLE.flyoutRadius,
        padding: EDITOR_STYLE.flyoutPadding,
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
        gap: cssVar("space.2"),
        height: EDITOR_STYLE.flyoutItemHeightPx,
        padding: `0 ${cssVar("space.3")}`,
        borderRadius: EDITOR_STYLE.flyoutItemRadius,
        border: "none",
        background: active
          ? EDITOR_STYLE.activeBg
          : hovered
            ? cssVar("color.fill.hover")
            : "transparent",
        color: active ? EDITOR_STYLE.activeGlyph : cssVar("color.text.ink"),
        cursor: "pointer",
        fontSize: cssVar("font.size.ui-sm"),
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
