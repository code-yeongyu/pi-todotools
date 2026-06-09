# Changelog

## [Unreleased]

### Removed

- Todo continuation auto follow-up that re-prompted the agent when incomplete todos remained after a clean stop.
- The `--disable-todo-continuation` CLI flag and the `todotools.continuation` settings block that toggled it.

## [0.1.0] - 2026-05-12

### Added

- Initial standalone `pi-todotools` extension extracted from senpi-mono.
- `todowrite` and `todoread` LLM tools.
- Session-persisted todo state via `sanepi.todo-state`.
- Todo sidebar rendering and workflow-first prompt guidance.
- Optional continuation follow-ups when incomplete todos remain.
