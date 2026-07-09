"use client";

import { memo, useState } from "react";
import { EDITOR_STYLE } from "./editor-style";
import { Tooltip } from "../../ui/Tooltip";
import {
  ConnectorIcon,
  CursorIcon,
  HandIcon,
  SectionIcon,
  ShapesIcon,
  StickyIcon,
} from "../../ui/icons";

/**
 * CanvasDock — the white rounded bottom dock.
 *
 * Geometry/behavior source: board-design-reference/analysis/figjam-bottom-dock-spec.md
 *   - Content-fit width, 48px logical height, 13px radius.
 *   - bg #FFFFFF, soft shadow.
 *   - 6 buttons in 2 groups with faint vertical dividers.
 *   - Rest: charcoal glyphs. Hover: light-gray rounded square (~RGB235).
 *     Active: violet rounded square (EDITOR_STYLE.accentPurple family).
 *   - `activeTool` is nullable — null means no button is highlighted. The
 *     dock does NOT track "last selected tool" internally; the consumer
 *     (W3 editor) is the single source of truth for which tool (if any) is
 *     active.
 *
 * Positioning: this component renders only the pill itself, sized to its
 * exact logical px. The consumer is responsible for bottom-centering it
 * (e.g. `position: absolute; left: 50%; bottom: 24px; transform:
 * translateX(-50%)`) — no positioning assumptions are baked in here so W3
 * can drop it into any layout.
 */

export type ToolId =
  | "select"
  | "hand"
  | "shapes"
  | "connector"
  | "section"
  | "sticky";

export type CanvasDockProps = {
  /** Currently active tool, or null when no dock button should show the violet active state. */
  activeTool?: ToolId | null;
  onSelectTool?: (tool: ToolId) => void;
  /** Fired specifically for the shape-tool button, which opens the left-docked Shapes panel rather than just becoming "the active tool" in the simple sense. */
  onOpenShapes?: () => void;
  disabled?: boolean;
  className?: string;
};

const DOCK_WIDTH_PX = "fit-content";
const DOCK_HEIGHT_PX = EDITOR_STYLE.dockHeightPx;
const DOCK_RADIUS_PX = EDITOR_STYLE.dockRadiusPx;

type DockButtonSpec = {
  tool: ToolId;
  label: string;
  tooltip: string;
  Icon: (props: { className?: string; style?: React.CSSProperties }) => React.JSX.Element;
};

const GROUP_A: DockButtonSpec[] = [
  { tool: "sticky", label: "Sticky note", tooltip: "Sticky note — ⌘A", Icon: StickyIcon },
  { tool: "section", label: "Section", tooltip: "Section — A", Icon: SectionIcon },
  { tool: "shapes", label: "Shapes", tooltip: "Shapes — S", Icon: ShapesIcon },
];

const GROUP_B: DockButtonSpec[] = [
  { tool: "select", label: "Select", tooltip: "Select — D", Icon: CursorIcon },
  { tool: "hand", label: "Hand", tooltip: "Hand — F", Icon: HandIcon },
  { tool: "connector", label: "Connector", tooltip: "Connector — G", Icon: ConnectorIcon },
];

const HOVER_BG = EDITOR_STYLE.dockHoverBg;
const ACTIVE_BG = EDITOR_STYLE.accentPurple;
const GLYPH_CHARCOAL = EDITOR_STYLE.dockGlyphColor;
const DOCK_ICON_STYLES = `
.canvas-dock-icon:not(.canvas-dock-icon--section) :is(path, line, polyline, rect, circle) {
  stroke-width: ${EDITOR_STYLE.dockNucleoIconStrokeWidthPx} !important;
}

.canvas-dock-icon.canvas-dock-icon--sticky :is(path, line) {
  stroke-width: ${EDITOR_STYLE.dockStickyIconStrokeWidthPx} !important;
}

.canvas-dock-icon--section :is(path, rect) {
  stroke-width: ${EDITOR_STYLE.dockSectionIconStrokeWidthPx} !important;
}
`;

function DockButton({
  spec,
  isActive,
  disabled,
  onClick,
}: {
  spec: DockButtonSpec;
  isActive: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { Icon, label, tool, tooltip } = spec;
  const buttonDisabled = disabled;
  const tooltipLabel = tooltip;
  const iconSize = tool === "sticky" ? EDITOR_STYLE.dockStickyIconSizePx : EDITOR_STYLE.dockIconSizePx;

  const bg = isActive ? ACTIVE_BG : hovered && !buttonDisabled ? HOVER_BG : "transparent";
  const glyphColor = isActive ? "#FFFFFF" : GLYPH_CHARCOAL;
  const clearHover = () => setHovered(false);

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={clearHover}
      onPointerCancel={clearHover}
    >
      <button
        type="button"
        data-dock-tool={tool}
        data-active={isActive ? "true" : "false"}
        aria-label={label}
        aria-pressed={isActive}
        aria-disabled={buttonDisabled}
        disabled={buttonDisabled}
        onBlur={clearHover}
        onClick={() => {
          clearHover();
          if (!buttonDisabled) onClick?.();
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: EDITOR_STYLE.dockButtonSizePx,
          height: EDITOR_STYLE.dockButtonSizePx,
          borderRadius: EDITOR_STYLE.dockButtonRadiusPx,
          border: "none",
          background: bg,
          color: glyphColor,
          cursor: buttonDisabled ? "default" : "pointer",
          opacity: buttonDisabled ? 0.4 : 1,
          padding: 0,
          transition: "background-color 80ms ease-out",
        }}
      >
        <Icon
          className={`canvas-dock-icon canvas-dock-icon--${tool}`}
          style={{
            width: iconSize,
            height: iconSize,
          }}
        />
      </button>
      <Tooltip label={tooltipLabel} visible={hovered} placement="top" />
    </div>
  );
}

function DockGroup({
  buttons,
  activeTool,
  disabled,
  onSelectTool,
  onOpenShapes,
}: {
  buttons: DockButtonSpec[];
  activeTool: ToolId | null | undefined;
  disabled?: boolean;
  onSelectTool?: (tool: ToolId) => void;
  onOpenShapes?: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: EDITOR_STYLE.dockGroupGapPx }} data-dock-group="">
      {buttons.map((spec) => (
        <DockButton
          key={spec.tool}
          spec={spec}
          isActive={activeTool === spec.tool}
          disabled={disabled}
          onClick={() => {
            if (spec.tool === "shapes") {
              onOpenShapes?.();
            }
            onSelectTool?.(spec.tool);
          }}
        />
      ))}
    </div>
  );
}

function DockDivider() {
  return (
    <div
      aria-hidden="true"
      data-divider=""
      style={{
        width: EDITOR_STYLE.dockDividerWidthPx,
        height: EDITOR_STYLE.dockDividerHeightPx,
        margin: `0 ${EDITOR_STYLE.dockDividerMarginXPx}px`,
        background: EDITOR_STYLE.dockDividerColor,
        flex: "0 0 auto",
      }}
    />
  );
}

function CanvasDockComponent({
  activeTool = null,
  onSelectTool,
  onOpenShapes,
  disabled = false,
  className,
}: CanvasDockProps) {
  return (
    <>
      <style data-dock-icon-styles="">{DOCK_ICON_STYLES}</style>
      <div
        role="toolbar"
        aria-label="FigJam tools"
        data-figjam-dock=""
        className={className}
        style={{
          width: DOCK_WIDTH_PX,
          height: DOCK_HEIGHT_PX,
          borderRadius: DOCK_RADIUS_PX,
          background: EDITOR_STYLE.bottomToolbarBg,
          boxShadow: EDITOR_STYLE.dockShadow,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: `0 ${EDITOR_STYLE.dockPaddingXPx}px`,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <DockGroup
            buttons={GROUP_A}
            activeTool={activeTool}
            disabled={disabled}
            onSelectTool={onSelectTool}
            onOpenShapes={onOpenShapes}
          />
          <DockDivider />
          <DockGroup
            buttons={GROUP_B}
            activeTool={activeTool}
            disabled={disabled}
            onSelectTool={onSelectTool}
          />
        </div>
      </div>
    </>
  );
}

export const CanvasDock = memo(CanvasDockComponent);

export const FIGJAM_DOCK_WIDTH_PX = DOCK_WIDTH_PX;
export const FIGJAM_DOCK_HEIGHT_PX = DOCK_HEIGHT_PX;
export const FIGJAM_DOCK_RADIUS_PX = DOCK_RADIUS_PX;
