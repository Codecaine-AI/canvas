import {
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
import { withRootPageFrame } from "@/shared/new-document";
import {
  BONUS_GAP,
  CONNECTOR_GAP,
  GALLERY_MARGIN,
  LONG_LABEL_TEXT,
  LONG_SECTION_TITLE,
  LONG_STICKY_TEXT,
  OBJECT_TYPES,
  RETIRED_ICON_GALLERY_VARIANTS,
} from "./constants";
import type { GalleryGroup, GalleryTile } from "./types";

export function buildGalleryGroups(): GalleryGroup[] {
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
    ...(type === "icon" ? { icon: options?.icon ?? "config" } : null),
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
