import { CheckIcon } from "@codecaine-ai/canvas/ui/icons";
import { resolveSectionPaint, resolveShapePaint } from "@codecaine-ai/canvas";
import { CANVAS_THEME_LABELS, type CanvasStyle, type CanvasThemeId } from "@codecaine-ai/canvas/style";
import "./styles.css";
import { PREVIEW_INKS } from "./constants";

export type ThemeCardProps = {
  theme: CanvasThemeId;
  name: string;
  active: boolean;
  edited: boolean;
  style: CanvasStyle;
  onSelect(): void;
};

/**
 * One theme as a radio card: a miniature board in that theme — board color
 * and grid, a top-level section with its header chip (pinned or floating), a
 * card inside it with a name and a detail line, and four palette inks — drawn
 * with the canvas package's own paint resolvers, so it shows what the theme
 * (with its edits) actually renders.
 */
export function ThemeCard({ theme, name, active, edited, style, onSelect }: ThemeCardProps) {
  const section = resolveSectionPaint("blue", 1, style);
  const card = resolveShapePaint("violet", style);
  const pinned = style.headerPlacement === "pinned";
  return (
    <label className="canvas-style-theme-card" data-active={active ? "true" : "false"} data-board-theme={theme}>
      <input
        type="radio"
        className="canvas-style-visually-hidden"
        name={name}
        value={theme}
        checked={active}
        onChange={onSelect}
      />
      <span
        aria-hidden="true"
        className="canvas-style-theme-preview"
        style={{
          backgroundColor: style.boardBackground,
          backgroundImage: `radial-gradient(circle, ${style.gridDotColor} 0.75px, transparent 0.9px)`,
        }}
      >
        <span
          className="canvas-style-theme-preview-section"
          style={{ background: section.fill, borderColor: section.border }}
        >
          <span
            className="canvas-style-theme-preview-chip"
            data-placement={pinned ? "pinned" : "floating"}
            style={{ background: section.chipFill, borderColor: section.chipBorder }}
          >
            <span style={{ background: section.headerText }} />
          </span>
          <span
            className="canvas-style-theme-preview-card"
            style={{ background: card.fill, borderColor: card.border }}
          >
            <span style={{ background: card.text }} />
            <span style={{ background: style.detailColor }} />
          </span>
        </span>
        <span className="canvas-style-theme-preview-inks">
          {PREVIEW_INKS.map((color) => (
            <span key={color} style={{ background: style.palette[color] }} />
          ))}
        </span>
        {active ? (
          <span className="canvas-style-theme-check">
            <CheckIcon className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </span>
      <span className="canvas-style-theme-label">
        {CANVAS_THEME_LABELS[theme]}
        {edited ? (
          <span className="canvas-style-theme-edited" title="This theme has overrides" />
        ) : null}
      </span>
    </label>
  );
}
