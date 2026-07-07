"use client";

import { memo, useState } from "react";
// Type-only import: chrome must never import objects/ at runtime — the
// dependency points the other way (object defs import chrome components).
import type { ToolbarControlSpec } from "../../../objects/object-def";
import { CHROME } from "../../../theme/tokens";
import { Tooltip } from "../../../ui/Tooltip";
import {
  AlignIcon,
  ArrowRightIcon,
  BoldIcon,
  BulletsIcon,
  ChevronDownIcon,
  ColorSwatchIcon,
  DashIcon,
  EyeIcon,
  EyeOffIcon,
  FontStyleIcon,
  LabelAlignIcon,
  LinkIcon,
  LockIcon,
  NoStrokeIcon,
  ParagraphAlignIcon,
  RenameIcon,
  RoutingIcon,
  ShapeSwapIcon,
  SizeIcon,
  StrikethroughIcon,
  StrokeIcon,
  TypeIcon,
} from "../../../ui/icons";

/**
 * SelectionToolbar — the dark floating pill shown above a selection.
 *
 * Ground truth: board-design-reference/analysis/figjam-chrome-catalog.md
 * section 2 (control sets per selection type, measured via fj-007/fj-012/
 * fj-030 etc.) + figjam-style-tokens.json `chrome` key (historically named
 * "contextToolbarBg" there, #1D1D1D). Height 29-30px matches the catalog's
 * dark-pill family (same family as the color popover, ~28-30px radius scaled
 * to pill height).
 *
 * Since RESTRUCTURE.md step 5 this is a DUMB HOST: callers pass the icon-free
 * `controls` spec list resolved from the object registry (objects/ defs are
 * the source of truth for which controls each selection kind gets), and this
 * component resolves each action id to its icon via ACTION_ICONS. Buttons
 * fire a single typed `onAction(actionId, value?)` callback rather than one
 * callback per button. (The legacy variant-keyed CONTEXT_TOOLBAR_REGISTRY and
 * its `variant` prop were deleted once the registry migration landed — no
 * consumer remained.)
 */

export type SelectionToolbarActionId =
  // shape-swap / connector routing etc.
  | "shape-swap"
  | "color"
  | "align"
  | "font-style"
  | "size"
  | "bold"
  | "strikethrough"
  | "link"
  | "bullets"
  | "paragraph-align"
  // section
  | "tint"
  | "section-border-style"
  | "rename"
  | "visibility"
  | "lock"
  | "expand"
  // connector
  | "stroke"
  | "dash"
  | "routing"
  | "arrowhead"
  | "label-align"
  | "add-label";

export type SelectionToolbarControl = {
  action: SelectionToolbarActionId;
  label: string;
  Icon: (props: { className?: string; color?: string }) => React.JSX.Element;
  /** Whether this control opens a flyout (renders a chevron affordance). */
  hasFlyout?: boolean;
  /** Rendered as literal text instead of an icon (e.g. "Medium", "B"). */
  text?: string;
  /** Divider rendered immediately AFTER this control. */
  dividerAfter?: boolean;
};

export type SectionBorderStyleValue = "solid" | "dashed" | "none";

/**
 * Icon resolution for registry-driven (icon-free) control specs: each action
 * id maps 1:1 onto the icon measured for it in figjam-chrome-catalog.md
 * section 2. "color" additionally keeps its special current-color swatch
 * rendering inside ToolbarButton.
 */
const ACTION_ICONS: Record<string, SelectionToolbarControl["Icon"]> = {
  "shape-swap": ShapeSwapIcon,
  color: ColorSwatchIcon,
  align: AlignIcon,
  "font-style": FontStyleIcon,
  size: SizeIcon,
  bold: BoldIcon,
  strikethrough: StrikethroughIcon,
  link: LinkIcon,
  bullets: BulletsIcon,
  "paragraph-align": ParagraphAlignIcon,
  "section-border-style": StrokeIcon,
  rename: RenameIcon,
  visibility: EyeIcon,
  lock: LockIcon,
  stroke: StrokeIcon,
  dash: DashIcon,
  routing: RoutingIcon,
  arrowhead: ArrowRightIcon,
  "label-align": LabelAlignIcon,
  "add-label": TypeIcon,
};

/** Fallback for out-of-vocabulary action ids in a registry-supplied spec. */
function BlankIcon({ className }: { className?: string; color?: string }) {
  return <span className={className} />;
}

export type SelectionToolbarProps = {
  /**
   * Registry-driven control specs (objects/ ObjectDef.toolbar) — icon-free;
   * icons resolve via ACTION_ICONS.
   */
  controls: readonly ToolbarControlSpec[];
  /** Feeds `data-variant` and the toolbar's aria label. */
  variantLabel?: string;
  onAction?: (action: SelectionToolbarActionId, value?: unknown) => void;
  /** Optional style overrides for positioning; consumer supplies via wrapper. Height is fixed to the measured 29px per spec. */
  style?: React.CSSProperties;
  className?: string;
  currentColor?: string;
  currentSectionStroke?: string;
  currentSectionBorderStyle?: SectionBorderStyleValue;
  activeFlyout?: SelectionToolbarActionId | null;
  sectionContentHidden?: boolean;
  sectionLocked?: boolean;
};

const TOOLBAR_HEIGHT_PX = 29;
const TOOLBAR_BG = CHROME.selectionToolbarBg; // #1D1D1D

function ToolbarButton({
  control,
  onAction,
  currentColor,
  currentSectionStroke,
  currentSectionBorderStyle,
  activeFlyout,
  sectionContentHidden,
  sectionLocked,
}: {
  control: SelectionToolbarControl;
  onAction?: (action: SelectionToolbarActionId, value?: unknown) => void;
  currentColor?: string;
  currentSectionStroke?: string;
  currentSectionBorderStyle?: SectionBorderStyleValue;
  activeFlyout?: SelectionToolbarActionId | null;
  sectionContentHidden?: boolean;
  sectionLocked?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const { Icon, action, hasFlyout, text } = control;
  const label =
    action === "visibility"
      ? sectionContentHidden ? "Show contents" : "Hide contents"
      : action === "lock"
        ? sectionLocked ? "Unlock" : "Lock"
        : control.label;
  const clearHover = () => setHovered(false);
  const BorderIcon =
    currentSectionBorderStyle === "dashed" ? DashIcon : currentSectionBorderStyle === "none" ? NoStrokeIcon : StrokeIcon;
  const EffectiveIcon =
    action === "section-border-style"
      ? BorderIcon
      : action === "visibility" && sectionContentHidden
        ? EyeOffIcon
        : Icon;
  const expanded = activeFlyout !== undefined ? activeFlyout === action : open;
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        data-toolbar-action={action}
        aria-label={label}
        aria-expanded={hasFlyout ? expanded : undefined}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={clearHover}
        onPointerCancel={clearHover}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={clearHover}
        onBlur={clearHover}
        onClick={() => {
          clearHover();
          if (hasFlyout) setOpen((v) => !v);
          onAction?.(action);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          height: TOOLBAR_HEIGHT_PX - 6,
          padding: "0 6px",
          borderRadius: 6,
          border: "none",
          background:
            action === "lock" && sectionLocked
              ? CHROME.accentPurple
              : hovered
                ? "rgba(255,255,255,0.12)"
                : "transparent",
          color: "#FFFFFF",
          cursor: "pointer",
        }}
      >
        {action === "color" ? (
          <span
            style={{
              display: "inline-flex",
              width: CHROME.selectionToolbarSwatchPx,
              height: CHROME.selectionToolbarSwatchPx,
            }}
          >
            <ColorSwatchIcon color={currentColor} style={{ width: "100%", height: "100%" }} />
          </span>
        ) : (
          <span style={{ color: action === "section-border-style" ? currentSectionStroke : undefined }}>
            <EffectiveIcon className="h-4 w-4" />
          </span>
        )}
        {text ? <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{text}</span> : null}
        {hasFlyout ? <ChevronDownIcon className="h-2.5 w-2.5" /> : null}
      </button>
      <Tooltip label={label} visible={hovered} placement="top" />
    </div>
  );
}

function SelectionToolbarComponent({
  controls: controlSpecs,
  variantLabel,
  onAction,
  style,
  className,
  currentColor,
  currentSectionStroke,
  currentSectionBorderStyle,
  activeFlyout,
  sectionContentHidden,
  sectionLocked,
}: SelectionToolbarProps) {
  const controls: readonly SelectionToolbarControl[] = controlSpecs.map((spec) => ({
    action: spec.action as SelectionToolbarActionId,
    label: spec.label,
    Icon: ACTION_ICONS[spec.action] ?? BlankIcon,
    hasFlyout: spec.hasFlyout,
    text: spec.text,
    dividerAfter: spec.dividerAfter,
  }));
  const label = variantLabel;

  return (
    <div
      role="toolbar"
      aria-label={label ? `${label} selection toolbar` : "selection toolbar"}
      data-selection-toolbar=""
      data-variant={label}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: TOOLBAR_HEIGHT_PX,
        borderRadius: TOOLBAR_HEIGHT_PX / 2,
        background: TOOLBAR_BG,
        padding: "0 6px",
        gap: 2,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {controls.map((control, i) => (
        <span key={control.action} style={{ display: "inline-flex", alignItems: "center" }}>
          <ToolbarButton
            control={control}
            onAction={onAction}
            currentColor={currentColor}
            currentSectionStroke={currentSectionStroke}
            currentSectionBorderStyle={currentSectionBorderStyle}
            activeFlyout={activeFlyout}
            sectionContentHidden={sectionContentHidden}
            sectionLocked={sectionLocked}
          />
          {control.dividerAfter && i < controls.length - 1 ? (
            <span
              data-divider=""
              style={{
                width: 1,
                height: 16,
                background: "rgba(255,255,255,0.2)",
                margin: "0 4px",
              }}
            />
          ) : null}
        </span>
      ))}
    </div>
  );
}

export const SelectionToolbar = memo(SelectionToolbarComponent);
