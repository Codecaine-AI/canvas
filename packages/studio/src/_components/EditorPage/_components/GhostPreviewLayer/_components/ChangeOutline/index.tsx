import type { MovedChange } from "@/_components/EditorPage/classify-changes";
import { MARK_RADIUS, MARK_WIDTH } from "../../constants";
import { rectStyle } from "../../utils";

export type ChangeOutlineProps = {
  change: MovedChange;
  color: string;
  /** The board surface, for the veil over the old place. */
  surface: string;
  className: string;
};

export function ChangeOutline({
  change,
  color,
  surface,
  className,
}: ChangeOutlineProps) {
  return (
    <>
      <div
        data-agent-change={className}
        data-agent-object-id={change.id}
        style={{
          ...rectStyle(change.from),
          zIndex: 2,
          border: `${MARK_WIDTH} dashed ${color}`,
          borderRadius: MARK_RADIUS,
          background: `color-mix(in srgb, ${surface} 16%, transparent)`,
        }}
      />
      <div
        data-agent-change={`${className}-destination`}
        data-agent-object-id={change.id}
        style={{
          ...rectStyle(change.to),
          zIndex: 2,
          border: `var(--ds-border-width-hairline) solid ${color}`,
          borderRadius: MARK_RADIUS,
          background: `color-mix(in srgb, ${color} 13%, transparent)`,
        }}
      />
    </>
  );
}
