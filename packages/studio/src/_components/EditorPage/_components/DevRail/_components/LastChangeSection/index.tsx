import type { InteractiveCanvasEditorState } from "@codecaine-ai/canvas";
import { Empty } from "../Empty";
import { MonoLine } from "../MonoLine";
import { Section } from "../Section";

export type LastChangeSectionProps = {
  lastChange: InteractiveCanvasEditorState["lastChange"] | undefined;
};

export function LastChangeSection({ lastChange }: LastChangeSectionProps) {
  return (
    <Section title="Last change">
      {lastChange ? (
        <div className="flex flex-col gap-1">
          <MonoLine>
            source · {lastChange.source}
            {lastChange.summary ? ` · ${lastChange.summary}` : ""}
          </MonoLine>
          <MonoLine>
            objects {lastChange.changedObjectIds.length} · connections{" "}
            {lastChange.changedConnectionIds.length} · annotations{" "}
            {lastChange.changedAnnotationIds.length}
          </MonoLine>
          {lastChange.changedObjectIds.length > 0 ? (
            <MonoLine>{lastChange.changedObjectIds.join(", ")}</MonoLine>
          ) : null}
        </div>
      ) : (
        <Empty>No changes yet.</Empty>
      )}
    </Section>
  );
}
