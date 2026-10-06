import type { InteractiveCanvasEditorState } from "@codecaine-ai/canvas";
import { formatNumber } from "../../utils";
import { Empty } from "../Empty";
import { MonoLine } from "../MonoLine";
import { Section } from "../Section";

export type ViewportSectionProps = {
  viewport: InteractiveCanvasEditorState["viewport"] | null;
};

export function ViewportSection({ viewport }: ViewportSectionProps) {
  return (
    <Section title="Viewport">
      {viewport ? (
        <MonoLine>
          x {formatNumber(viewport.x)} · y {formatNumber(viewport.y)} · zoom{" "}
          {viewport.zoom.toFixed(2)}
        </MonoLine>
      ) : (
        <Empty>No viewport yet.</Empty>
      )}
    </Section>
  );
}
