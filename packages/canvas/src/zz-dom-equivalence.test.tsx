/**
 * zz-dom-equivalence — DOM-equivalence gate for the registry refactor.
 *
 * When packages/canvas/zz-dom-baseline.json exists (captured via
 * `bun packages/canvas/zz-dom-capture.ts packages/canvas/zz-dom-baseline.json`),
 * this test re-renders the full corpus with the CURRENT code and compares
 * against the baseline:
 *   - HTML outside the single <style> block must be byte-identical;
 *   - the style block is compared structurally (selectors + per-selector
 *     declaration-sequence; cross-selector reordering is a printed warning).
 *
 * The figjam baseline (rendered with an explicit figjam style) must not move
 * unless figjam rendering changes on purpose — it was recaptured deliberately
 * when text measurement moved to @codecaine-ai/text-measure (caption bands,
 * label chips and the routes ending on them, the stage's pinned text
 * rendering, the title chip's box-sizing). The
 * schematic themes have their own baseline, packages/canvas/
 * zz-dom-baseline-themes.json (`bun packages/canvas/zz-dom-capture.ts --themes
 * packages/canvas/zz-dom-baseline-themes.json`): the corpus under
 * schematic-light and schematic-dark, plus the detail doc (object `detail`
 * lines, icon tiles, brand glyphs) under all three themes. Recapture it — and
 * only it — when schematic rendering changes on purpose.
 *
 * The adversarial doc (zz-d-adversarial) is reported but never auto-fails —
 * its diffs are adjudicated manually.
 */


