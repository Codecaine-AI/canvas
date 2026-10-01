# Vendored icon sources

Written by `bun tools/dev-icons/generate.ts --vendor` from `../manifest.json` — do not edit by hand.
Each file is a byte-verbatim copy out of the pinned npm tarball below; only the SVGs the manifest
names are vendored, plus each package's license file.

| dir | npm package | version | license | vendored |
|---|---|---|---|---|
| `tabler/` | `@tabler/icons` | 3.48.0 | MIT (`tabler/LICENSE`) | 65 SVGs for 66 glyph ids, from `icons/outline/` |
| `simple-icons/` | `simple-icons` | 16.33.0 | CC0-1.0 (`simple-icons/LICENSE.md`) | 29 SVGs for 29 glyph ids, from `icons/` |

Per-logo licenses that Simple Icons records are declared on the brand entries in `../manifest.json`
and verified against the package's `data/simple-icons.json` on every `--vendor` run.

Pinned tarballs (sha512 `dist.integrity`, verified on every `--vendor` run):

- https://registry.npmjs.org/@tabler/icons/-/icons-3.48.0.tgz
  `sha512-lQk06gVHNVBnJp0UOgtth54mcZBJM7rdYKsAxKOProj1bbSAx+/xiuOWfHlyvgdL3M+Y+I0HINrjHa3ygp8eXQ==`
- https://registry.npmjs.org/simple-icons/-/simple-icons-16.33.0.tgz
  `sha512-z14u6A8ngAg9mgERRsNO8YkjIMefehIpBk7A8Dz3Gd91945qFP19MLPSHgV4z8P5u/MRYd5e07OTzaDoB4d6qA==`
