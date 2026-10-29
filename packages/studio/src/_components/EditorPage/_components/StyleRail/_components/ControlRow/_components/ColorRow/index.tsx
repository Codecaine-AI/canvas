import { useId, useState } from "react";
import { formatColor, formatHex, normalizeColor, parseColor } from "@codecaine-ai/canvas";
import "./styles.css";
import { controlId, controlName } from "@/_components/EditorPage/_components/StyleRail/utils";
import type { RowProps } from "../../types";
import { RowLabel } from "../RowLabel";

export type ColorRowProps = RowProps & { value: string };

export function ColorRow({ control, value, overridden, onChange, onReset }: ColorRowProps) {
  const textId = useId();
  // While focused the field shows what is typed; each valid color applies at
  // once, and leaving the field shows the stored (canonical) value again.
  const [draft, setDraft] = useState<string | null>(null);
  const parsed = parseColor(value);
  const shown = draft ?? value.replace(/\s+/g, "");
  const invalid = draft !== null && normalizeColor(draft) === null;
  const name = controlName(control);
  return (
    <div className="flex min-h-7 items-center justify-between gap-2 text-ui-xs" data-control={controlId(control)}>
      <RowLabel control={control} htmlFor={textId} overridden={overridden} onReset={onReset} />
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="canvas-style-swatch" title="Pick a color">
          <span className="canvas-style-swatch-fill" style={{ background: value }} />
          {/* A color the picker cannot read gets no picker: the text field fixes it. */}
          {parsed ? (
            <input
              type="color"
              aria-label={`${name} picker`}
              value={formatHex(parsed).toLowerCase()}
              onChange={(event) => {
                const picked = parseColor(event.currentTarget.value);
                // The native picker has no alpha: keep the token's own.
                if (picked) onChange(formatColor({ ...picked, a: parsed.a }));
              }}
            />
          ) : null}
        </span>
        <input
          id={textId}
          type="text"
          className="canvas-style-color-text"
          aria-label={name}
          aria-invalid={invalid || undefined}
          spellCheck={false}
          autoComplete="off"
          value={shown}
          onFocus={() => setDraft(shown)}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setDraft(text);
            const color = normalizeColor(text);
            if (color) onChange(color);
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </span>
    </div>
  );
}
