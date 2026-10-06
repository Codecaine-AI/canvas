import "./styles.css";
import type { RowProps } from "./types";
import { BooleanRow } from "./_components/BooleanRow";
import { ColorRow } from "./_components/ColorRow";
import { NumberRow } from "./_components/NumberRow";
import { SelectRow } from "./_components/SelectRow";

export type ControlRowProps = RowProps & { inactiveNote?: string };

export function ControlRow({ inactiveNote: note, ...props }: ControlRowProps) {
  const row = (() => {
    switch (props.control.kind) {
      case "number":
        return <NumberRow {...props} value={Number(props.value)} />;
      case "color":
        return <ColorRow {...props} value={String(props.value)} />;
      case "select":
        return <SelectRow {...props} value={String(props.value)} />;
      case "boolean":
        return <BooleanRow {...props} value={props.value === true} />;
    }
  })();
  if (!note) return row;
  return (
    <div className="canvas-style-rail-inactive-row" data-inactive="true">
      {row}
      <p className="canvas-style-rail-inactive-note">{note}</p>
    </div>
  );
}
