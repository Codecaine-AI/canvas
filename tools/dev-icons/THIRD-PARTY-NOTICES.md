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
(`vendor/simple-icons/LICENSE.md`), except for the logos listed below.

The logos are trademarks of their respective owners. A brand glyph only names the product a board
depicts. It implies no affiliation with or endorsement by the owner, and use stays subject to each
owner's brand guidelines.

Simple Icons records a separate license for three of the vendored logos. `manifest.json` declares
each one, and `generate.ts --vendor` checks the declarations against the package's own data.

| glyph | logo | license | source |
|---|---|---|---|
| `brand-git` | Git logo by Jason Long | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | <https://git-scm.com/community/logos> |
| `brand-rust` | Rust logo, Rust Foundation | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | <https://www.rust-lang.org/policies/media-guide> |
| `brand-kafka` | Apache Kafka logo, The Apache Software Foundation | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | <https://apache.org/logos> |
