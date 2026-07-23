import { useMemo } from "react";
import {
  InteractiveCanvasViewer,
  OBJECT_TYPE_DEFAULTS,
  belowExtendedBoundsPx,
  objectDefForType,
  objectTypeDefaults,
  textPlacementName,
  type CanvasGeometry,
  type InteractiveCanvasConnection,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
  type InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas";
import { Badge } from "@codecaine-ai/canvas/ui/badge";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { ArrowLeftIcon, ShapesIcon } from "@codecaine-ai/canvas/ui/icons";
import { withRootPageFrame } from "./new-document";

type GalleryPageProps = {
  onBack: () => void;
};

type GalleryTile = {
  id: string;
  caption: string;
  label: string;
  document: InteractiveCanvasDocument;
};

type GalleryGroup = {
  id: string;
  label: string;
  type: InteractiveCanvasObjectType | "connector";
  placement: string;
  tiles: GalleryTile[];
};

const OBJECT_TYPES = Object.keys(OBJECT_TYPE_DEFAULTS) as InteractiveCanvasObjectType[];

const GALLERY_MARGIN = 48;
const BONUS_GAP = 56;
const CONNECTOR_GAP = 96;

const LONG_LABEL_TEXT = "Adapt Question\nBased on Interview\nHistory";
const LONG_SECTION_TITLE = "Adapt Question Based on Interview History";
const LONG_STICKY_TEXT = "# Heading\n- bullet one\n- bullet two\n**bold** text";
const RETIRED_ICON_GALLERY_VARIANTS = [
  { glyph: "person", label: "person" },
  { glyph: "chat", label: "chat" },
  { glyph: "cpu", label: "cpu" },
] as const satisfies readonly { glyph: NonNullable<InteractiveCanvasObject["icon"]>; label: string }[];

export function GalleryPage({ onBack }: GalleryPageProps) {
  const groups = useMemo(() => buildGalleryGroups(), []);
  const objectTypeCount = OBJECT_TYPES.length;

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <ShapesIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              Object Gallery
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {objectTypeCount} object types rendered through the real canvas viewer
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeftIcon className="h-4 w-4" />
          Back to boards
        </Button>
      </header>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
      >
        {groups.map((group) => (
          <article
            key={group.id}
            className="flex flex-col gap-3 rounded-md border border-border bg-card p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{group.label}</h2>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {group.type}
                </p>
              </div>
              <Badge variant="outline">{group.placement}</Badge>
            </div>

            <div className="grid gap-3">
              {group.tiles.map((tile) => (
                <section key={tile.id} className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                      {tile.caption}
                    </span>
                    <Badge variant="ghost">{tile.label}</Badge>
                  </div>
                  <InteractiveCanvasViewer
                    document={tile.document}
                    compact
                    className="gallery-canvas-viewer"
                  />
                </section>
              ))}
            </div>
          </article>
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

function buildGalleryGroups(): GalleryGroup[] {
  return [...OBJECT_TYPES.map(buildObjectGroup), buildConnectorGroup()];
}

function buildObjectGroup(type: InteractiveCanvasObjectType): GalleryGroup {
  const defaults = objectTypeDefaults(type);
  const def = objectDefForType(type);
  const placement = def?.textSlot ? textPlacementName(def.textSlot.placement) : "no text";
  const caption = `${type} — ${placement}`;

  if (!def?.textSlot) {
    return {
      id: type,
      label: defaults.label,
      type,
      placement,
      tiles: [
        {
          id: `${type}-no-text`,
          caption,
          label: "no text slot",
          document: makeSingleObjectDocument(type, "", "no-text"),
        },
      ],
    };
  }

  const tiles: GalleryTile[] = [
    {
      id: `${type}-short`,
      caption,
      label: "short",
      document: makeSingleObjectDocument(type, textForVariant(type, "short"), "short"),
    },
    {
      id: `${type}-long`,
      caption,
      label: "long",
      document: placement === "below"
        ? makeBelowLongDocument(type, textForVariant(type, "long"))
        : makeSingleObjectDocument(type, textForVariant(type, "long"), "long"),
    },
  ];

  if (type === "icon") {
    for (const variant of RETIRED_ICON_GALLERY_VARIANTS) {
      tiles.push({
        id: `${type}-${variant.glyph}`,
        caption: `${type} — ${variant.glyph}`,
        label: variant.label,
        document: makeSingleObjectDocument(type, variant.label, `glyph-${variant.glyph}`, {
          icon: variant.glyph,
        }),
      });
    }
  }

  return {
    id: type,
    label: defaults.label,
    type,
    placement,
    tiles,
  };
}

function buildConnectorGroup(): GalleryGroup {
  return {
    id: "connector",
    label: "Connector",
    type: "connector",
    placement: "routed-midpoint",
    tiles: [
      {
        id: "connector-labeled",
        caption: "connector — routed-midpoint",
        label: "labeled",
        document: makeConnectorDocument(),
      },
    ],
  };
}

function textForVariant(
  type: InteractiveCanvasObjectType,
  variant: "short" | "long",
): string {
  if (variant === "short") {
    return "Label";
  }
  if (type === "sticky") return LONG_STICKY_TEXT;
  if (type === "section") return LONG_SECTION_TITLE;
  return LONG_LABEL_TEXT;
}

function makeSingleObjectDocument(
  type: InteractiveCanvasObjectType,
  text: string,
  variant: string,
  options?: { icon?: InteractiveCanvasObject["icon"] },
): InteractiveCanvasDocument {
  const object = makeGalleryObject(type, text, `${type}-${variant}`, {
    x: GALLERY_MARGIN,
    y: GALLERY_MARGIN,
  }, options);

  return makeDocument({
    id: `gallery-${type}-${variant}`,
    title: `${objectTypeDefaults(type).label}: ${variant}`,
    objects: [object],
    connections: [],
  });
}

function makeBelowLongDocument(
  type: InteractiveCanvasObjectType,
  text: string,
): InteractiveCanvasDocument {
  const mainDefaults = objectTypeDefaults(type);
  const longObject = makeGalleryObject(type, text, `${type}-long`, {
    x: GALLERY_MARGIN,
    y: GALLERY_MARGIN,
  });
  const main = longObject;
  const mainBounds = belowExtendedBoundsPx(main);

  const processDefaults = objectTypeDefaults("process");
  const processX =
    GALLERY_MARGIN + Math.max(0, (main.geometry.width - processDefaults.geometry.width) / 2);
  const process = makeGalleryObject("process", "Next", `${type}-target`, {
    x: processX,
    y: main.geometry.y + mainBounds.y + mainBounds.height + BONUS_GAP,
  });

  return makeDocument({
    id: `gallery-${type}-long-below-connector`,
    title: `${mainDefaults.label}: long`,
    objects: [main, process],
    connections: [
      {
        id: `${main.id}-to-${process.id}`,
        from: { objectId: main.id, anchor: "bottom" },
        to: { objectId: process.id, anchor: "top" },
        style: "solid",
        arrow: "forward",
      },
    ],
  });
}

function makeConnectorDocument(): InteractiveCanvasDocument {
  const processDefaults = objectTypeDefaults("process");
  const left = makeGalleryObject("process", "Source", "connector-source", {
    x: GALLERY_MARGIN,
    y: GALLERY_MARGIN,
  });
  const right = makeGalleryObject("process", "Target", "connector-target", {
    x: GALLERY_MARGIN + processDefaults.geometry.width + CONNECTOR_GAP,
    y: GALLERY_MARGIN,
  });

  return makeDocument({
    id: "gallery-connector-labeled",
    title: "Connector: labeled",
    objects: [left, right],
    connections: [
      {
        id: "connector-source-to-target",
        from: { objectId: left.id, anchor: "right" },
        to: { objectId: right.id, anchor: "left" },
        style: "solid",
        arrow: "forward",
        label: "connects",
      },
    ],
  });
}

function makeGalleryObject(
  type: InteractiveCanvasObjectType,
  text: string,
  id: string,
  geometryOverrides: Partial<CanvasGeometry>,
  options?: { icon?: InteractiveCanvasObject["icon"] },
): InteractiveCanvasObject {
  const defaults = objectTypeDefaults(type);
  return {
    id,
    type,
    text,
    geometry: {
      x: geometryOverrides.x ?? GALLERY_MARGIN,
      y: geometryOverrides.y ?? GALLERY_MARGIN,
      width: geometryOverrides.width ?? defaults.geometry.width,
      height: geometryOverrides.height ?? defaults.geometry.height,
    },
    style: { shape: defaults.shape },
    ...(type === "icon" ? { icon: options?.icon ?? "gear" } : null),
    ...(type === "section" ? { layout: { mode: "free" as const, padding: 32, gap: 24 } } : null),
  };
}

function makeDocument(input: {
  id: string;
  title: string;
  objects: InteractiveCanvasObject[];
  connections: InteractiveCanvasConnection[];
}): InteractiveCanvasDocument {
  return withRootPageFrame({
    schemaVersion: 1,
    id: input.id,
    title: input.title,
    mode: "diagram",
    size: sizeForObjects(input.objects),
    viewport: { x: 0, y: 0, zoom: 1 },
    objects: input.objects,
    connections: input.connections,
    annotations: [],
  });
}

function sizeForObjects(objects: InteractiveCanvasObject[]): { width: number; height: number } {
  const maxRight = Math.max(
    ...objects.map((object) => {
      const bounds = belowExtendedBoundsPx(object);
      return object.geometry.x + bounds.x + bounds.width;
    }),
  );
  const maxBottom = Math.max(
    ...objects.map((object) => {
      const bounds = belowExtendedBoundsPx(object);
      return object.geometry.y + bounds.y + bounds.height;
    }),
  );
  return {
    width: Math.ceil(maxRight + GALLERY_MARGIN),
    height: Math.ceil(maxBottom + GALLERY_MARGIN),
  };
}
