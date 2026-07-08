/**
 * Palette contact sheet (P0, OBJECT-DEF-OVERHAUL.md §6 P0).
 *
 * Renders every cell of packages/canvas/src/palette.ts's CANVAS_PALETTE table
 * as a static HTML page: the 10-pick picker row up top, then one row per
 * CanvasColor showing how that pick renders across every role (shape, section,
 * sticky, connector). This is the throwaway artifact for the Ford checkpoint —
 * eyeball every hex against FigJam before any consumer rewiring (P1) begins.
 *
 * Run: bun tools/palette-contact-sheet.ts
 * Writes: tools/palette-contact-sheet.html (committed alongside this script).
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CANVAS_COLORS } from "../packages/canvas/src/state/schema/colors";
import { CANVAS_PALETTE } from "../packages/canvas/src/palette";
import type { CanvasColor } from "../packages/canvas/src/state/schema/colors";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pickerGridSection(): string {
  const swatches = CANVAS_COLORS
    .map((id) => {
      const swatch = CANVAS_PALETTE[id];
      return `
          <div class="picker-swatch">
            <div class="picker-circle" style="background:${swatch.swatch};"></div>
            <div class="picker-id">${escapeHtml(id)}</div>
          </div>`;
    })
    .join("");
  return `
    <section class="picker">
      <h2>10-pick picker row</h2>
      <p class="subtle">Preview = ink, the line-safe hex shown for every kind (D12).</p>
      <div class="picker-row" data-row="1">${swatches}</div>
    </section>`;
}

function shapeSample(id: CanvasColor): string {
  const { fill, border } = CANVAS_PALETTE[id].shape;
  const borderCss = border ? `3px solid ${border}` : "3px solid transparent";
  return `
    <div class="sample">
      <div class="shape-box" style="background:${fill}; border:${borderCss};">Aa</div>
      <div class="sample-caption">fill ${fill}<br/>border ${border}</div>
    </div>`;
}

function sectionSample(id: CanvasColor): string {
  const { tint, chip } = CANVAS_PALETTE[id].section;
  return `
    <div class="sample">
      <div class="section-box" style="background:${tint}; border-color:${chip.fill};">
        <div class="section-chip" style="background:${chip.fill}; border-color:${chip.border};">Title</div>
      </div>
      <div class="sample-caption">tint ${tint}<br/>chip ${chip.fill} / ${chip.border}</div>
    </div>`;
}

function stickySample(id: CanvasColor): string {
  const fill = CANVAS_PALETTE[id].sticky;
  return `
    <div class="sample">
      <div class="sticky-box" style="background:${fill};">Sticky note text</div>
      <div class="sample-caption">${fill}</div>
    </div>`;
}

function connectorSample(id: CanvasColor): string {
  const stroke = CANVAS_PALETTE[id].connector;
  return `
    <div class="sample">
      <svg class="connector-svg" viewBox="0 0 160 40" xmlns="http://www.w3.org/2000/svg">
        <line x1="8" y1="20" x2="130" y2="20" stroke="${stroke}" stroke-width="4" stroke-linecap="round" />
        <polygon points="130,12 152,20 130,28" fill="${stroke}" />
      </svg>
      <div class="sample-caption">${stroke}</div>
    </div>`;
}

function roleRowsSection(): string {
  const rows = CANVAS_COLORS.map((id) => {
    return `
      <tr>
        <td class="id-cell">
          <div class="id-swatch" style="background:${CANVAS_PALETTE[id].swatch};"></div>
          <code>${escapeHtml(id)}</code>
        </td>
        <td>${shapeSample(id)}</td>
        <td>${sectionSample(id)}</td>
        <td>${stickySample(id)}</td>
        <td>${connectorSample(id)}</td>
      </tr>`;
  }).join("");

  return `
    <section class="roles">
      <h2>Per-role rendering — all 10 ids</h2>
      <table>
        <thead>
          <tr>
            <th>id</th>
            <th>shape</th>
            <th>section</th>
            <th>sticky</th>
            <th>connector</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>`;
}

function page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Canvas palette contact sheet (P0)</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0;
    padding: 32px;
    background: #F5F5F5;
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
    color: #1D1D1D;
  }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  .subtle { color: #666; font-size: 13px; margin: 0 0 16px; }
  .picker {
    background: #FFFFFF;
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 32px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  .picker-row { display: flex; gap: 14px; margin-bottom: 14px; }
  .picker-swatch { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 64px; }
  .picker-circle {
    width: 40px; height: 40px; border-radius: 50%;
    border: 1px solid rgba(0,0,0,0.12);
    box-sizing: border-box;
  }
  .picker-id { font-size: 10px; color: #444; text-align: center; word-break: break-all; }
  .roles {
    background: #FFFFFF;
    border-radius: 12px;
    padding: 20px 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  table { border-collapse: collapse; width: 100%; }
  thead th {
    text-align: left;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #888;
    padding: 8px 12px;
    border-bottom: 2px solid #EAEAEA;
  }
  tbody td {
    padding: 12px;
    border-bottom: 1px solid #EFEFEF;
    vertical-align: middle;
  }
  .id-cell { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
  .id-swatch {
    width: 22px; height: 22px; border-radius: 50%;
    border: 1px solid rgba(0,0,0,0.12);
    flex-shrink: 0;
  }
  .id-cell code { font-size: 13px; }
  .sample { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
  .sample-caption { font-size: 10px; color: #888; font-family: ui-monospace, monospace; line-height: 1.4; }
  .shape-box {
    width: 72px; height: 48px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; color: rgba(0,0,0,0.8);
    box-sizing: border-box;
  }
  .section-box {
    width: 130px; height: 60px;
    border-radius: 8px;
    border: 2px solid;
    position: relative;
    box-sizing: border-box;
  }
  .section-chip {
    position: absolute;
    top: -10px; left: 8px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 2px solid;
    font-size: 11px;
    font-weight: 600;
    color: #000000;
  }
  .sticky-box {
    width: 100px; height: 64px;
    padding: 8px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(0,0,0,0.8);
    box-sizing: border-box;
  }
  .connector-svg { width: 160px; height: 40px; }
</style>
</head>
<body>
  <h1>Canvas palette contact sheet</h1>
  <p class="subtle">Generated by tools/palette-contact-sheet.ts from packages/canvas/src/palette.ts — P0 (data only). Board background #F5F5F5.</p>
  ${pickerGridSection()}
  ${roleRowsSection()}
</body>
</html>
`;
}

function main(): void {
  const outPath = join(import.meta.dir, "palette-contact-sheet.html");
  writeFileSync(outPath, page(), "utf8");
  console.log(`Wrote ${outPath}`);
}

main();
