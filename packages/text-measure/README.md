# @codecaine-ai/text-measure

Measure, wrap and fit text the way the browser paints it, without rendering.
Lints, layout engines and renderers in canvas, sequence and docs-system share
this one package, so a label that a lint says fits is a label that fits on screen.

Line breaking is [Pretext](https://github.com/chenglou/pretext) 0.0.9. Widths
come from the active backend: an exact backend shapes with the same fonts the
browser paints with.

## The guarantee and its three conditions

Against headless Chromium, on the committed truth grid (211 strings, Inter
12/13.5/14/16/17.5/24 px at 400/500/600/700, letter-spacing, IBM Plex Mono
13/14 px), the HarfBuzz backend gives the DOM's line count on every covered
string, widths within one Chromium layout unit (1/64 px), and `fitText` never
contradicts the DOM. That holds only when:

1. **The surface paints with a bundled face.** Inter 3.19 static (400, 500,
   600, 700) or IBM Plex Mono 2.5 (400, 500, 600), and the CSS `font-family`
   starts with `Inter` or `IBM Plex Mono`. `system-ui` can never be guaranteed.
2. **Answers near the box edge are read as `borderline`.** `fitText` asks the
   question at `width - tolerance`, `width` and `width + tolerance` (1 px by
   default); when the answers differ the verdict is `borderline`, not
   `fits`/`overflows`.
3. **Every character is covered.** Characters the bundled face lacks (CJK,
   emoji, Arabic, ...) are listed in `uncovered`; the browser paints them with
   per-machine fallback fonts, so their widths are estimates (1em for CJK,
   Chromium's macOS emoji advance for emoji: 1.25-1.3em up to 16px, 1em from
   24px; the face's average letter otherwise) and `reliable` is `false`.

At the box edge the answer follows Chromium's LayoutUnit rule: a line fits
while its width, rounded up to 1/64 px, is at most the box width rounded down
to 1/64 px plus one unit (so text overflowing the box by up to 1/64 px stays
on its line; a box `measureWidth(text) - 1/64` wide still holds it). A line
ending in spaces keeps the kerning of its last glyph with the first space
(Inter Bold kerns `, ` and `. `), in its width and when breaking.

`fitText` also returns `reasons`, why `reliable` is false (empty when it is
true), most fundamental first:

| Reason | When |
|---|---|
| `approximate-backend` | the table backend is active, or `useBrowserFonts` did not load this face |
| `unknown-family` | the first family is not Inter or IBM Plex Mono (measured as Inter) |
| `unsupported-weight` | a weight outside CSS's 1..1000, or one that would make the browser embolden synthetically (impossible with the bundled faces) |
| `oversized-input` | over 16,384 UTF-16 units, or one unbreakable run over 4,096: approximate fast path |
| `uncovered` | characters the bundled face lacks (`uncovered`) |
| `control-characters` | C0/C1 controls (Chromium paints them about 0.33em wide and breaks around them), a form feed, a lone CR in pre-wrap (invisible but it splits kerning), ZWNJ |
| `bidi` | right-to-left text, LRM/RLM/ALM or bidi embedding/isolate controls: lines here are not bidi-reordered |
| `tabs` | a tab in pre-wrap: tab stops and trailing tabs are approximate |
| `soft-hyphen` | a soft hyphen at or next to a line break at the box, -tolerance or +tolerance: Chromium splits without the hyphen when "char + hyphen" does not fit, and can put the hyphen on its own line |

## API

Core entry (`@codecaine-ai/text-measure`): synchronous, runs anywhere, no WASM
and no `node:*` imports. The table backend is active until a host switches.

```ts
interface FontSpec { family: string; size: number; weight?: number; letterSpacing?: number }
interface WrapOptions { maxWidth: number; lineHeight: number; whiteSpace?: "normal" | "pre-wrap" }
interface WrapResult { lines: TextLine[]; lineCount: number; height: number; maxLineWidth: number }
interface FitBox { width: number; lineHeight: number; maxLines?: number; height?: number; whiteSpace?: "normal" | "pre-wrap" }
interface FitResult extends WrapResult {
  verdict: "fits" | "overflows" | "borderline";
  reliable: boolean;     // reasons.length === 0
  reasons: UnreliableReason[];
  uncovered: string[];   // distinct grapheme clusters the bundled face lacks
  backend: "table" | "harfbuzz" | "canvas";
  neededWidth: number;   // natural width for maxLines 1; smallest width for the limit; Infinity if impossible
}

interface TextRun { text: string; font: FontSpec; padStart?: number; padEnd?: number }
interface RunFragment { run: number; text: string; start: number; end: number; x: number; width: number }
interface RunsLine extends TextLine { fragments: RunFragment[] }
interface RunsWrapResult { lines: RunsLine[]; lineCount: number; height: number; maxLineWidth: number }

measureWidth(text: string, font: FontSpec): number
wrapText(text: string, font: FontSpec, opts: WrapOptions): WrapResult
wrapRuns(runs: readonly TextRun[], opts: WrapOptions): RunsWrapResult   // mixed fonts, see "Mixed runs"
fitText(text: string, font: FontSpec, box: FitBox, opts?: { tolerance?: number }): FitResult
uncoveredChars(text: string, family?: string): string[]
fontToCss(font: FontSpec): string                 // "600 17.5px Inter"
activeBackend(): { name: BackendName; exact: boolean }
onBackendChange(listener: () => void): () => void
useTableBackend(): void                           // back to the default (tests, comparisons)
BUNDLED_FACES                                     // { id, family, weight, file }[]
```

- `measureWidth` is the single-line width (`white-space: nowrap`): whitespace
  runs collapse, ends trim, and the whole string is shaped as one run, so
  kerning and ligatures across words count. Letter-spacing is added after
  every grapheme, the last included. Widths are in Chromium layout units
  (1/64 px, rounded up): a box exactly that wide holds the text. Widths are
  never negative (strong negative letter-spacing gives 0, as Chromium's box).
- `wrapText` is Pretext's line breaking (`overflow-wrap: break-word`).
  `TextLine.width` is the whole-run width of the line's visible text (trailing
  spaces excluded).
- Non-zero `letterSpacing` turns ligatures and contextual alternates off, as
  browsers do (Inter's `->` arrow becomes `-` and `>`).
- Break opportunities follow Chromium where Pretext's segmentation differs:
  no break inside letter/number sequences Intl.Segmenter splits (`x²+y²`,
  superscript digits), a break after an en or em dash between digits
  (`10:30–11:45`) and after a `?` followed by a letter or digit (a URL query).
  Letter-spacing skips invisible characters (LRM, RLM, WJ, ZWJ, BOM).
- Weights snap to the face CSS font matching picks (300 -> 400, 450 -> 500,
  620 -> 700, 800/900 -> 700, Plex 700 -> 600). Chromium paints that face as
  is (identical widths and pixels for every weight 1..1000, no synthetic
  bold), so a snapped weight stays reliable. Unknown families are measured as
  Inter and are not reliable.
- White space as Chromium: under pre-wrap a CR or FF is dropped (CR LF is one
  line break, a lone CR or FF makes no line); a paragraph of only zero-width
  spaces or soft hyphens is one line; a zero-width space that starts a line
  keeps it and is a break opportunity after it; preserved spaces at a line end
  hang and never make a box overflow.

Headless entry (`@codecaine-ai/text-measure/headless`, Bun and Node ESM):
`useHarfBuzz(opts?: { cacheEntries?: number }): Promise<void>` loads
harfbuzzjs and `fonts/*.ttf` and switches to whole-run HarfBuzz shaping;
idempotent, concurrent calls share one load. Runs over 16,384 UTF-16 units are
shaped in chunks (kerning across a chunk boundary is lost) and runs over 4,096
are never cached, so one huge string cannot grow the WASM heap or the cache.
`harfBuzzStats()` reports loads, cache occupancy (entries and UTF-16 units)
and the longest single shaping call. Re-exports the core API.

Browser entry (`@codecaine-ai/text-measure/browser`):
`useBrowserFonts(opts?: { fontUrl?, timeoutMs?, throwOnFailure?, faces? }): Promise<{ backend, reason? }>`
loads every bundled woff2 face (or only `faces`: face ids such as
`"inter-600"` or whole families such as `"Inter"`; a later call can add more;
faces not loaded are measured with the table backend and are not reliable, and
`activeBackend().faces` lists the exact ones) (the page's `fonts.css` rules when present,
otherwise `FontFace` objects from `fonts/` next to the module), checks that the
loaded faces measure like the bundled builds, and switches to the native canvas
`measureText`. On failure (no DOM, network error, timeout, another "Inter"
shadowing ours) it resolves with a `reason` and leaves the backend unchanged.
Re-exports the core API.

`@codecaine-ai/text-measure/fonts.css` declares all seven faces;
`@codecaine-ai/text-measure/fonts/*` are the woff2 and TTF files and OFL licenses.

## Mixed runs

`wrapRuns(runs, opts)` lays out a paragraph whose inline children have their
own fonts, the way Chromium lays out a block (`white-space` normal or
pre-wrap, `overflow-wrap: break-word`) holding text nodes, `<strong>` and a
padded `<code>`. Canvas sticky notes paint one markdown line this way.

```ts
const body = { family: "Inter", size: 24 };
const code = { family: "IBM Plex Mono", size: 20.4 }; // .85em of 24px
const pad = 20.4 * 0.15;                               // padding: 0 .15em
const { lines } = wrapRuns(
  [
    { text: "Use ", font: body },
    { text: "fetchUserProfile()", font: code, padStart: pad, padEnd: pad },
    { text: " to load the ", font: body },
    { text: "profile", font: { ...body, weight: 700 } },
  ],
  { maxWidth: 300, lineHeight: 36, whiteSpace: "pre-wrap" },
);
// lines[i].fragments: { run, text, start, end, x, width }, in line order
```

- **Breaks** come from the runs' concatenated text, segmented by Pretext as
  one block: a run boundary is not a break opportunity (`fetch` + `Profile`
  is one word, a comma after a bold run stays with it). `normal` collapses
  whitespace across run boundaries; the kept space belongs to the run of the
  first whitespace character. `pre-wrap` keeps spaces (trailing ones hang)
  and breaks at newlines.
- **Widths.** Each run is measured in its own font with wrapText's
  contextual model. Adjacent runs with an equal font (family list, size,
  weight, letter-spacing) and no padding between them are shaped as one, as
  Chromium does: kerning crosses them and sits on the left run. Nothing
  kerns across a font change. Letter-spacing is per run. Padding is rounded
  down to 1/64 px (Chromium's LayoutUnit) and counts when breaking; a run
  broken across lines carries `padStart` on its first fragment and `padEnd`
  on its last (`box-decoration-break: slice`).
- **Geometry.** `x` and `width` are in 1/64 px layout units, each fragment
  rounded up like a Chromium inline item. Fragments abut, and the line's
  `width` is where the last one ends. Spaces at the end of a line take no
  width; `text` keeps them. `start`/`end` index the run's own text.
- **One run is wrapText.** `wrapRuns([{ text, font }], opts)` gives exactly
  `wrapText(text, font, opts)`'s lines (texts, count, widths), checked on the
  accuracy corpus.

`bun scripts/check-runs.ts` compares it with Chromium: 67 sticky-like rows
(bold, padded code, punctuation, long identifiers, leading, double and
trailing spaces) in body 24px and bold headings 36/30/26.4px, at widths
120..414 step 7, pre-wrap and normal: 23,048 layouts. Lines agree on 23,001.
Of the other 47, 17 flip within 1px of the box width (2 within 1/64 px); the
remaining 30 are tab stops (26) and a line starting inside an arrow (4), both
limits below. Where lines agree, every visible fragment starts within 1/64 px
of the DOM, and line right edges match it within 1/64 px on all but 4 of
70,789 lines.

Limits, shared with wrapText unless marked:

- Where a break-word (emergency) break lands inside a kerned word depends on
  how Chromium reshapes the line ends; it can differ by a grapheme. When the
  library's own line comes out wider than the box, `fitText` answers
  `borderline`. Read answers within about 1px of the edge as borderline.
- wrapRuns only: a run boundary inside one of Inter's arrow clusters (`->`,
  `<=>`, `-->`, ...) gives the whole cluster to the run where it starts and 0
  to the others, as Chromium does.
- Known gaps (`test/chromium-parity.test.ts`, test.failing): Chromium adds no
  letter-spacing to digits joined by U+202F; a zero-width space after a glyph
  wider than the box gets its own line in Chromium; U+3000 hangs at a line end
  and U+2007 does not break in Chromium.
- A line that starts with the second half of a contextual glyph (Inter's
  `->` arrow broken after `-`) keeps its in-context width.
- Tab stops are Pretext's (no half-space minimum). With wrapRuns, fragment
  positions on a line with tabs are approximate.
- wrapRuns only: a run with no laid-out text contributes nothing, not even
  its padding. Padding next to a space that ends a line, and a soft hyphen
  or tab in a second font, are approximate.
- Uncovered characters are estimated as everywhere: call
  `uncoveredChars(run.text, run.font.family)` per run to know when an
  answer is not reliable.

## Backend requests and copies

`useTableBackend()`, `useHarfBuzz()` and `useBrowserFonts()` are requests:
the newest one wins whatever order the loads finish in, and a request that
fails withdraws itself (an older one then applies). The active backend, the
requests and the `onBackendChange` listeners live in one process-wide
registry (`Symbol.for("@codecaine-ai/text-measure/registry@1")`), so every
copy of the package in a process (a bundled core entry plus the headless
entry loaded from node_modules) measures with the same backend and hears the
same switches. A listener that throws is reported with `console.error`; it
never stops the switch or the other listeners.

## Host setup

Bun / Node hosts (MCP servers, CLIs, publish/export), once at startup:

```ts
import { useHarfBuzz, fitText } from "@codecaine-ai/text-measure/headless";

await useHarfBuzz();
fitText(label, { family: "Inter", size: 14, weight: 600 }, { width: 160, lineHeight: 20, maxLines: 2 });
```

Browser hosts (canvas Studio, sequence studio, docs-workbench/viewer):

```ts
import "@codecaine-ai/text-measure/fonts.css";
import { onBackendChange, useBrowserFonts } from "@codecaine-ai/text-measure/browser";

onBackendChange(() => relayout());          // widths change when the fonts arrive
const { backend, reason } = await useBrowserFonts();
if (reason) console.warn(`text-measure stays on ${backend}: ${reason}`);
```

Paint with the same family the measurement used (`fontToCss(font)` gives the
CSS `font` shorthand).

Tests that lint or lay out text, as a preload (bunfig.toml
`preload = ["./happydom.ts", "./text-measure.ts"]`):

```ts
// text-measure.ts
import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";
await useHarfBuzz();
```

happy-dom's globals do not change anything: the table backend stays the
default, `useBrowserFonts` reports that there is no font loading API, and
`useHarfBuzz` works the same.

Import this package before anything else calls Pretext in the process: Pretext
keeps the first measuring context it creates, and text-measure throws rather
than measure through someone else's.

## How it works

- **Binding.** Pretext creates its context once with `new
  OffscreenCanvas(1, 1).getContext("2d")`. On first use text-measure puts a
  shim `OffscreenCanvas` on `globalThis`, triggers that creation, and restores
  the original global (browsers keep their native one). The context Pretext
  keeps parses `ctx.font` and measures through the active backend; every
  backend switch clears Pretext's caches.
- **Contextual widths.** Pretext measures segments (words, spaces, punctuation
  pieces) one by one and adds them up, which misses shaping across segment
  boundaries: Inter's arrows split into `-` and `>`, Inter Bold's `", "` and
  `". "` kerning, kerning across zero-width spaces, and kerning inside long
  words broken by `overflow-wrap`. After `prepareWithSegments` each segment's
  width is replaced by what it adds to the run before it (whole-run shaping),
  and break advances inside long words become prefix differences with each
  pair's kerning on its left grapheme, as Chromium's shaper stores it
  (`src/pretext-context.ts`). This takes the covered edge-sweep disagreements
  from 734 to 0 and the covered line-count mismatches from 15 to 0.
- **Mixed runs.** `src/runs.ts` concatenates and normalizes the runs' text
  with a map back to each run's source; `src/pretext-runs.ts` rewrites the
  prepared widths per shaping group (the contextual model above, plus
  padding and per-run letter-spacing); Pretext breaks the lines and each
  line splits back into run fragments.
- **Backends.** `table`: generated advances for Latin, Greek, Cyrillic and
  common symbols plus ASCII kerning pairs and contextual pairs/triples
  (`src/generated/tables.ts`, 53 KB, 17 KB gzipped); exact on ASCII, off by up
  to ~1 px per string elsewhere (no kerning outside ASCII). `harfbuzz`: shapes
  the bundled TTFs (bounded two-generation LRU, 20,000 runs by default).
  `canvas`: native `measureText`, plus the kerning against spaces and across
  zero-width spaces that Chromium's canvas drops (detected at load) and a
  0.001 px letter-spacing to turn ligatures off when needed.
- **Coverage.** `src/generated/coverage.ts` holds each face's cmap as ranges
  (3.5 KB). A grapheme is uncovered when the face lacks one of its code points
  (format characters aside) or when it is an emoji (VS16, keycap, flag,
  default emoji presentation): browsers paint those with the emoji font.

## Accuracy harness

```sh
cd canvas/packages/text-measure
bun test                              # unit tests + the accuracy guarantee (~8 s)
bun scripts/accuracy-report.ts        # the same numbers, with the worst cases
bun scripts/truth-chromium.ts         # re-record test/accuracy/chromium-truth.json (~4 s)
bun scripts/check-browser.ts          # browser entry in Chromium: loading paths + canvas backend vs DOM
bun scripts/check-runs.ts             # wrapRuns vs Chromium on sticky-note rows (~5 s)
bun scripts/generate-tables.ts        # regenerate src/generated/* from fonts/*.ttf
bun scripts/verify-fonts.ts           # each woff2 is the same build as its TTF
bun scripts/bench.ts                  # 1,000-label timings per backend
```

The truth file records, for each corpus string and font, the DOM single-line
width, the DOM line count at each grid width and at natural width -1, -0.5,
-0.25, -0.1, +0.1, +0.25, +0.5, +1 px. `truth-chromium.ts` also checks that
each TTF and its woff2 measure identically in Chromium. Truth was recorded on
macOS (headless Chromium 153, device scale 1); Chromium on other platforms
uses the same shaper and unhinted woff2 faces, but that has not been measured.

## Pinning policy

`@chenglou/pretext` is 0.0.x with one author, and `src/pretext-binding.ts`,
`src/pretext-context.ts` and `src/pretext-runs.ts` depend on its internals
(the shared measuring context, the prepared arrays; wrapRuns throws rather
than guess when the arrays change shape). Both dependencies are pinned exactly
(`@chenglou/pretext` 0.0.9, `harfbuzzjs` 1.6.2). Bump only after
re-recording the truth (`scripts/truth-chromium.ts`), running
`scripts/check-browser.ts` and `scripts/check-runs.ts`, and passing `bun test`. After changing a font file,
regenerate the tables and the truth; `test/fonts.test.ts` fails until you do.

## Fonts and licenses

`fonts/` is the only copy of the faces. canvas Studio paints with the woff2
files through `@codecaine-ai/text-measure/fonts.css`; the canvas-agent camera
(resvg) and the eval runner read `fonts/*.ttf` through the package's
`./fonts/*` export. Inter is OFL-1.1 (`fonts/OFL-Inter.txt`), IBM Plex Mono is
OFL-1.1 (`fonts/OFL-IBMPlexMono.txt`).
