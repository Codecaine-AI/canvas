import { useId, type ReactNode } from "react";
import { ChevronDownIcon } from "@codecaine-ai/canvas/ui/icons";
import { CANVAS_STYLE_GROUP_LABELS, type CanvasStyleGroup } from "@codecaine-ai/canvas/style";
import "./styles.css";

export type GroupSectionProps = {
  group: CanvasStyleGroup;
  open: boolean;
  overrideCount: number;
  onToggle(): void;
  children: ReactNode;
};

export function GroupSection({ group, open, overrideCount: count, onToggle, children }: GroupSectionProps) {
  const bodyId = useId();
  const label = CANVAS_STYLE_GROUP_LABELS[group];
  return (
    <section className="canvas-style-rail-group" data-group={group}>
      <button
        type="button"
        className="canvas-style-rail-group-header"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={onToggle}
      >
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {count > 0 ? (
            <span
              className="canvas-style-rail-group-count"
              title={`${count} ${count === 1 ? "override" : "overrides"} in ${label}`}
            >
              {count}
            </span>
          ) : null}
          <ChevronDownIcon
            className="h-3 w-3 transition-transform"
            style={{ transform: open ? "none" : "rotate(-90deg)" }}
          />
        </span>
      </button>
      {open ? (
        <div id={bodyId} className="canvas-style-rail-group-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
