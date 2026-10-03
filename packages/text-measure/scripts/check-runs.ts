#!/usr/bin/env bun
/**
 * Checks wrapRuns() against Chromium's own line breaking on sticky-note
 * rows: one markdown line painted as a block with mixed inline runs, plain
 * Inter text, <strong> (Inter 700) and <code> (IBM Plex Mono 400 at .85em
 * with padding 0 .15em), the way canvas sticky notes paint them:
 *   body       400 24px Inter, line-height 36px
 *   h1/h2/h3   700 36/30/26.4px Inter (strong stays 700: same font, shaped across)
 * at box widths 120..414 step 7, white-space pre-wrap (the sticky) and normal.
 *
 * Headless Chromium (Playwright, the copy installed in core) lays every row
 * out in the DOM with the bundled woff2 faces; Range rects recover where
 * each line starts. wrapRuns runs with the HarfBuzz backend. Reports
 * line-count and line-start mismatches, how far each one is from flipping
 * (the smallest box-width change, in 1/64 px steps up to 1px, that gives the
 * DOM's lines: within 1px it is an edge case), and the fragment x and line
 * right-edge error where the lines agree. Rows marked KNOWN hit a limit
 * wrapText shares (README "Mixed runs"); the script exits 1 only on a
 * mismatch that is neither an edge case nor explained there.
 *   bun canvas/packages/text-measure/scripts/check-runs.ts [--verbose]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { useHarfBuzz } from "../src/headless.ts";
import { uncoveredChars, wrapRuns, type RunsWrapResult, type TextRun } from "../src/index.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ORIGIN = "http://text-measure.test";
const VERBOSE = process.argv.includes("--verbose");

/** Sticky-note rows: **bold** and `code` spans, no nesting. */
const ROWS: string[] = [
  "Ship **v2.3** by Friday, then run `npm run release` and tag it",
  "**Owner:** Platform team",
  "**Owner**, platform team, and **infra**; then the rest",
  "**Risk:** the `migrate --force` step drops `legacy_users` and cannot be undone",
  "Blocked on `ORG_ADMIN_TOKEN_PRODUCTION_READONLY` rotation",
  "Set `MAX_CONCURRENT_UPLOADS_PER_WORKSPACE` to 8 before the import",
  "Call `fetchUserProfileWithRetries()` first, then `render()`",
  "`packages/canvas-agent/src/board/text-fit.ts` owns the lint",
  "`a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p`",
  "Use `fetchUserProfile()` to load the **profile**, then ship.",
  "  indented by two spaces",
  " one leading space and **bold**",
  "two  spaces  between  words  here",
  "triple   spaces   and `code`   too",
  "trailing spaces after this   ",
  "**bold** with trailing  ",
  "self-contained, read-only and well-tested **multi-tenant** design",
  "state-of-the-art `x-ray` vision-goggles-are-cool",
  "the `x`-axis and the `y`-axis",
  "`foo`bar and pre`code`post and **bold**er",
  "(**note**) see `README.md` and \"**quoted**\" text",
  "**Done**. **Next**: `deploy`! **Why?** Because.",
  "AVATAR **WAVE** To Ta Yo **AV**AV LT**AV** Tw",
  "don't **won't** can't `it's` y'all",
  "and/or **either/or** `src/lib/index.ts` paths",
  "Wait… **what**… and so on...",
  "Supercalifragilisticexpialidocious",
  "**Supercalifragilisticexpialidocious** word",
  "`npm run build -- --watch --filter=@codecaine-ai/text-measure`",
  "`git commit -m \"fix: wrap runs like Chromium\"` then push",
  "See https://example.com/docs/getting-started?tab=install for details",
  "v1.2.3-beta.4 and **10:30–11:45** standup, 50% of **$1,200**",
  "A -> B => C and **input** -> `parse()` -> output",
  "a b c d e f g h i j k l m n o p q r s t u v w x y z",
  "**a** b `c` d **e** f `g` h **i** j `k` l **m** n `o` p",
  "Ship it 🚀 now and **celebrate** 🎉 later",
  "日本語 **テキスト** mixed with `code`",
  "naïve café — **résumé** and `über`",
  "✅ **Done** — `ok` ✓ and ✗",
  "Use `→` arrows and `⇒` in **docs** ←",
  "**Q3 OKR:** reduce p95 latency from 450ms to 200ms",
  "Retro: what went **well**, what went **badly**, `actions`",
  "Ping @ford.lascari about `CODEOWNERS` changes",
  "**TODO** `// eslint-disable-next-line` remove",
  "**Decision:** keep `pretext@0.0.9` pinned; bump after re-recording truth",
  "Hypothesis: `p(x|y) ∝ p(y|x)·p(x)` **holds**",
  "**Bold**,**bold**,**bold**,**bold**,**bold**",
  "`x`,`y`,`z`,`w`,`v`,`u`,`t`,`s`,`r`,`q`",
  "**1.** First **2.** Second **3.** Third",
  "Long sentence without any formatting that keeps going and going until it has to wrap several times",
  "`SELECT id, name FROM users WHERE created_at > now() - interval '7 days'`",
  "**Customer impact:** 3 enterprise tenants saw `502 Bad Gateway` for ~4 min",
  "mixed`code`**bold**plain`code`**bold**",
  "**endsWithBold**",
  "`endsWithCode`",
  "Inline `a` `b` `c` `d` `e` `f` codes",
  "Ünïcödé **Ελληνικά** `Кириллица` text",
  "Price: **€1.299,00** (incl. VAT) — `EUR`",
  "e.g. **i.e.** etc. `vs.` cf.",
  "email ford.lascari@example.com or **support@example.com**",
  "**bold **  text with  collapsed   spaces **across ** runs",
  "`code `then `trailing ` spaces in `code`",
  "  **lead** in bold after two spaces",
  "**re**-entry, co-**author** and **well**-known `x`-ray",
  "`x`! `y`? `z`. (`w`) [**v**] {`u`}",
  "`ORG_ADMIN_TOKEN_PRODUCTION_READONLY_SECRET_ROTATION_KEY_V2`",
  "a\tb **c**\td and `e`\tf",
];

/** Rows that hit a limit wrapText shares (README "Mixed runs"), with the reason. */
const KNOWN: Record<string, string> = {
  "A -> B => C and **input** -> `parse()` -> output": "a line starting with the second half of Inter's -> arrow keeps its in-context width",
  "a\tb **c**\td and `e`\tf": "Chromium skips a tab stop closer than half a space; Pretext's tab stops do not",
};

type Kind = "text" | "strong" | "code";
interface Piece {
  kind: Kind;
  text: string;
}

function parse(md: string): Piece[] {
  const out: Piece[] = [];
  let kind: Kind = "text";
  let buffer = "";
  const flush = () => {
    if (buffer !== "") out.push({ kind, text: buffer });
    buffer = "";
  };
  for (let i = 0; i < md.length; ) {
    if (kind !== "code" && md.startsWith("**", i)) {
      flush();
      kind = kind === "strong" ? "text" : "strong";
      i += 2;
    } else if (md[i] === "`") {
      flush();
      kind = kind === "code" ? "text" : "code";
      i++;
    } else {
      buffer += md[i++];
    }
  }
  flush();
  return out;
}

interface Config {
  name: string;
  size: number;
  weight: number;
  lineHeight: number;
}

const CONFIGS: Config[] = [
  { name: "body 24/400", size: 24, weight: 400, lineHeight: 36 },
  { name: "h1 36/700", size: 36, weight: 700, lineHeight: 44 },
  { name: "h2 30/700", size: 30, weight: 700, lineHeight: 38 },
  { name: "h3 26.4/700", size: 26.4, weight: 700, lineHeight: 34 },
];
const WIDTHS = Array.from({ length: 43 }, (_, i) => 120 + 7 * i);
const MODES = ["pre-wrap", "normal"] as const;

/** The runs a row paints with: code is .85em IBM Plex Mono with padding 0 .15em. */
function runsFor(pieces: Piece[], config: Config): TextRun[] {
  return pieces.map((piece) => {
    if (piece.kind === "strong") return { text: piece.text, font: { family: "Inter", size: config.size, weight: 700 } };
    if (piece.kind === "code") {
      const size = config.size * 0.85;
      return { text: piece.text, font: { family: "IBM Plex Mono", size, weight: 400 }, padStart: size * 0.15, padEnd: size * 0.15 };
    }
    return { text: piece.text, font: { family: "Inter", size: config.size, weight: config.weight } };
  });
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/fonts.css">
<style>
body { margin: 0; }
#host { position: absolute; left: 0; top: 0; width: 100000px; }
.row { margin: 0; padding: 0; border: 0; overflow-wrap: break-word; word-break: normal; line-break: auto; letter-spacing: normal;
  word-spacing: normal; font-kerning: auto; font-variant-ligatures: normal; font-feature-settings: normal; text-rendering: auto; tab-size: 8; }
strong { font-weight: 700; }
code { font-family: 'IBM Plex Mono'; font-weight: 400; font-size: .85em; padding: 0 .15em; margin: 0; border: 0; }
</style></head><body><div id="host"></div></body></html>`;

interface DomLine {
  /** [run, offset in run text] of the line's first grapheme (first non-space in normal mode). */
  start: [number, number];
  /** x of each run's first grapheme on the line, from the block's left edge. */
  xs: Record<number, number>;
  /** Right edge of the last non-space grapheme. */
  right: number;
}

const unit = (px: number | undefined) => Math.floor((px ?? 0) * 64 + 1e-6) / 64;
const startsOf = (r: RunsWrapResult): string => r.lines.map((l) => (l.fragments[0] ? `${l.fragments[0].run}:${l.fragments[0].start}` : "-")).join(" ");
const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(q * values.length))] ?? 0;
const over = (values: number[], limit: number) => values.filter((v) => v > limit).length;

await useHarfBuzz();
const browser = await chromium.launch({ headless: true });
let exitCode = 0;
try {
  const page = await (await browser.newContext({ deviceScaleFactor: 1, locale: "en-US" })).newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/fonts.css") return route.fulfill({ status: 200, contentType: "text/css", body: readFileSync(`${ROOT}fonts.css`) });
    if (/^\/fonts\/[\w-]+\.woff2$/.test(path)) return route.fulfill({ status: 200, contentType: "font/woff2", body: readFileSync(`${ROOT}${path.slice(1)}`) });
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
  });
  await page.goto(`${ORIGIN}/index.html`);
  const loaded = await page.evaluate(async () => {
    const ok: string[] = [];
    for (const face of ["400 16px Inter", "700 16px Inter", "400 16px 'IBM Plex Mono'"]) {
      if ((await document.fonts.load(face)).some((f) => f.status === "loaded")) ok.push(face);
    }
    await document.fonts.ready;
    return ok;
  });
  if (loaded.length !== 3) throw new Error(`fonts did not load: ${JSON.stringify(loaded)}`);
  console.log(`Chromium ${browser.version()}; faces loaded: ${loaded.join(", ")}`);

  const parsed = ROWS.map(parse);
  const totals = { checks: 0, lineCount: 0, starts: 0, edge: 0, known: 0, unexpected: 0, lines: 0 };
  const knownByReason = new Map<string, number>();
  const unexpected: string[] = [];
  const edgeCases: string[] = [];
  const flips: number[] = [];
  const xErrors: number[] = [];
  const rightErrors: number[] = [];
  let worstX = "";
  let worstXErr = -1;
  let worstRight = "";
  let worstRightErr = -1;

  for (const mode of MODES) {
    for (const config of CONFIGS) {
      const dom = (await page.evaluate(
        ({ rows, config, widths, mode }) => {
          const host = document.getElementById("host")!;
          host.textContent = "";
          const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
          const range = document.createRange();
          const items: Array<{ div: HTMLDivElement; nodes: Text[] }> = [];
          for (const pieces of rows) {
            for (const width of widths) {
              const div = document.createElement("div");
              div.className = "row";
              div.style.cssText += `width:${width}px;font:${config.weight} ${config.size}px Inter;line-height:${config.lineHeight}px;white-space:${mode};`;
              const nodes = pieces.map((piece) => {
                const node = document.createTextNode(piece.text);
                if (piece.kind === "text") div.appendChild(node);
                else div.appendChild(document.createElement(piece.kind)).appendChild(node);
                return node;
              });
              host.appendChild(div);
              items.push({ div, nodes });
            }
          }
          void host.offsetHeight;
          return items.map(({ div, nodes }) => {
            const box = div.getBoundingClientRect();
            const lines: Array<{ start: [number, number]; top: number; xs: Record<number, number>; right: number }> = [];
            let current: (typeof lines)[number] | null = null;
            nodes.forEach((node, run) => {
              for (const { segment, index } of segmenter.segment(node.data)) {
                if (segment === "\n") continue;
                const space = /^\s+$/.test(segment);
                if (mode === "normal" && space) continue;
                range.setStart(node, index);
                range.setEnd(node, index + segment.length);
                const rect = range.getClientRects()[0];
                if (!rect) continue;
                if (!current || rect.top - current.top > config.lineHeight / 2) {
                  current = { start: [run, index], top: rect.top, xs: {}, right: 0 };
                  lines.push(current);
                }
                if (!(run in current.xs)) current.xs[run] = rect.left - box.left;
                if (!space) current.right = Math.max(current.right, rect.right - box.left);
              }
            });
            return lines.map(({ start, xs, right }) => ({ start, xs, right }));
          });
        },
        { rows: parsed, config, widths: WIDTHS, mode },
      )) as DomLine[][];

      const stats = { checks: 0, lineCount: 0, starts: 0, edge: 0, other: 0 };
      let k = 0;
      parsed.forEach((pieces, rowIndex) => {
        const runs = runsFor(pieces, config);
        const covered = runs.every((run) => uncoveredChars(run.text, run.font.family).length === 0);
        for (const width of WIDTHS) {
          const domLines = dom[k++]!;
          const domStarts = domLines.map((l) => `${l.start[0]}:${l.start[1]}`).join(" ");
          const ours = wrapRuns(runs, { maxWidth: width, lineHeight: config.lineHeight, whiteSpace: mode });
          stats.checks++;
          if (startsOf(ours) === domStarts) {
            // Geometry where the lines agree: each run's first glyph x and the line's right edge, on covered rows.
            // Leading spaces and tab lines are left out: hanging spaces and tab stops are not modeled glyph by glyph.
            if (!covered) continue;
            const lastOfRun = new Map<number, unknown>();
            for (const line of ours.lines) for (const f of line.fragments) lastOfRun.set(f.run, f);
            const seen = new Set<number>();
            ours.lines.forEach((line, li) => {
              const domLine = domLines[li]!;
              const tabs = line.text.includes("\t");
              let right = 0;
              for (const f of line.fragments) {
                const run = runs[f.run]!;
                const padStart = seen.has(f.run) ? 0 : unit(run.padStart);
                seen.add(f.run);
                const domX = domLine.xs[f.run];
                if (!tabs && domX !== undefined && !/^\s/.test(f.text)) {
                  const err = Math.abs(f.x + padStart - domX);
                  xErrors.push(err);
                  if (err > worstXErr) {
                    worstXErr = err;
                    worstX = `${mode} ${config.name} @${width} row ${rowIndex} line ${li} run ${f.run} ${JSON.stringify(f.text)}: ours ${f.x + padStart} dom ${domX.toFixed(4)}`;
                  }
                }
                const padEnd = lastOfRun.get(f.run) === f ? unit(run.padEnd) : 0;
                if (f.text.trim() !== "") right = Math.max(right, f.x + f.width - padEnd);
              }
              if (!tabs && domLine.right > 0) {
                const err = Math.abs(right - domLine.right);
                rightErrors.push(err);
                if (err > worstRightErr) {
                  worstRightErr = err;
                  worstRight = `${mode} ${config.name} @${width} row ${rowIndex} line ${li} ${JSON.stringify(line.text)}: ours ${right} dom ${domLine.right.toFixed(4)}`;
                }
              }
              totals.lines++;
            });
            continue;
          }
          if (ours.lineCount !== domLines.length) stats.lineCount++;
          else stats.starts++;
          // Smallest box-width change (1/64 px steps, up to 1px) that gives the DOM's lines.
          let flip = Infinity;
          for (let step = 1; step <= 64 && flip === Infinity; step++) {
            for (const d of [-step / 64, step / 64]) {
              if (startsOf(wrapRuns(runs, { maxWidth: width + d, lineHeight: config.lineHeight, whiteSpace: mode })) === domStarts) flip = d;
            }
          }
          const text = runs.map((r) => r.text).join("");
          const offset = (p: [number, number]) => runs.slice(0, p[0]).reduce((n, r) => n + r.text.length, 0) + p[1];
          const domText = domLines.map((l, i) => JSON.stringify(text.slice(offset(l.start), domLines[i + 1] ? offset(domLines[i + 1]!.start) : undefined)));
          const describe = (note: string) =>
            `${mode} ${config.name} @${width} ${note} row ${rowIndex}${covered ? "" : " (uncovered)"} ${JSON.stringify(ROWS[rowIndex])}\n` +
            `    dom  ${domText.join(" | ")}\n    ours ${ours.lines.map((l) => JSON.stringify(l.text)).join(" | ")}`;
          const reason = KNOWN[ROWS[rowIndex]!];
          if (flip !== Infinity) {
            stats.edge++;
            flips.push(Math.abs(flip));
            edgeCases.push(describe(`(flips at ${flip > 0 ? "+" : ""}${Math.round(flip * 64)}/64px)`));
          } else if (reason) {
            stats.other++;
            totals.known++;
            knownByReason.set(reason, (knownByReason.get(reason) ?? 0) + 1);
          } else {
            stats.other++;
            totals.unexpected++;
            unexpected.push(describe("(not an edge case)"));
          }
        }
      });
      console.log(
        `${mode.padEnd(8)} ${config.name.padEnd(12)} ${stats.checks} rows x widths: line-count mismatches ${stats.lineCount}, ` +
          `break-offset mismatches ${stats.starts}; within 1px of an edge ${stats.edge}, not ${stats.other}`,
      );
      totals.checks += stats.checks;
      totals.lineCount += stats.lineCount;
      totals.starts += stats.starts;
      totals.edge += stats.edge;
    }
  }

  const bucket = (limit: number) => flips.filter((f) => f <= limit + 1e-9).length;
  console.log(
    `\nTOTAL ${totals.checks} rows x widths (${ROWS.length} rows, ${CONFIGS.length} fonts, ${WIDTHS.length} widths, ${MODES.length} white-space modes): ` +
      `line-count mismatches ${totals.lineCount}, break-offset mismatches ${totals.starts}`,
  );
  console.log(
    `  within 1px of an edge: ${totals.edge} (flip within 1/64px ${bucket(1 / 64)}, 0.25px ${bucket(0.25)}, 0.5px ${bucket(0.5)}, 1px ${bucket(1)})`,
  );
  console.log(`  not an edge case: ${totals.known + totals.unexpected} (known limits shared with wrapText ${totals.known}, unexpected ${totals.unexpected})`);
  for (const [reason, count] of knownByReason) console.log(`    ${count} x ${reason}`);
  console.log(
    `geometry where the lines agree (${totals.lines} lines, covered rows): fragment x error p95 ${quantile(xErrors, 0.95).toFixed(4)}px, ` +
      `max ${quantile(xErrors, 1).toFixed(4)}px, ${over(xErrors, 1 / 64 + 1e-3)}/${xErrors.length} over 1/64px; ` +
      `line right edge p95 ${quantile(rightErrors, 0.95).toFixed(4)}px, max ${quantile(rightErrors, 1).toFixed(4)}px, ${over(rightErrors, 1 / 64 + 1e-3)}/${rightErrors.length} over 1/64px`,
  );
  if (VERBOSE) {
    console.log(`  worst x: ${worstX}\n  worst right edge: ${worstRight}`);
    console.log(`\nedge cases (${edgeCases.length}):\n  ${edgeCases.join("\n  ")}`);
  }
  if (unexpected.length) {
    console.log(`\nUNEXPECTED mismatches (${unexpected.length}):\n  ${unexpected.join("\n  ")}`);
    exitCode = 1;
  }
} finally {
  await browser.close();
}
process.exit(exitCode);
