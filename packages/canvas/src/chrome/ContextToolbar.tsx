"use client";

import { useState } from "react";
import { CHROME } from "../render/figjam-tokens";
import { ChromeTooltip } from "./ChromeTooltip";
import {
  AlignIcon,
  ArrowheadIcon,
  BoldIcon,
  BulletsIcon,
  ChevronDownIcon,
  ColorSwatchIcon,
  DashIcon,
  ExpandIcon,
  EyeIcon,
  FontStyleIcon,
  FrameIcon,
  LabelAlignIcon,
  LayersIcon,
  LinkIcon,
  LockIcon,
  ParagraphAlignIcon,
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
 * Variant-driven via CONTEXT_TOOLBAR_REGISTRY (mirrors AFFiNE's
 * registry-data pattern per the task brief): each variant supplies its own
 * ordered control list + divider positions. Buttons fire a single typed
 * `onAction(actionId, value?)` callback rather than one callback per button,
 * so W3 can wire the whole registry to editor commands without per-control
 * plumbing.
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
  | "list"
  | "frame"
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

/**
 * Registry mapping each selection-type variant to its measured control set.
 * Order and membership per figjam-chrome-catalog.md section 2:
 *   shape: shape-swap▾, color▾, align▾, Aa▾, size▾, B, strike, link, bullets, align▾(paragraph)
 *   section: tint▾, list▾, frame, eye, lock▾, expand — divider after tint/list pair per catalog's "a divider" note
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
    { action: "tint", label: "Section color", Icon: ColorSwatchIcon, hasFlyout: true },
    { action: "list", label: "Layers", Icon: LayersIcon, hasFlyout: true, dividerAfter: true },
    { action: "frame", label: "Duplicate as frame", Icon: FrameIcon },
    { action: "visibility", label: "Toggle visibility", Icon: EyeIcon },
    { action: "lock", label: "Lock", Icon: LockIcon, hasFlyout: true },
    { action: "expand", label: "Zoom to fit", Icon: ExpandIcon },
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

export type ContextToolbarProps = {
  variant: ContextToolbarVariant;
  onAction?: (action: ContextToolbarActionId, value?: unknown) => void;
  /** Optional style overrides for positioning; consumer supplies via wrapper. Height is fixed to the measured 29px per spec. */
  style?: React.CSSProperties;
  className?: string;
};

const TOOLBAR_HEIGHT_PX = 29;
const TOOLBAR_BG = CHROME.contextToolbarBg; // #1D1D1D

function ToolbarButton({
  control,
  onAction,
}: {
  control: ContextToolbarControl;
  onAction?: (action: ContextToolbarActionId, value?: unknown) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const { Icon, label, action, hasFlyout, text } = control;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        data-toolbar-action={action}
        aria-label={label}
        aria-expanded={hasFlyout ? open : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
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
          background: hovered ? "rgba(255,255,255,0.12)" : "transparent",
          color: "#FFFFFF",
          cursor: "pointer",
        }}
      >
        <Icon className="h-4 w-4" />
        {text ? <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{text}</span> : null}
        {hasFlyout ? <ChevronDownIcon className="h-2.5 w-2.5" /> : null}
      </button>
      <ChromeTooltip label={label} visible={hovered} placement="top" />
    </div>
  );
}

export function ContextToolbar({ variant, onAction, style, className }: ContextToolbarProps) {
  const controls = CONTEXT_TOOLBAR_REGISTRY[variant];

  return (
    <div
      role="toolbar"
      aria-label={`${variant} selection toolbar`}
      data-context-toolbar=""
      data-variant={variant}
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
          <ToolbarButton control={control} onAction={onAction} />
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

// Extra control for the connector text-label-editing swap (catalog: "the
// toolbar swaps to a text-formatting variant" when editing a connector's
// label) — this is just the "text" variant, already covered above. Exported
// alias for clarity at call sites.
export const CONNECTOR_LABEL_EDIT_VARIANT: ContextToolbarVariant = "text";

/** Standalone "add text label" control used only by the connector variant per the catalog ("T" add-text-label icon). Exposed for W3 to splice in if it needs a 7th connector control; kept out of the registry default set since the catalog's 6-control count for "connector" already matches without it (color/align/T/line-style/corner-style/arrowhead = 6; we render color/stroke/dash/routing/arrowhead/label-align = 6 per the task brief's exact spec). */
export const CONNECTOR_ADD_LABEL_ICON = TextLabelIcon;
