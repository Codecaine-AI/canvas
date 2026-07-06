"use client";

import { memo, useState } from "react";
// Type-only import: chrome must never import objects/ at runtime — the
// dependency points the other way (object defs import chrome components).
import type { ToolbarControlSpec } from "../objects/object-def";
import { CHROME } from "../tokens/figjam-tokens";
import { ChromeTooltip } from "./ChromeTooltip";
import {
  AlignIcon,
  ArrowheadIcon,
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
  TextLabelIcon,
} from "./toolbar-icons";

/**
 * ContextToolbar — the dark floating pill shown above a selection.
 *
 * Ground truth: board-design-reference/analysis/figjam-chrome-catalog.md
 * section 2 (control sets per selection type, measured via fj-007/fj-012/
 * fj-030 etc.) + figjam-style-tokens.json `chrome` key (contextToolbarBg
 * #1D1D1D). Height 29-30px matches the catalog's dark-pill family (same
 * family as the color popover, ~28-30px radius scaled to pill height).
 *
 * Since RESTRUCTURE.md step 5 this is a DUMB HOST: callers pass the icon-free
 * `controls` spec list resolved from the object registry (objects/ defs are
 * the source of truth for which controls each selection kind gets), and this
 * component resolves each action id to its icon via ACTION_ICONS. The legacy
 * `variant` prop keeps working for back-compat by resolving through the
 * deprecated CONTEXT_TOOLBAR_REGISTRY. Buttons fire a single typed
 * `onAction(actionId, value?)` callback rather than one callback per button.
 */

export type ContextToolbarVariant = "shape" | "section" | "connector" | "text" | "sticky" | "multi";

export type ContextToolbarActionId =
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

export type ContextToolbarControl = {
  action: ContextToolbarActionId;
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
 * @deprecated The objects/ registry is now the source of truth for context
 * toolbar control sets (each ObjectDef carries its own `toolbar` spec, and
 * multi-select is a capability intersection over the selected defs — see
 * objects/object-def.ts). This table remains only for back-compat with the
 * `variant` prop on the public `@codecaine-ai/canvas/chrome` surface.
 *
 * Registry mapping each selection-type variant to its measured control set.
 * Order and membership per figjam-chrome-catalog.md section 2:
 *   shape: shape-swap▾, color▾, align▾, Aa▾, size▾, B, strike, link, bullets, align▾(paragraph)
 *   section: color▾, border style▾
 *   connector: color▾, align▾, add-text(T), line-style▾, corner-style▾, arrowhead▾
 *   text (label editing variant): color▾, Aa▾, size▾, B, strike
 */
export const CONTEXT_TOOLBAR_REGISTRY: Record<ContextToolbarVariant, ContextToolbarControl[]> = {
  shape: [
    { action: "shape-swap", label: "Change shape", Icon: ShapeSwapIcon, hasFlyout: true },
    { action: "color", label: "Fill color", Icon: ColorSwatchIcon, hasFlyout: true },
    { action: "align", label: "Alignment", Icon: AlignIcon, hasFlyout: true },
    { action: "font-style", label: "Font style", Icon: FontStyleIcon, hasFlyout: true },
    { action: "size", label: "Text size", Icon: SizeIcon, hasFlyout: true, text: "Medium" },
    { action: "bold", label: "Bold", Icon: BoldIcon },
    { action: "strikethrough", label: "Strikethrough", Icon: StrikethroughIcon },
    { action: "link", label: "Link", Icon: LinkIcon },
    { action: "bullets", label: "Bullet list", Icon: BulletsIcon },
    { action: "paragraph-align", label: "Paragraph alignment", Icon: ParagraphAlignIcon, hasFlyout: true },
  ],
  section: [
    { action: "color", label: "Color", Icon: ColorSwatchIcon, hasFlyout: true },
    { action: "section-border-style", label: "Border style", Icon: StrokeIcon, hasFlyout: true },
    { action: "rename", label: "Rename", Icon: RenameIcon, dividerAfter: true },
    { action: "visibility", label: "Hide contents", Icon: EyeIcon },
    { action: "lock", label: "Lock", Icon: LockIcon, hasFlyout: true },
  ],
  connector: [
    { action: "color", label: "Line color", Icon: ColorSwatchIcon, hasFlyout: true },
    { action: "stroke", label: "Stroke", Icon: StrokeIcon, hasFlyout: true },
    { action: "dash", label: "Line style", Icon: DashIcon, hasFlyout: true },
    { action: "routing", label: "Corner style", Icon: RoutingIcon, hasFlyout: true },
    { action: "arrowhead", label: "Arrowhead style", Icon: ArrowheadIcon, hasFlyout: true },
    { action: "label-align", label: "Label alignment", Icon: LabelAlignIcon, hasFlyout: true },
  ],
  text: [
    { action: "color", label: "Text color", Icon: ColorSwatchIcon, hasFlyout: true },
    { action: "font-style", label: "Font style", Icon: FontStyleIcon, hasFlyout: true },
    { action: "size", label: "Text size", Icon: SizeIcon, hasFlyout: true, text: "Small" },
    { action: "bold", label: "Bold", Icon: BoldIcon },
    { action: "strikethrough", label: "Strikethrough / clear formatting", Icon: StrikethroughIcon },
  ],
  // Multi-select was never observed in the source recording (catalog section 2,
  // "Multi-select: not observed"). We reuse the shape variant's control set as
  // the most reasonable default rather than fabricate an unverified layout —
  // flagged for W3/live-product confirmation.
  sticky: [
    { action: "color", label: "Sticky color", Icon: ColorSwatchIcon, hasFlyout: true },
    { action: "font-style", label: "Font style", Icon: FontStyleIcon, hasFlyout: true },
    { action: "size", label: "Text size", Icon: SizeIcon, hasFlyout: true, text: "Medium" },
    { action: "bold", label: "Bold", Icon: BoldIcon },
    { action: "bullets", label: "Bullet list", Icon: BulletsIcon },
  ],
  multi: [
    { action: "color", label: "Fill color", Icon: ColorSwatchIcon, hasFlyout: true },
    { action: "align", label: "Alignment", Icon: AlignIcon, hasFlyout: true },
  ],
};

/**
 * Icon resolution for registry-driven (icon-free) control specs: each action
 * id maps 1:1 onto the icon the legacy CONTEXT_TOOLBAR_REGISTRY carried for
 * it. "color" additionally keeps its special current-color swatch rendering
 * inside ToolbarButton.
 */
const ACTION_ICONS: Record<string, ContextToolbarControl["Icon"]> = {
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
  arrowhead: ArrowheadIcon,
  "label-align": LabelAlignIcon,
  "add-label": TextLabelIcon,
};

/** Fallback for out-of-vocabulary action ids in a registry-supplied spec. */
function BlankIcon({ className }: { className?: string; color?: string }) {
  return <span className={className} />;
}

export type ContextToolbarProps = {
  /**
   * Legacy variant-keyed control lookup (resolves through the deprecated
   * CONTEXT_TOOLBAR_REGISTRY). Ignored when `controls` is provided.
   */
  variant?: ContextToolbarVariant;
  /**
   * Registry-driven control specs (objects/ ObjectDef.toolbar) — icon-free;
   * icons resolve via ACTION_ICONS. Takes precedence over `variant`.
   */
  controls?: readonly ToolbarControlSpec[];
  /** `data-variant` / aria label override; falls back to `variant`. */
  variantLabel?: string;
  onAction?: (action: ContextToolbarActionId, value?: unknown) => void;
  /** Optional style overrides for positioning; consumer supplies via wrapper. Height is fixed to the measured 29px per spec. */
  style?: React.CSSProperties;
  className?: string;
  currentColor?: string;
  currentSectionStroke?: string;
  currentSectionBorderStyle?: SectionBorderStyleValue;
  activeFlyout?: ContextToolbarActionId | null;
  sectionContentHidden?: boolean;
  sectionLocked?: boolean;
};

const TOOLBAR_HEIGHT_PX = 29;
const TOOLBAR_BG = CHROME.contextToolbarBg; // #1D1D1D

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
  control: ContextToolbarControl;
  onAction?: (action: ContextToolbarActionId, value?: unknown) => void;
  currentColor?: string;
  currentSectionStroke?: string;
  currentSectionBorderStyle?: SectionBorderStyleValue;
  activeFlyout?: ContextToolbarActionId | null;
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
              width: CHROME.contextToolbarSwatchPx,
              height: CHROME.contextToolbarSwatchPx,
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
      <ChromeTooltip label={label} visible={hovered} placement="top" />
    </div>
  );
}

function ContextToolbarComponent({
  variant,
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
}: ContextToolbarProps) {
  const controls: readonly ContextToolbarControl[] = controlSpecs
    ? controlSpecs.map((spec) => ({
        action: spec.action as ContextToolbarActionId,
        label: spec.label,
        Icon: ACTION_ICONS[spec.action] ?? BlankIcon,
        hasFlyout: spec.hasFlyout,
        text: spec.text,
        dividerAfter: spec.dividerAfter,
      }))
    : variant
      ? CONTEXT_TOOLBAR_REGISTRY[variant]
      : [];
  const label = variantLabel ?? variant;

  return (
    <div
      role="toolbar"
      aria-label={label ? `${label} selection toolbar` : "selection toolbar"}
      data-context-toolbar=""
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

export const ContextToolbar = memo(ContextToolbarComponent);

// Extra control for the connector text-label-editing swap (catalog: "the
// toolbar swaps to a text-formatting variant" when editing a connector's
// label) — this is just the "text" variant, already covered above. Exported
// alias for clarity at call sites.
export const CONNECTOR_LABEL_EDIT_VARIANT: ContextToolbarVariant = "text";

/** Standalone "add text label" control used only by the connector variant per the catalog ("T" add-text-label icon). Exposed for W3 to splice in if it needs a 7th connector control; kept out of the registry default set since the catalog's 6-control count for "connector" already matches without it (color/align/T/line-style/corner-style/arrowhead = 6; we render color/stroke/dash/routing/arrowhead/label-align = 6 per the task brief's exact spec). */
export const CONNECTOR_ADD_LABEL_ICON = TextLabelIcon;
