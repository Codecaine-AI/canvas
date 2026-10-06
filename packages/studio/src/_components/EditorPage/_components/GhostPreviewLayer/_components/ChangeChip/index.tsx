import type { ObjectRectChange } from "@/_components/EditorPage/classify-changes";
import { MARK_RADIUS, MARK_WIDTH } from "../../constants";
import { rectStyle } from "../../utils";
import { BADGE_PADDING, BADGE_RADIUS } from "./constants";

export type ChangeChipProps = {
  change: ObjectRectChange;
  label: "new" | "removed";
  color: string;
  /** The badge text color, readable on `color`. */
  onColor: string;
  dashed?: boolean;
};

export function ChangeChip({
  change,
  label,
  color,
  onColor,
  dashed = false,
}: ChangeChipProps) {
  const { rect } = change;
  return (
    <>
      {dashed ? (
        <div
          data-agent-change={label}
          data-agent-object-id={change.id}
          style={{
            ...rectStyle(rect),
            zIndex: 2,
            border: `${MARK_WIDTH} dashed ${color}`,
            borderRadius: MARK_RADIUS,
            background: `color-mix(in srgb, ${color} 7%, transparent)`,
          }}
        />
      ) : null}
      <span
        data-agent-change={`${label}-badge`}
        data-agent-object-id={change.id}
        style={{
          position: "absolute",
          left: `${rect.x + rect.width}px`,
          top: `${rect.y}px`,
          zIndex: 3,
          transform: "translate(-100%, -50%)",
          borderRadius: BADGE_RADIUS,
          background: color,
          color: onColor,
          padding: BADGE_PADDING,
          fontSize: "var(--ds-font-size-ui-2xs)",
          fontWeight: "var(--ds-font-weight-bold)",
          lineHeight: "var(--ds-line-height-tight)",
          letterSpacing: "var(--ds-letter-spacing-normal)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {label}
      </span>
    </>
  );
}
