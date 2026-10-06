import { useId, useState } from "react";
import { snapToControlStep } from "@codecaine-ai/canvas/style";
import "./styles.css";
import { controlId, controlName } from "@/_components/EditorPage/_components/StyleRail/utils";
import type { RowProps } from "../../types";
import { RowLabel } from "../RowLabel";

export type NumberRowProps = RowProps & { value: number };

export function NumberRow({ control, value, overridden, onChange, onReset }: NumberRowProps) {
  const sliderId = useId();
  // The exact input keeps its own text while focused, so "0." or an empty
  // field can be typed through; every parseable value applies at once,
  // snapped to the step on snapping controls (a typed weight of 450 applies
  // 500; the field shows the applied value once it loses focus).
  const [draft, setDraft] = useState<string | null>(null);
  const name = controlName(control);
  const unit = control.key.endsWith("Px") ? "px" : null;
  return (
    <div className="grid gap-1.5 text-ui-xs" data-control={controlId(control)}>
      <span className="flex items-center justify-between gap-3">
        <RowLabel control={control} htmlFor={sliderId} overridden={overridden} onReset={onReset} />
        <span className="flex shrink-0 items-center gap-1 text-ui-2xs text-muted-foreground">
          <input
            type="number"
            className="canvas-style-number"
            aria-label={`${name} value`}
            min={control.min}
            max={control.max}
            step={control.step}
            value={draft ?? String(value)}
            onFocus={() => setDraft(String(value))}
            onChange={(event) => {
              const text = event.currentTarget.value;
              setDraft(text);
              const parsed = Number(text);
              if (text.trim() !== "" && Number.isFinite(parsed)) onChange(snapToControlStep(control, parsed));
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          {unit}
        </span>
      </span>
      <input
        id={sliderId}
        className="canvas-style-range"
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        aria-label={name}
        onChange={(event) => onChange(snapToControlStep(control, Number(event.currentTarget.value)))}
      />
    </div>
  );
}
