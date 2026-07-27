/**
 * Context sidecar for the layout-editor agent: five blocks, one per custom
 * loader registered in service/kernel.ts —
 *
 *   <editor_state>   invoke-time editor snapshot (selection, viewport, scope
 *                    frame) via the `editor-state` loader
 *   <user_requests>  the read-only queue of user comments/requests
 *                    (annotations) rendered from sessionData.userRequests
 *                    via the `user-requests` loader
 *   <capabilities>   the static op reference + vocabulary rosters (generated
 *                    from the validator's schema tables) plus hand-written
 *                    kind semantics, via the `capabilities` loader
 *   <style_guide>    ALL style topics from src/agent/styles/, concatenated by
 *                    the static `style-guide` loader
 *   <board_state>    the spawn-time board snapshot (digest + lint report)
 *                    rendered by the `board-state` loader from
 *                    sessionData.boardState, with a fallback line when absent
 *
 * Boot images ride alongside the text: the image hook returns the spawn-time
 * renders the session store places at `sessionData.bootImages` — the current
 * full-board view first, the house-style exemplar second, and the live object
 * vocabulary contact sheet third. Missing payloads are skipped, so a failed
 * render degrades to text-only without failing the spawn. When any image is
 * delivered, assemble() appends a one-line caption after the tagged blocks
 * naming each attached image in delivery order; both hooks share the same
 * presence check, so captions and images always match.
 */
import type {
  AgentContextResolver,
  ContextImage,
  LoadedMap,
  SpawnContext,
} from "@agent-kernel/kernel/context";
import { defineContext } from "@agent-kernel/kernel/agent-definition";

const loaders: AgentContextResolver["loaders"] = [
  { kind: "editor-state" },
  { kind: "user-requests" },
  { kind: "capabilities" },
  { kind: "style-guide" },
  { kind: "board-state" },
];

/** Loader kind → context block tag. */
const BLOCK_TAGS: Record<string, string> = {
  "editor-state": "editor_state",
  "user-requests": "user_requests",
  "capabilities": "capabilities",
  "style-guide": "style_guide",
  "board-state": "board_state",
};

/** sessionData.bootImages keys, in the order the images are delivered. */
const BOOT_IMAGE_KEYS = ["board", "exemplar", "contactSheet"] as const;
type BootImageKey = (typeof BOOT_IMAGE_KEYS)[number];

/** Caption per boot image, used in the trailing "images attached" line. */
const BOOT_IMAGE_CAPTIONS: Record<BootImageKey, string> = {
  board: "the current full-board render",
  exemplar: "a finished board in the house style — a taste reference, not this board",
  contactSheet:
    "the board vocabulary — every object type, icon glyph, and color rendered and labeled, plus the connection arrows and styles; the visual reference for everything the board can draw",
};

/**
 * The bootImages keys carrying a non-empty payload, in delivery order. Both
 * assemble() (captions) and assembleImages() (payloads) go through this, so
 * the caption line and the delivered images cannot disagree.
 */
function presentBootImageKeys(ctx: SpawnContext): BootImageKey[] {
  const bootImages = ctx.sessionData?.bootImages;
  if (bootImages === null || typeof bootImages !== "object") return [];
  const record = bootImages as Record<string, unknown>;
  return BOOT_IMAGE_KEYS.filter((key) => {
    const data = record[key];
    return typeof data === "string" && data.length > 0;
  });
}

function assemble(loaded: LoadedMap, ctx: SpawnContext): string {
  const blocks = loaded
    .map((input) => {
      const tag = BLOCK_TAGS[input.decl.kind] ?? input.decl.kind;
      const body = input.content.length > 0
        ? input.content
            .split("\n")
            .map((line) => (line.length > 0 ? `    ${line}` : line))
        : [];
      return [`<${tag}>`, ...body, `</${tag}>`].join("\n");
    })
    .join("\n\n");
  const present = presentBootImageKeys(ctx);
  if (present.length === 0) return blocks;
  const caption = `images attached: ${present
    .map((key, i) => `(${i + 1}) ${BOOT_IMAGE_CAPTIONS[key]}`)
    .join(", ")}`;
  return `${blocks}\n\n${caption}`;
}

function assembleImages(
  _loaded: LoadedMap,
  ctx: SpawnContext,
): ReadonlyArray<ContextImage> {
  const record = ctx.sessionData?.bootImages as Record<string, unknown> | undefined;
  return presentBootImageKeys(ctx).map((key) => ({
    data: record![key] as string,
    mimeType: "image/png",
  }));
}

export const context = defineContext({ loaders, assemble, assembleImages });
export default context;
