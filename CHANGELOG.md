# Changelog

## [0.2.1] - 2026-09-24

### Changed

- Raised `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` peer floors to `>=0.87.0` so tool `Text` components satisfy Pi 0.87's `invalidate()` contract (thanks [@FRFlo](https://github.com/FRFlo), #17). Date-versioned downstream runtimes such as `2026.9.24` still satisfy this range; do not use `^0.87`.
- Development and CI toolchain now uses Bun 1.4.2. `engines.node` is `>=22.19.0`. CI matrix is Ubuntu/macOS × Node 22/24 with `actions/checkout@v7` and `actions/setup-node@v7`, plus an `npm-consumer` job (`npm ci` + `npm test`). `bun.lock` is added; `package-lock.json` is kept for npm consumers.
- Refreshed dependencies: `@biomejs/biome` 2.5.14, `vitest` 5.0.1, `typescript` 7.0.2, `@types/node` 26.6.2, `@typescript/native-preview` 7.0.0-dev.20260707.2, `strip-ansi` ^7.2.0. Added exact `@earendil-works/pi-ai` / `pi-coding-agent` / `pi-tui` 0.87.1 and `typebox` 1.3.34 devDependencies so tests run against the current upstream runtime.

### Fixed

- Dependency and CI refresh tracked in #18.

## [0.2.0] - 2026-07-26

### Changed

- BREAKING: replaced the `todowrite` and `todoread` tools with a single phased, op-based `todo` tool (`init`/`start`/`done`/`drop`/`rm`/`append`/`view`), ported from oh-my-pi's todo tool (v17.0.5, MIT). Tasks and phases are referenced by verbatim content strings; numeric IDs no longer exist.
- Todo items are now `{content, status}` without `priority`; statuses are `pending | in_progress | completed | abandoned`.
- Session state stays under the `sanepi.todo-state` entry key and now persists a phased v2 payload. Legacy flat `todos` payloads and historical `todowrite` tool results still load: they migrate to one `Tasks` phase (`cancelled` maps to `abandoned`, unknown statuses become `pending`). External tool allowlists or configs referencing `todowrite`/`todoread` must be updated manually; state migration does not touch external configuration.

### Fixed

- Fixed the todo tool call row to show the actual todo items instead of only an item count.

### Removed

- The `todowrite` and `todoread` tool registrations (superseded by `todo`).
- Todo continuation auto follow-up that re-prompted the agent when incomplete todos remained after a clean stop.
- The `--disable-todo-continuation` CLI flag and the `todotools.continuation` settings block that toggled it.

## [0.1.0] - 2026-05-12

### Added

- Initial standalone `pi-todotools` extension extracted from senpi-mono.
- `todowrite` and `todoread` LLM tools.
- Session-persisted todo state via `sanepi.todo-state`.
- Todo sidebar rendering and workflow-first prompt guidance.
- Optional continuation follow-ups when incomplete todos remain.
