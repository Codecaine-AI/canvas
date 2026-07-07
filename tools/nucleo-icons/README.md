# Nucleo Icon Generator

This tool reads `packages/canvas/src/ui/icons/manifest.json` and generates the
repo's icon components + glyph data from the user's licensed Nucleo library.

## Pipeline

```
Dropbox Nucleo library (canonical)  →  manifest.json  →  generate.ts  →  per-icon components + vendored SVGs
```

1. **Canonical library** — the full Nucleo corpus lives outside the repo (the
   user's Dropbox: `/Users/Ford/Dropbox/UI Components/Icons/nucleo`, five sets:
   `nucleo_ui`, `nucleo_core`, `nucleo_sharp`, `nucleo_pixel`,
   `nucleo_micro_bold`). Discover new icons by grepping it.
2. **manifest.json** — the icon selection/mapping. `chrome` entries name each
   React component `export` and its Nucleo `source` path (relative to a library
   set, e.g. `nucleo_ui/outline/ui-layout/18px_check.svg`), unless marked
   `{ "custom": true }`. `glyphs` entries map a stable `id` to a `source` for
   the canvas `icon` object glyph registry.
3. **generate.ts** — resolves and vendors the sources, then emits the outputs.

Run it from anywhere in the repo with:

```sh
bun tools/nucleo-icons/generate.ts
```

## Library resolution + vendoring

Each manifest `source` is resolved against the first candidate that contains it,
in order:

1. `--library <dir>` CLI flag
2. `NUCLEO_LIBRARY_DIR` env var
3. the default Dropbox library path
4. the **vendored copy** under `packages/canvas/src/ui/icons/nucleo/svg/`

Every source resolved from the library is copied **byte-verbatim** into the
vendored dir, with its path `/` → `--` (e.g.
`nucleo_ui--outline--ui-layout--18px_check.svg`). Only the SVGs actually
referenced by the manifest are vendored — the full library is never copied into
the repo. On CI and other machines without the library, the vendored copies
alone regenerate byte-identical output. Vendored SVGs no longer referenced by
the manifest are pruned on each run.

## Outputs

The generator owns `packages/canvas/src/ui/icons/nucleo/` — it rewrites every
`.tsx`/`.ts` it emits there and manages the vendored `svg/` subdir. It writes:

- `packages/canvas/src/ui/icons/nucleo/<kebab>-icon.tsx` — one React chrome
  component per icon (e.g. `alert-triangle-icon.tsx` for `AlertTriangleIcon`).
- `packages/canvas/src/ui/icons/nucleo/index.ts` — a barrel re-exporting every
  component and the shared `IconProps` type.
- `packages/canvas/src/ui/icons/icon-glyph-data.generated.ts` — a single
  serializable glyph-data registry (consumed whole).

The shared `IconProps` type is hand-authored in
`packages/canvas/src/ui/icons/icon-props.ts`.

## Validation

The generator validates source existence, square viewBoxes, duplicate chrome
exports, duplicate glyph ids, custom entries with forbidden source fields,
supported SVG tags/attributes, paint values, and transform syntax. Glyph
conversion supports paths, circles, lines, rounded or transformed rects,
polylines, polygons, and ellipses. All problems are collected and reported
before exiting non-zero.

The generated output files are deterministic and should not be edited by hand.
Edit the manifest (or the source SVGs in the canonical library), then re-run.
