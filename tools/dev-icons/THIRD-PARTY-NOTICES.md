# Third-party notices: canvas icon glyphs

The canvas `icon` glyph registry (`packages/canvas/src/objects/shapes/icon/`) draws geometry generated
from the icon sets below. The upstream SVGs are vendored byte-verbatim under `vendor/` (exact pinned
versions in `vendor/VERSIONS.md`), and `generate.ts` turns them into
`icon-glyph-data-tabler.generated.ts` and `icon-glyph-data-brands.generated.ts`.

## Tabler Icons (MIT)

`@tabler/icons` 3.48.0, <https://tabler.io/icons>. Copyright (c) 2020-2026 Paweł Kuna. Licensed under
the MIT License; the full text is in `vendor/tabler/LICENSE`. Ship that text with any copy of the
generated Tabler glyph data.

## Simple Icons (CC0 1.0)

`simple-icons` 16.33.0, <https://simpleicons.org>. Released under CC0 1.0 Universal
(`vendor/simple-icons/LICENSE.md`), except for the logos whose own license `vendor/VERSIONS.md` lists.

The logos are trademarks of their respective owners. A brand glyph only names the product a board
depicts. It implies no affiliation with or endorsement by the owner, and use stays subject to each
owner's brand guidelines.

Simple Icons records a separate license for some logos. `generate.ts` reads each logo's license from the
pinned package's own data, refuses any license outside `ALLOWED_LOGO_LICENSES` (permissive and
attribution-only licenses: no non-commercial, no-derivatives, custom or GPL terms), and lists every
vendored logo that carries its own license, with that license, in `vendor/VERSIONS.md`. That table is
the attribution for those logos. Each license's terms are at <https://spdx.org/licenses/>.

## Brands with no logo

Simple Icons has no logo for some products the boards name, such as OpenAI, Codex, AWS, Slack and
T3 Code. Their catalog rows in `manifest.json` draw a generic Tabler glyph instead and say why in
`why`. No mark of theirs is vendored. A hand-drawn mark can replace a fallback only when its owner
publishes it under a license that allows it.

## Full-color brand marks (CC0 1.0)

`brand-art/*.svg` are nine full-color marks (PostgreSQL, Redis, Bun, Python, Supabase, Cloudflare,
Hugging Face, Figma, Terraform) taken from the `logos` set by Gil Barbara
(<https://github.com/gilbarbara/logos>, CC0 1.0), via `@iconify-json/logos` 1.2.4. Each file keeps
the upstream shapes and colors with the transforms baked in. Gradients are flattened to the mean of
their stops (Python's yellow takes the deeper stop, `#FFC331`), and translucent shading overlays are
dropped. A brand entry's `art` in `manifest.json` draws its mark instead of the one-color Simple Icons
logo. The trademark note above applies to these marks too.
