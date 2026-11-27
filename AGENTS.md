# canvas

Codecaine Canvas: the board engine (`packages/canvas`), the Canvas MCP server
(`packages/canvas-mcp`), the studio app (`packages/studio`), the text
measurer (`packages/text-measure`) and the eval runner
(`packages/eval-suite/runner`). The repo is a member of the codecaine core
bun workspace: install from the core root (`cd .. && bun install`).

## Test commands

Diff base for the changed-files gate: `origin/main`. The repo has no CI
(no `.github/workflows`), so every tier runs locally.

`tools/docs-framework` is a git submodule pinned to a docs-system commit.
Its tests are not ours: `bunfig.toml` sets `root = "packages"`, and no
command below runs them. Never edit or re-pin the submodule in a test change.

### Tier 1: every agent change

| Check | Command |
| --- | --- |
| Typecheck | `bun run typecheck` (text-measure, canvas, studio, canvas-mcp) |
| Lint | No code lint |
| Focused tests on changed files | The command below, plus the package rule after it |

```bash
{ git diff --name-only --diff-filter=d origin/main; git ls-files --others --exclude-standard; } \
  | grep -E '^packages/(canvas|studio)/.*\.test\.tsx?$' | sed 's#^#./#' | xargs -r bun test
```

- The focused command runs each changed engine or studio test file from the
  repo root, so the root `bunfig.toml` preloads apply (action-log temp path,
  happy-dom, the HarfBuzz text backend). Keep the `./` prefix: without it
  `bun test` treats a path as a name filter.
- Tests in the other packages run from their own folder, with their own
  preloads: `bun test ./<path>` in `packages/canvas-mcp`,
  `packages/eval-suite/runner` or `packages/text-measure`.

### Tier 2: before a PR

| Check | Command |
| --- | --- |
| Changed-files gate | None. Run the full suite of each touched package (table below). |
| Touched-area keeper suites | None. The repo has no `e2e/` keeper suites yet. |

- Before a PR, also run the agent check for a UI or MCP change: start the
  studio with `bun run dev:studio`, or the MCP server with
  `bun run --cwd packages/canvas-mcp mcp` with `CLAUDE_PROJECT_DIR` set to
  a scratch project, and use the changed flow. Never point it at real boards.

### Tier 3: before a release or a big merge

| Check | Command |
| --- | --- |
| Typecheck | `bun run typecheck` |
| Full suite | Every package suite in the table below, without a stop at the first failure |
| Keeper suites and screenshot comparisons | None yet |

### Product areas

No area has a keeper suite. Each area's Bun suite owns its flows.

| Area | Main user flows | Suite command (from the repo root) | Package globs |
| --- | --- | --- | --- |
| Board engine | Render, select, move, connect and route, sections, undo, the editor session | `bun test packages/canvas/src` | `packages/canvas/**` |
| Canvas MCP | Agent tools: open, create, place, connect, check, guidance | `bun run --cwd packages/canvas-mcp test` | `packages/canvas-mcp/**` |
| Studio | Board list, board page, the studio server | `bun test packages/studio` | `packages/studio/**` |
| Text measure | Measure, fit and wrap text with the bundled fonts | `bun run --cwd packages/text-measure test` | `packages/text-measure/**` |
| Eval runner | Score, judge and climb eval boards | `bun run --cwd packages/eval-suite/runner test` | `packages/eval-suite/runner/**` |

Routing rules:

- A changed file runs the suite of every area whose globs match it.
- The root preloads (`action-log-preload.ts`, `happydom.ts`,
  `text-measure-preload.ts`), `bunfig.toml`, `package.json` and the core
  `bun.lock` match no single area. They run every suite.
- The engine is imported by the MCP server, the studio and the eval runner.
  A change to `packages/canvas/src` outside its tests also runs those three
  suites.
- Other core packages import `@codecaine-ai/canvas` and
  `@codecaine-ai/text-measure`. Before you delete an export, run
  `git grep -w <name>` over the whole core tree, not only this repo.

### Budget and runner setup

- Measured 2026-11-27 on dev-01: the five suites took 60 s in total
  (2137 tests).
- Bun runs each suite in one process. No suite uses retries.

### Keeper tests

- No suite is a keeper suite yet. When the repo adds `e2e/` keeper flows,
  list them in the Product areas table.

### Quarantine

None.

- To quarantine a flaky test, add a row here with its title, the owner and a
  14-day expiry, and skip it in Tier 2 only. Fix it before the expiry.
