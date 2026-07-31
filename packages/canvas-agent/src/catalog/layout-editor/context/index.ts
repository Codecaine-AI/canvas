/**
 * Section ② — the complete inventory of the layout-editor's standing context.
 *
 * Section ② is REFERENCE: what should be visible on every request and does not
 * move while the agent works. Everything the agent always sees is declared
 * here, and every declaration has a file next to this one:
 *
 *   <capabilities>   ./capabilities/    the static op reference + vocabulary
 *                    rosters (generated from the validator's schema tables)
 *                    plus hand-written kind semantics; served by the
 *                    `capabilities` loader
 *   <state_grammar>  ./state-grammar/   the reading key for the bare-value
 *                    state blocks and tool results, quoting its line grammars
 *                    from board/digest.ts and the lint registry; served by
 *                    the `state-grammar` loader
 *   <style_guide>    ./style-guide/     the authored craft topics and craft
 *                    targets; served by the static `style-guide` loader
 *   image 1          ./exemplar.ts      the house-style exemplar board
 *   image 2          ./contact-sheet.ts the object-vocabulary contact sheet
 *
 * The two loaders are registered app-side in service/kernel.ts; the two images
 * are spawn-rendered by the harness (service/session/boot.ts) and travel on
 * `sessionData.bootImages`. In both cases the bundle owns the DECLARATION —
 * which block, which tag, which key, what the model is told it is — while the
 * machinery that produces the bytes stays in src/ where any agent could run it
 * (state-shapes.html §6, "recipes").
 *
 * The working picture — the board digest, the editor snapshot, the request
 * queue and the current full-board render — used to be three more loaders and
 * a third boot image here. They are section ③ now: ../state/ seeds from the
 * same sessionData they read and re-renders them on every request, so they can
 * never go stale mid-run (state-shapes.html §5, D93/D82/D84).
 *
 * Missing image payloads are skipped, so a failed render degrades to text-only
 * without failing the spawn. When any image is delivered, assemble() appends a
 * one-line caption after the tagged blocks naming each attached image in
 * delivery order; both hooks share the same presence check, so captions and
 * images always match.
 */
import type {
  AgentContextResolver,
  ContextImage,
  LoadedMap,
  SpawnContext,
} from "@agent-kernel/kernel/context";
import { defineContext } from "@agent-kernel/kernel/agent-definition";

import { contactSheet } from "./contact-sheet";
import { exemplar } from "./exemplar";

/**
 * A spawn-rendered reference image, declared by the bundle and produced by the
 * harness: which `sessionData.bootImages` key carries the payload, what the
 * caption line calls it, and what the payload is.
 */
export interface BootImageDeclaration {
  /** The `sessionData.bootImages` key carrying the base64 payload. */
  key: string;
  /** MIME type of the delivered payload. */
  mimeType: string;
  /** The one-line description used in the trailing "images attached" line. */
  caption: string;
}

/**
 * The text blocks of ②, in the order they appear in the context message: one
 * loader per block, and one folder in this directory per loader.
 */
const TEXT_BLOCKS: ReadonlyArray<{ kind: string; tag: string }> = [
  { kind: "capabilities", tag: "capabilities" },
  { kind: "state-grammar", tag: "state_grammar" },
  { kind: "style-guide", tag: "style_guide" },
];

/** The reference images of ②, in the order they are delivered. */
const BOOT_IMAGES: ReadonlyArray<BootImageDeclaration> = [exemplar, contactSheet];

const loaders: AgentContextResolver["loaders"] = TEXT_BLOCKS.map(({ kind }) => ({ kind }));

/** Loader kind → context block tag. */
const BLOCK_TAGS: Record<string, string> = Object.fromEntries(
  TEXT_BLOCKS.map(({ kind, tag }) => [kind, tag]),
);

/**
 * The declared images carrying a non-empty payload, in delivery order. Both
 * assemble() (captions) and assembleImages() (payloads) go through this, so
 * the caption line and the delivered images cannot disagree.
 */
function presentBootImages(ctx: SpawnContext): BootImageDeclaration[] {
  const bootImages = ctx.sessionData?.bootImages;
  if (bootImages === null || typeof bootImages !== "object") return [];
  const record = bootImages as Record<string, unknown>;
  return BOOT_IMAGES.filter((image) => {
    const data = record[image.key];
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
  const present = presentBootImages(ctx);
  if (present.length === 0) return blocks;
  const caption = `images attached: ${present
    .map((image, i) => `(${i + 1}) ${image.caption}`)
    .join(", ")}`;
  return `${blocks}\n\n${caption}`;
}

function assembleImages(
  _loaded: LoadedMap,
  ctx: SpawnContext,
): ReadonlyArray<ContextImage> {
  const record = ctx.sessionData?.bootImages as Record<string, unknown> | undefined;
  return presentBootImages(ctx).map((image) => ({
    data: record![image.key] as string,
    mimeType: image.mimeType,
  }));
}

export const context = defineContext({ loaders, assemble, assembleImages });
export default context;
