import type { CanvasSelection, InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import type { Rect } from "../../types";
import { formatNumber } from "../../utils";
import { Empty } from "../Empty";
import { MonoLine } from "../MonoLine";
import { Section } from "../Section";

export type SelectionSectionProps = {
  selection: CanvasSelection;
  selectedObjects: InteractiveCanvasDocument["objects"];
  selectionBounds: Rect | null;
};

export function SelectionSection({
  selection,
  selectedObjects,
  selectionBounds,
}: SelectionSectionProps) {
  return (
    <Section title="Selection">
      {selection.kind === "objects" && selectedObjects.length > 0 ? (
        <div className="flex flex-col gap-1">
          {selectedObjects.map((object) => (
            <MonoLine key={object.id}>
              {object.id} · {object.type} · x {formatNumber(object.geometry.x)} y{" "}
              {formatNumber(object.geometry.y)} w {formatNumber(object.geometry.width)} h{" "}
              {formatNumber(object.geometry.height)}
            </MonoLine>
          ))}
          {selectionBounds ? (
            <MonoLine>
              bbox · x {formatNumber(selectionBounds.x)} y {formatNumber(selectionBounds.y)} w{" "}
              {formatNumber(selectionBounds.width)} h {formatNumber(selectionBounds.height)}
            </MonoLine>
          ) : null}
        </div>
      ) : selection.kind === "connection" ? (
        <MonoLine>connection · {selection.connectionId}</MonoLine>
      ) : selection.kind === "annotation" ? (
        <MonoLine>annotation · {selection.annotationId}</MonoLine>
      ) : selection.kind === "region" ? (
        <MonoLine>
          region · x {formatNumber(selection.region.x)} y {formatNumber(selection.region.y)} w{" "}
          {formatNumber(selection.region.width)} h {formatNumber(selection.region.height)}
        </MonoLine>
      ) : (
        <Empty>Nothing selected.</Empty>
      )}
    </Section>
  );
}
