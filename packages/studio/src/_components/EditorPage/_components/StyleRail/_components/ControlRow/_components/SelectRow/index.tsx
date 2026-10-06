import { useId } from "react";
import "./styles.css";
import { controlId, controlName } from "@/_components/EditorPage/_components/StyleRail/utils";
import type { RowProps } from "../../types";
import { RowLabel } from "../RowLabel";

export type SelectRowProps = RowProps & { value: string };

export function SelectRow({ control, value, overridden, onChange, onReset }: SelectRowProps) {
  const radioName = useId();
  return (
    <div className="grid gap-1.5 text-ui-xs" data-control={controlId(control)}>
      <RowLabel control={control} overridden={overridden} onReset={onReset} />
      <div role="radiogroup" aria-label={controlName(control)} className="canvas-style-segmented">
        {(control.options ?? []).map((option) => (
          <label
            key={option.value}
            className="canvas-style-segment"
            data-active={option.value === value ? "true" : "false"}
            title={option.label}
          >
            <input
              type="radio"
              className="canvas-style-visually-hidden"
              name={radioName}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className="truncate">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
