"use client";

import { useState } from "react";
import { CHROME } from "../render/figjam-tokens";
import { ChromeTooltip } from "./ChromeTooltip";
import {
  ArrowIcon,
  CommentIcon,
  ConnectorIcon,
  HandIcon,
  HighlighterIcon,
  PenIcon,
  PlusIcon,
  ShapeSquareIcon,
  StampIcon,
  StickyIcon,
  TableIcon,
  TextIcon,
  WidgetsIcon,
} from "./dock-icons";

/**
 * FigJamDock — the white stadium bottom dock.
 *
 * Geometry/behavior source: board-design-reference/analysis/figjam-bottom-dock-spec.md
 *   - Bounding box 462x37 logical px, corner radius = height/2 (true stadium).
 *   - bg #FDFDFD, soft shadow.
 *   - 13 buttons in 5 whitespace-only groups (NO divider lines).
 *   - Rest: charcoal glyphs. Hover: light-gray rounded square (~RGB235).
 *     Active: violet rounded square (CHROME.accentPurple family).
 *   - Modal rule: `activeTool` is nullable — null means no button is
 *     highlighted (e.g. a panel like ShapesPanel owns focus). The dock does
 *     NOT track "last selected tool" internally; the consumer (W3 editor)
 *     is the single source of truth for which tool (if any) is active.
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
  | "pen"
  | "highlighter"
  | "shapes"
  | "connector"
  | "text"
  | "sticky"
  | "table"
  | "stamp"
  | "comment"
  | "widgets";

export type FigJamDockProps = {
  /** Currently active tool, or null when no dock button should show the violet active state (modal rule). */
  activeTool?: ToolId | null;
  onSelectTool?: (tool: ToolId) => void;
  /** Fired specifically for the shape-tool button, which opens the left-docked Shapes panel rather than just becoming "the active tool" in the simple sense. */
  onOpenShapes?: () => void;
  onOpenOverflow?: () => void;
  disabled?: boolean;
  className?: string;
};

const DOCK_WIDTH_PX = 462;
const DOCK_HEIGHT_PX = 37;
const DOCK_RADIUS_PX = DOCK_HEIGHT_PX / 2;

type DockButtonSpec = {
  tool: ToolId;
  label: string;
  Icon: (props: { className?: string }) => React.JSX.Element;
  /** "+"-style persistent gray circular background (per spec, button 13 only). */
  persistentBg?: boolean;
};

const GROUP_A: DockButtonSpec[] = [
  { tool: "select", label: "Select", Icon: ArrowIcon },
  { tool: "hand", label: "Hand tool", Icon: HandIcon },
];

const GROUP_B: DockButtonSpec[] = [
  { tool: "pen", label: "Pen", Icon: PenIcon },
  { tool: "highlighter", label: "Highlighter", Icon: HighlighterIcon },
];

const GROUP_C: DockButtonSpec[] = [
  { tool: "shapes", label: "Shapes", Icon: ShapeSquareIcon },
  { tool: "connector", label: "Connector", Icon: ConnectorIcon },
];

const GROUP_D: DockButtonSpec[] = [
  { tool: "text", label: "Text", Icon: TextIcon },
  { tool: "sticky", label: "Sticky note", Icon: StickyIcon },
  { tool: "table", label: "Table", Icon: TableIcon },
  { tool: "stamp", label: "Stamp", Icon: StampIcon },
  { tool: "comment", label: "Comment", Icon: CommentIcon },
  { tool: "widgets", label: "Widgets", Icon: WidgetsIcon },
];

const HOVER_BG = "rgb(235, 235, 235)";
const ACTIVE_BG = CHROME.accentPurple;
const GLYPH_CHARCOAL = "rgb(51, 51, 51)";

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
  const { Icon, label, tool } = spec;

  const bg = isActive ? ACTIVE_BG : hovered ? HOVER_BG : "transparent";
  const glyphColor = isActive ? "#FFFFFF" : GLYPH_CHARCOAL;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        data-dock-tool={tool}
        data-active={isActive ? "true" : "false"}
        aria-label={label}
        aria-pressed={isActive}
        disabled={disabled}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 9,
          border: "none",
          background: bg,
          color: glyphColor,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.4 : 1,
          padding: 0,
          transition: "background-color 80ms ease-out",
        }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>
      <ChromeTooltip label={label} visible={hovered && !disabled} placement="top" />
    </div>
  );
}

function DockGroup({
  buttons,
  activeTool,
  disabled,
  onSelectTool,
  onOpenShapes,
  gapPx,
}: {
  buttons: DockButtonSpec[];
  activeTool: ToolId | null | undefined;
  disabled?: boolean;
  onSelectTool?: (tool: ToolId) => void;
  onOpenShapes?: () => void;
  gapPx: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: gapPx }} data-dock-group="">
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

export function FigJamDock({
  activeTool = null,
  onSelectTool,
  onOpenShapes,
  onOpenOverflow,
  disabled = false,
  className,
}: FigJamDockProps) {
  const [overflowHovered, setOverflowHovered] = useState(false);

  return (
    <div
      role="toolbar"
      aria-label="FigJam tools"
      data-figjam-dock=""
      className={className}
      style={{
        width: DOCK_WIDTH_PX,
        height: DOCK_HEIGHT_PX,
        borderRadius: DOCK_RADIUS_PX,
        background: "#FDFDFD",
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <DockGroup
          buttons={GROUP_A}
          activeTool={activeTool}
          disabled={disabled}
          onSelectTool={onSelectTool}
          gapPx={4}
        />
        <DockGroup
          buttons={GROUP_B}
          activeTool={activeTool}
          disabled={disabled}
          onSelectTool={onSelectTool}
          gapPx={4}
        />
        <DockGroup
          buttons={GROUP_C}
          activeTool={activeTool}
          disabled={disabled}
          onSelectTool={onSelectTool}
          onOpenShapes={onOpenShapes}
          gapPx={4}
        />
        <DockGroup
          buttons={GROUP_D}
          activeTool={activeTool}
          disabled={disabled}
          onSelectTool={onSelectTool}
          gapPx={4}
        />
      </div>

      <div style={{ position: "relative", display: "inline-flex" }}>
        <button
          type="button"
          data-dock-tool="overflow"
          aria-label="More"
          disabled={disabled}
          onMouseEnter={() => setOverflowHovered(true)}
          onMouseLeave={() => setOverflowHovered(false)}
          onClick={() => onOpenOverflow?.()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            background: "rgb(240, 240, 240)",
            color: GLYPH_CHARCOAL,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.4 : 1,
            padding: 0,
          }}
        >
          <PlusIcon className="h-[18px] w-[18px]" />
        </button>
        <ChromeTooltip label="More" visible={overflowHovered && !disabled} placement="top" />
      </div>
    </div>
  );
}

export const FIGJAM_DOCK_WIDTH_PX = DOCK_WIDTH_PX;
export const FIGJAM_DOCK_HEIGHT_PX = DOCK_HEIGHT_PX;
export const FIGJAM_DOCK_RADIUS_PX = DOCK_RADIUS_PX;
