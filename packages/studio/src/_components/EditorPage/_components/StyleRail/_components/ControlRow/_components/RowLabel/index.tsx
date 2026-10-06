import type { CanvasStyleControl } from "@codecaine-ai/canvas/style";
import "./styles.css";
import { controlName } from "@/_components/EditorPage/_components/StyleRail/utils";

export type RowLabelProps = {
  control: CanvasStyleControl;
  htmlFor?: string;
  overridden: boolean;
  onReset(): void;
};

/** The override dot: a reset button while the token is overridden, a hollow marker otherwise. */
export function RowLabel({ control, htmlFor, overridden, onReset }: RowLabelProps) {
  return (
    <span className="canvas-style-rail-row-label" title={control.description}>
      {overridden ? (
        <button
          type="button"
          className="canvas-style-rail-row-override-dot"
          data-overridden="true"
          aria-label={`Reset ${controlName(control)} to the theme default`}
          title="Reset to theme default"
          onClick={onReset}
        />
      ) : (
        <span aria-hidden="true" className="canvas-style-rail-row-override-dot" data-overridden="false" />
      )}
      {htmlFor ? (
        <label htmlFor={htmlFor} className="truncate">
          {control.label}
        </label>
      ) : (
        <span className="truncate">{control.label}</span>
      )}
    </span>
  );
}
