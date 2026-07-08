"use client";

import { memo, useState } from "react";
// Type-only import: chrome must never import objects/ at runtime — the
// dependency points the other way (object defs import chrome components).
import type { ToolbarControlSpec } from "../../../objects/object-def";
import { EDITOR_STYLE } from "../../components/editor-style";
import { Tooltip } from "../../../ui/Tooltip";
import {
  ChevronDownIcon,
  ColorSwatchIcon,
  ConnectorArrowLeftIcon,
  ConnectorArrowRightIcon,
  ConnectorArrowsBothIcon,
  ConnectorDashedLineIcon,
  ConnectorNoArrowheadsIcon,
  ConnectorSolidLineIcon,
  DashIcon,
  LockIcon,
  NoStrokeIcon,
  RenameIcon,
  ShapeSwapIcon,
  StrokeIcon,
  TypeIcon,
} from "../../../ui/icons";

/**
 * SelectionToolbar — the dark floating pill shown above a selection.
 *
 * Ground truth: board-design-reference/analysis/figjam-chrome-catalog.md
 * section 2 (selection-specific control sets) + figjam-style-tokens.json
 * `chrome` key (historically named "contextToolbarBg" there, #1D1D1D).
 * The host is FigJam-scale chrome: a 48px dark rounded rectangle with 36px
 * controls and action-specific presentation supplied by the layer.
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
  | "shape-swap"
  | "color"
  | "text"
  | "section-border-style"
  | "rename"
  | "lock"
  | "dash"
  | "arrowhead";

type Icon = (props: { className?: string; color?: string }) => React.JSX.Element;

export type SelectionToolbarControl = {
  action: SelectionToolbarActionId;
  label: string;
  Icon: Icon;
  /** Whether this control opens a flyout (renders a chevron affordance). */
  hasFlyout?: boolean;
  /** Rendered as literal text instead of an icon (e.g. "Medium", "B"). */
  text?: string;
  /** Divider rendered immediately AFTER this control. */
  dividerAfter?: boolean;
};

export type ToolbarControlState = {
  /** Highlighted control state (for example, locked). */
  active?: boolean;
  /** "color" action swatch color; other actions use it as icon color. */
  color?: string;
  /** Per-action icon variant key resolved through ACTION_ICON_VARIANTS. */
  variant?: string;
  /** Tooltip and aria-label override. */
  label?: string;
};

/**
 * Icon resolution for registry-driven (icon-free) control specs: each action
 * id maps 1:1 onto the icon measured for it in figjam-chrome-catalog.md
 * section 2. "color" additionally keeps its special current-color swatch
 * rendering inside ToolbarButton.
 */
const ACTION_ICONS: Record<string, SelectionToolbarControl["Icon"]> = {
  "shape-swap": ShapeSwapIcon,
  color: ColorSwatchIcon,
  text: TypeIcon,
  "section-border-style": StrokeIcon,
  rename: RenameIcon,
  lock: LockIcon,
  dash: ConnectorSolidLineIcon,
  arrowhead: ConnectorArrowRightIcon,
};

const ACTION_ICON_VARIANTS: Partial<Record<SelectionToolbarActionId, Record<string, Icon>>> = {
  "section-border-style": { solid: StrokeIcon, dashed: DashIcon, none: NoStrokeIcon },
  dash: { solid: ConnectorSolidLineIcon, dashed: ConnectorDashedLineIcon },
  arrowhead: {
    none: ConnectorNoArrowheadsIcon,
    forward: ConnectorArrowRightIcon,
    back: ConnectorArrowLeftIcon,
    both: ConnectorArrowsBothIcon,
  },
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
  /** Optional style overrides for positioning; consumer supplies via wrapper. */
  style?: React.CSSProperties;
  className?: string;
  controlState?: Readonly<Partial<Record<SelectionToolbarActionId, ToolbarControlState>>>;
  activeFlyout?: SelectionToolbarActionId | null;
};

const TOOLBAR_HEIGHT_PX = EDITOR_STYLE.selectionToolbarHeightPx;
const TOOLBAR_BG = EDITOR_STYLE.selectionToolbarBg; // #1D1D1D
const TOOLBAR_ENTER_ANIMATION_NAME = "canvas-selection-toolbar-enter";
const TOOLBAR_ENTER_ANIMATION = `${TOOLBAR_ENTER_ANIMATION_NAME} 140ms cubic-bezier(0.22, 1, 0.36, 1) both`;
const TOOLBAR_ANIMATION_STYLES = `
@keyframes ${TOOLBAR_ENTER_ANIMATION_NAME} {
  from {
    opacity: 0;
    transform: translate3d(0, 6px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-selection-toolbar] {
    animation-duration: 1ms !important;
  }
}
`;

function ToolbarButton({
  control,
  onAction,
  controlState,
  activeFlyout,
}: {
  control: SelectionToolbarControl;
  onAction?: (action: SelectionToolbarActionId, value?: unknown) => void;
  controlState?: Readonly<Partial<Record<SelectionToolbarActionId, ToolbarControlState>>>;
  activeFlyout?: SelectionToolbarActionId | null;
}) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const { Icon, action, hasFlyout, text } = control;
  const state = controlState?.[action];
  const label = state?.label ?? control.label;
  const clearHover = () => setHovered(false);
  const EffectiveIcon = (state?.variant ? ACTION_ICON_VARIANTS[action]?.[state.variant] : undefined) ?? Icon;
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
          gap: EDITOR_STYLE.selectionToolbarGapPx,
          height: EDITOR_STYLE.selectionToolbarButtonHeightPx,
          padding: "0 8px",
          borderRadius: EDITOR_STYLE.selectionToolbarButtonRadiusPx,
          border: "none",
          background: state?.active
            ? EDITOR_STYLE.accentPurple
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
              width: EDITOR_STYLE.selectionToolbarSwatchPx,
              height: EDITOR_STYLE.selectionToolbarSwatchPx,
            }}
          >
            <ColorSwatchIcon color={state?.color} style={{ width: "100%", height: "100%" }} />
          </span>
        ) : (
          <span style={{ color: state?.color }}>
            <EffectiveIcon className="h-5 w-5" />
          </span>
        )}
        {text ? <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>{text}</span> : null}
        {hasFlyout ? <ChevronDownIcon className="h-3 w-3" /> : null}
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
  controlState,
  activeFlyout,
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
    <>
      <style>{TOOLBAR_ANIMATION_STYLES}</style>
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
          borderRadius: EDITOR_STYLE.selectionToolbarRadiusPx,
          background: TOOLBAR_BG,
          padding: `0 ${EDITOR_STYLE.selectionToolbarPaddingXPx}px`,
          gap: EDITOR_STYLE.selectionToolbarGapPx,
          boxSizing: "border-box",
          boxShadow: EDITOR_STYLE.selectionToolbarShadow,
          animation: TOOLBAR_ENTER_ANIMATION,
          willChange: "transform, opacity",
          ...style,
        }}
      >
        {controls.map((control, i) => (
          <span key={control.action} style={{ display: "inline-flex", alignItems: "center" }}>
            <ToolbarButton
              control={control}
              onAction={onAction}
              controlState={controlState}
              activeFlyout={activeFlyout}
            />
            {control.dividerAfter && i < controls.length - 1 ? (
              <span
                data-divider=""
                style={{
                  width: 1,
                  height: 24,
                  background: "rgba(255,255,255,0.2)",
                  margin: "0 6px",
                }}
              />
            ) : null}
          </span>
        ))}
      </div>
    </>
  );
}

export const SelectionToolbar = memo(SelectionToolbarComponent);
