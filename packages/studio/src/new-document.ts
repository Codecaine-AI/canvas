import type {
  CanvasGeometry,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas";

export const ROOT_PAGE_FRAME_ID = "page-frame";

const PAGE_FRAME_MARGIN = 32;
const DEFAULT_DOCUMENT_SIZE = { width: 1200, height: 720 } as const;

function isRootPageFrame(object: InteractiveCanvasObject): boolean {
  return (
    object.type === "section" &&
    object.locked === "background" &&
    object.parentId == null
  );
}

function pageFrameGeometry(
  document: InteractiveCanvasDocument,
  objects: readonly InteractiveCanvasObject[],
): CanvasGeometry {
  const size = document.size ?? DEFAULT_DOCUMENT_SIZE;
  const content = objects.filter((object) => !isRootPageFrame(object));
  const minX = content.length > 0
    ? Math.min(...content.map((object) => object.geometry.x))
    : PAGE_FRAME_MARGIN * 2;
  const minY = content.length > 0
    ? Math.min(...content.map((object) => object.geometry.y))
    : PAGE_FRAME_MARGIN * 2;
  const maxRight = content.length > 0
    ? Math.max(...content.map((object) => object.geometry.x + object.geometry.width))
    : size.width - PAGE_FRAME_MARGIN * 2;
  const maxBottom = content.length > 0
    ? Math.max(...content.map((object) => object.geometry.y + object.geometry.height))
    : size.height - PAGE_FRAME_MARGIN * 2;

  const x = Math.min(PAGE_FRAME_MARGIN, minX - PAGE_FRAME_MARGIN);
  const y = Math.min(PAGE_FRAME_MARGIN, minY - PAGE_FRAME_MARGIN);
  const right = Math.max(
    x + 1,
    size.width - PAGE_FRAME_MARGIN,
    maxRight + PAGE_FRAME_MARGIN,
  );
  const bottom = Math.max(
    y + 1,
    size.height - PAGE_FRAME_MARGIN,
    maxBottom + PAGE_FRAME_MARGIN,
  );

  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Adds the one background section that owns every otherwise top-level object.
 * Existing background frames are preserved so loaded project boards remain
 * stable across repeated save-adapter passes.
 */
export function withRootPageFrame(
  document: InteractiveCanvasDocument,
): InteractiveCanvasDocument {
  const size = document.size ?? DEFAULT_DOCUMENT_SIZE;
  const existingFrame = document.objects.find(isRootPageFrame);
  const frame: InteractiveCanvasObject = existingFrame ?? {
    id: ROOT_PAGE_FRAME_ID,
    type: "section",
    text: document.title ?? document.id,
    color: "white",
    parentId: null,
    geometry: pageFrameGeometry(document, document.objects),
    style: { shape: "section" },
    locked: "background",
  };

  const objects = [
    frame,
    ...document.objects
      .filter((object) => object !== existingFrame)
      .map((object) =>
        object.parentId == null ? { ...object, parentId: frame.id } : object,
      ),
  ];
  const frameRight = frame.geometry.x + frame.geometry.width;
  const frameBottom = frame.geometry.y + frame.geometry.height;

  return {
    ...document,
    size: {
      width: Math.max(size.width, Math.ceil(frameRight + PAGE_FRAME_MARGIN)),
      height: Math.max(size.height, Math.ceil(frameBottom + PAGE_FRAME_MARGIN)),
    },
    objects,
  };
}
