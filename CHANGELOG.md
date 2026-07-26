# Changelog

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
