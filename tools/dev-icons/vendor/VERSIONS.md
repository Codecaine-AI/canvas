# Vendored icon sources

Written by `bun tools/dev-icons/generate.ts --vendor` from `../manifest.json` — do not edit by hand.
Each file is a byte-verbatim copy out of the pinned npm tarball below; only the SVGs the manifest
names are vendored, plus each package's license file. `simple-icons/data.json` holds the named slugs'
records out of the package's `data/simple-icons.json`, each record verbatim, in package order.

| dir | npm package | version | license | vendored |
|---|---|---|---|---|
| `tabler/` | `@tabler/icons` | 3.48.0 | MIT (`tabler/LICENSE`) | 65 SVGs for 66 glyph ids, from `icons/outline/` |
| `simple-icons/` | `simple-icons` | 16.33.0 | CC0-1.0 (`simple-icons/LICENSE.md`) | 329 SVGs for 329 glyph ids, from `icons/` |

Each logo's title, brand color (`hex`), aliases and per-logo license come from those records. A logo whose
license is outside `ALLOWED_LOGO_LICENSES` in `../generate.ts` is refused. These logos carry their own license:

| glyph | logo | license |
|---|---|---|
| `brand-airflow` | Apache Airflow | Apache-2.0 |
| `brand-alacritty` | Alacritty | Apache-2.0 |
| `brand-android` | Android | CC-BY-3.0 |
| `brand-angular` | Angular | CC-BY-4.0 |
| `brand-bash` | GNU Bash | MIT |
| `brand-cassandra` | Apache Cassandra | Apache-2.0 |
| `brand-codeberg` | Codeberg | CC0-1.0 |
| `brand-debian` | Debian | CC-BY-SA-3.0 |
| `brand-deno` | Deno | MIT |
| `brand-dotnet` | .NET | CC0-1.0 |
| `brand-flink` | Apache Flink | Apache-2.0 |
| `brand-forgejo` | Forgejo | CC-BY-SA-4.0 |
| `brand-git` | Git | CC-BY-3.0 |
| `brand-github-copilot` | GitHub Copilot | MIT |
| `brand-hadoop` | Apache Hadoop | Apache-2.0 |
| `brand-javascript` | JavaScript | MIT |
| `brand-jenkins` | Jenkins | CC-BY-SA-3.0 |
| `brand-kafka` | Apache Kafka | Apache-2.0 |
| `brand-markdown` | Markdown | CC0-1.0 |
| `brand-neovim` | Neovim | CC-BY-SA-3.0 |
| `brand-nixos` | NixOS | CC-BY-4.0 |
| `brand-ocaml` | OCaml | Unlicense |
| `brand-openjdk` | OpenJDK | BSD-3-Clause |
| `brand-opentelemetry` | OpenTelemetry | CC-BY-4.0 |
| `brand-parquet` | Apache Parquet | Apache-2.0 |
| `brand-php` | PHP | CC-BY-SA-4.0 |
| `brand-pulsar` | Apache Pulsar | Apache-2.0 |
| `brand-r` | R | CC-BY-SA-4.0 |
| `brand-ruby` | Ruby | CC-BY-SA-2.5 |
| `brand-rust` | Rust | CC-BY-SA-4.0 |
| `brand-spark` | Apache Spark | Apache-2.0 |
| `brand-storybook` | Storybook | MIT |
| `brand-yarn` | Yarn | CC-BY-4.0 |
| `brand-zig` | Zig | CC-BY-SA-4.0 |

Pinned tarballs (sha512 `dist.integrity`, verified on every `--vendor` run):

- https://registry.npmjs.org/@tabler/icons/-/icons-3.48.0.tgz
  `sha512-lQk06gVHNVBnJp0UOgtth54mcZBJM7rdYKsAxKOProj1bbSAx+/xiuOWfHlyvgdL3M+Y+I0HINrjHa3ygp8eXQ==`
- https://registry.npmjs.org/simple-icons/-/simple-icons-16.33.0.tgz
  `sha512-z14u6A8ngAg9mgERRsNO8YkjIMefehIpBk7A8Dz3Gd91945qFP19MLPSHgV4z8P5u/MRYd5e07OTzaDoB4d6qA==`
