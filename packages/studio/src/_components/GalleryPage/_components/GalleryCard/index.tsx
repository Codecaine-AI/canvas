import { InteractiveCanvasViewer } from "@codecaine-ai/canvas";
import { Badge } from "@codecaine-ai/canvas/ui/badge";
import type { CanvasStyle } from "@codecaine-ai/canvas/style";
import type { GalleryGroup } from "../../types";

export type GalleryCardProps = {
  group: GalleryGroup;
  canvasStyle?: Partial<CanvasStyle>;
};

export function GalleryCard({ group, canvasStyle }: GalleryCardProps) {
  return (
    <article className="flex min-w-0 flex-col gap-3 overflow-hidden rounded border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-ui-lg font-semibold text-ink">{group.label}</h2>
          <p className="mt-1 truncate font-mono text-ui-2xs text-muted-foreground">
            {group.type}
          </p>
        </div>
        {/* Shrinks (and clips) only when the card is narrower than its title and badge. */}
        <Badge variant="outline" className="min-w-0 shrink">{group.placement}</Badge>
      </div>

      <div className="grid gap-3">
        {group.tiles.map((tile) => (
          <section key={tile.id} className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-ui-2xs text-muted-foreground">
                {tile.caption}
              </span>
              <Badge variant="ghost">{tile.label}</Badge>
            </div>
            <InteractiveCanvasViewer
              document={tile.document}
              compact
              className="gallery-canvas-viewer"
              canvasStyle={canvasStyle}
            />
          </section>
        ))}
      </div>
    </article>
  );
}
