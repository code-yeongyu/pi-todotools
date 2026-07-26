# pi-todotools

[![ci](https://github.com/code-yeongyu/pi-todotools/actions/workflows/ci.yml/badge.svg)](https://github.com/code-yeongyu/pi-todotools/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Phased, op-based todo tool for the [pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). The extension registers a single `todo` tool, persists phased task state in the session, renders a sidebar widget, and appends task-management prompt guidance.

This package is the standalone extraction of senpi-mono's former builtin `todotools` extension. The phased model is ported from [oh-my-pi](https://github.com/can1357/oh-my-pi)'s todo tool (v17.0.5, MIT — see [NOTICE](NOTICE)).

## Behavior

| Case | Result |
|------|--------|
| Agent calls `todo` with a mutating op | applies the operation atomically, persists the phased state as `sanepi.todo-state`, and refreshes the todo sidebar |
| Agent calls `todo` with `op: "view"` | echoes the current list read-only; nothing is persisted |
| An operation fails validation | the whole mutation is rejected; memory and session state stay unchanged |
| A task is completed | the earliest still-open task (in phase order) auto-promotes to `in_progress` |
| Session reloads or tree navigation changes | reconstructs the latest branch-local state from `sanepi.todo-state` entries or historical `todo`/`todowrite` tool results |
| All tasks are `completed` or `abandoned` | hides the sidebar |

## The `todo` tool

Tasks and phases are referenced by their verbatim content string — there are no auto-generated IDs.

| op | Required fields | Effect |
|----|-----------------|--------|
| `init` | `list: [{phase, items}]` or flat `items` | Initialize the full list (replaces existing) |
| `start` | `task` | Mark a task in progress (demotes the previous one) |
| `done` | `task` or `phase` | Mark completed |
| `drop` | `task` or `phase` | Mark abandoned |
| `rm` | `task` or `phase` (optional) | Remove a task or a phase's tasks; omit both to clear all |
| `append` | `phase`, `items` | Append tasks to a phase; lazily creates the phase |
| `view` | — | Read-only echo of the list |

```json
{
  "op": "init",
  "list": [
    { "phase": "Foundation", "items": ["Scaffold workspace", "Wire entrypoint"] },
    { "phase": "Verification", "items": ["Run focused tests"] }
  ]
}
```

## Migrating from 0.1.x (breaking change)

Version 0.2.0 removes the `todowrite` and `todoread` tools and replaces them with the single op-based `todo` tool.

- **Session state migrates automatically.** Legacy flat `sanepi.todo-state` payloads (the `todos` array with `priority` fields and `cancelled` statuses) and historical `todowrite` tool results are still read: they load as one `Tasks` phase, with `cancelled` mapped to `abandoned` and unknown statuses preserved as `pending` open work.
- **External configuration does NOT migrate.** Tool allowlists, permission rules, or other configuration that references the `todowrite`/`todoread` tool names must be updated manually to reference `todo` — state migration only covers session data and does not touch external configuration.
- **Item shape changed.** Tasks are now `{content, status}` without `priority`; statuses are `pending | in_progress | completed | abandoned`.

## Installation

The package targets the [`pi`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) coding agent. Pi loads extensions from `~/.pi/agent/extensions/`, project `.pi/extensions/`, or via the `--extension` / `-e` CLI flag.

```bash
# 1. From npm (once published)
pi install npm:pi-todotools

# 2. From git
pi install git:github.com/code-yeongyu/pi-todotools

# 3. Manual placement
git clone https://github.com/code-yeongyu/pi-todotools ~/.pi/agent/extensions/pi-todotools
cd ~/.pi/agent/extensions/pi-todotools && npm install

# 4. Dev / one-shot test
pi -e /path/to/pi-todotools/src/index.ts
```

After installation, restart pi or run `/reload` inside an interactive session.

## Development

```bash
npm install
npm test
npm run typecheck
npm run check
npm pack --dry-run
pi -e ./src/index.ts
```

## Branch rules and releases

- `main` is protected by `.github/branch-ruleset.json`.
- CI runs Node 20 and 22 on Ubuntu and macOS.
- Releases are GitHub Releases tagged as `v<semver>`.
- Publishing runs from the `publish` workflow after a GitHub Release is published.

## Origin

Extracted from `packages/coding-agent/src/core/extensions/builtin/todotools` in `code-yeongyu/senpi-mono`. The phased todo model is ported from [oh-my-pi](https://github.com/can1357/oh-my-pi) (`packages/coding-agent/src/tools/todo.ts`, commit `9fd6e97113f5ed3a847e66d346970efdf8afcad9`, v17.0.5, MIT).

## License

[MIT](LICENSE).

## Related

- [senpi](https://github.com/code-yeongyu/senpi) — the fork/runtime these extensions are extracted from.
- [Ultraworkers Discord](https://discord.gg/PUwSMR9XNk) — community link from the senpi README.
- [Dori](https://sisyphuslabs.ai) — the product powered by senpi under the hood.

## Acknowledgements

- **Mario Zechner** ([@badlogic](https://github.com/badlogic)) — author of [pi-mono](https://github.com/badlogic/pi-mono) and the pi-coding-agent extension API this package targets.
- **Can Bölük** ([@can1357](https://github.com/can1357)) — author of [oh-my-pi](https://github.com/can1357/oh-my-pi), whose phased todo tool this package ports.
- **Yeongyu Kim** ([@code-yeongyu](https://github.com/code-yeongyu)) — maintainer of the senpi fork and this extracted extension.
