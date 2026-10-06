import type {
  InteractiveCanvasDocument,
  InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas";

export type GalleryTile = {
  id: string;
  caption: string;
  label: string;
  document: InteractiveCanvasDocument;
};

export type GalleryGroup = {
  id: string;
  label: string;
  type: InteractiveCanvasObjectType | "connector";
  placement: string;
  tiles: GalleryTile[];
};
