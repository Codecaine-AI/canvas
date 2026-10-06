import {
  OBJECT_TYPE_DEFAULTS,
  type InteractiveCanvasObject,
  type InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas";

export const OBJECT_TYPES = Object.keys(OBJECT_TYPE_DEFAULTS) as InteractiveCanvasObjectType[];

export const GALLERY_MARGIN = 48;
export const BONUS_GAP = 56;
export const CONNECTOR_GAP = 96;

export const LONG_LABEL_TEXT = "Adapt Question\nBased on Interview\nHistory";
export const LONG_SECTION_TITLE = "Adapt Question Based on Interview History";
export const LONG_STICKY_TEXT = "# Heading\n- bullet one\n- bullet two\n**bold** text";
export const RETIRED_ICON_GALLERY_VARIANTS = [
  { glyph: "human", label: "human" },
  { glyph: "message", label: "message" },
  { glyph: "model", label: "model" },
] as const satisfies readonly { glyph: NonNullable<InteractiveCanvasObject["icon"]>; label: string }[];
