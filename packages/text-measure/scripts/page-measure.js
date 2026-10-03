// Runs inside Chromium (added with page.addScriptTag; called through page.evaluate).
// Measures the DOM ground truth for the accuracy harness: for every corpus string
// and font, the single-line natural width and the line count at each box width,
// plus an edge sweep of boxes a hair narrower or wider than the natural width.
// Plain JS so the page can run it as-is. Adapted from the Pretext spike
// (/tmp/pretext-spike/scripts/page-measure.js).

globalThis.measureGrid = async function measureGrid({ texts, fonts, widths, deltas }) {
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const host = document.getElementById("host");
  const range = document.createRange();

  // Lines of one wrapped block: group graphemes by the top of their first client rect.
  function domLineCount(div, text) {
    const node = div.firstChild;
    if (!node) return 0;
    let lines = 0;
    let top = null;
    for (const { segment, index } of graphemes.segment(text)) {
      range.setStart(node, index);
      range.setEnd(node, index + segment.length);
      const rects = range.getClientRects();
      if (rects.length === 0 || (rects[0].width === 0 && /^\s+$/.test(segment))) continue;
      const t = Math.round(rects[0].top);
      if (top === null || Math.abs(t - top) > 2) {
        lines++;
        top = t;
      }
    }
    return lines;
  }

  const out = [];
  for (const font of fonts) {
    const lineHeight = Math.round(font.size * 1.5);
    const common =
      `font:${font.weight} ${font.size}px ${font.familyCss};line-height:${lineHeight}px;` +
      `letter-spacing:${font.letterSpacing}px;white-space:normal;word-break:normal;` +
      `overflow-wrap:break-word;line-break:auto;word-spacing:normal;font-kerning:auto;`;
    host.textContent = "";
    const rows = texts.map((text) => {
      const natural = document.createElement("div");
      natural.style.cssText = common + "white-space:nowrap;width:max-content;";
      natural.textContent = text;
      host.appendChild(natural);
      const wrapped = widths.map((w) => {
        const div = document.createElement("div");
        div.style.cssText = common + `width:${w}px;`;
        div.textContent = text;
        host.appendChild(div);
        return div;
      });
      return { text, natural, wrapped };
    });
    void host.offsetHeight; // one layout for the whole font
    const measured = rows.map(({ text, natural, wrapped }) => {
      range.selectNodeContents(natural.firstChild);
      const width = range.getBoundingClientRect().width;
      const counts = wrapped.map((div) => domLineCount(div, text));
      const heightCounts = wrapped.map((div) => Math.round(div.getBoundingClientRect().height / lineHeight));
      return { text, natural: width, counts, heightMismatch: counts.some((c, i) => c !== heightCounts[i]) };
    });

    // Edge sweep: boxes at natural + delta, where "fits on one line?" is decided.
    host.textContent = "";
    const edgeRows = measured.map((row) =>
      deltas.map((d) => {
        const div = document.createElement("div");
        div.style.cssText = common + `width:${Math.max(1, row.natural + d)}px;`;
        div.textContent = row.text;
        host.appendChild(div);
        return div;
      }),
    );
    void host.offsetHeight;
    measured.forEach((row, i) => {
      row.edges = edgeRows[i].map((div) => domLineCount(div, row.text));
    });
    host.textContent = "";
    out.push({ ...font, lineHeight, rows: measured });
  }
  return out;
};

// Same build check: every string must measure identically in the woff2 face
// (fonts.css) and in the TTF face loaded under another family name.
globalThis.compareBuilds = async function compareBuilds({ texts, pairs }) {
  const ctx = new OffscreenCanvas(1, 1).getContext("2d");
  const results = [];
  for (const { woff2, ttf } of pairs) {
    let maxDiff = 0;
    let worst = "";
    for (const text of texts) {
      ctx.font = woff2;
      const a = ctx.measureText(text).width;
      ctx.font = ttf;
      const b = ctx.measureText(text).width;
      if (Math.abs(a - b) > maxDiff) {
        maxDiff = Math.abs(a - b);
        worst = text;
      }
    }
    results.push({ woff2, ttf, maxDiff, worst });
  }
  return results;
};
