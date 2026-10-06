import { useId } from "react";
import "./styles.css";
import { controlId, controlName } from "@/_components/EditorPage/_components/StyleRail/utils";
import type { RowProps } from "../../types";
import { RowLabel } from "../RowLabel";

export type BooleanRowProps = RowProps & { value: boolean };

export function BooleanRow({ control, value, overridden, onChange, onReset }: BooleanRowProps) {
  const switchId = useId();
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 text-ui-xs" data-control={controlId(control)}>
      <RowLabel control={control} htmlFor={switchId} overridden={overridden} onReset={onReset} />
      <input
        id={switchId}
        type="checkbox"
        role="switch"
        className="canvas-style-toggle"
        aria-label={controlName(control)}
        checked={value}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </div>
  );
}
