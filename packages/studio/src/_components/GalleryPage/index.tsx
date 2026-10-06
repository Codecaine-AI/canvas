import { useMemo } from "react";
import type { CanvasStyle } from "@codecaine-ai/canvas/style";
import { OBJECT_TYPES } from "./constants";
import { buildGalleryGroups } from "./utils";
import { useTextMeasureVersion } from "./useTextMeasureVersion";
import { GalleryCard } from "./_components/GalleryCard";

export type GalleryPageProps = {
  /** Workspace style settings (Style rail), so the gallery matches the boards. */
  canvasStyle?: Partial<CanvasStyle>;
};

/** The Object Gallery page's content; the app shell supplies its title and navigation. */
export function GalleryPage({ canvasStyle }: GalleryPageProps) {
  // Tile documents are sized around measured caption bands
  // (belowExtendedBoundsPx): build them again when the measuring backend
  // switches (the bundled fonts finished loading).
  const measureVersion = useTextMeasureVersion();
  const groups = useMemo(() => buildGalleryGroups(), [measureVersion]);
  const objectTypeCount = OBJECT_TYPES.length;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ui-lg text-muted-foreground">
        {objectTypeCount} object types rendered through the real canvas viewer
      </p>

      <div
        className="grid gap-4"
        // A track never wider than the lane, so a narrow window does not scroll sideways.
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))" }}
      >
        {groups.map((group) => (
          <GalleryCard key={group.id} group={group} canvasStyle={canvasStyle} />
        ))}
      </div>

      <style>{`
        .gallery-canvas-viewer > .not-prose {
          margin: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
        }
        .gallery-canvas-viewer > .not-prose > .p-3 {
          padding: 0;
        }
      `}</style>
    </div>
  );
}
