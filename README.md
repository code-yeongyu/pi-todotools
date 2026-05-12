# pi-todotools

[![ci](https://github.com/code-yeongyu/pi-todotools/actions/workflows/ci.yml/badge.svg)](https://github.com/code-yeongyu/pi-todotools/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Structured todo tools for the [pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). The extension registers `todowrite` and `todoread`, persists todo state in the session, renders a sidebar widget, appends workflow-first prompt guidance, and can automatically continue when incomplete todos remain.

This package is the standalone extraction of senpi-mono's former builtin `todotools` extension.

## Behavior

| Case | Result |
|------|--------|
| Agent calls `todowrite` | replaces the complete todo list, persists it as `sanepi.todo-state`, and refreshes the todo sidebar |
| Agent calls `todoread` | returns the current todo list as JSON |
| Session reloads or tree navigation changes | reconstructs the latest branch-local todo state from custom entries or historical `todowrite` results |
| Incomplete todos remain after a clean assistant stop | injects a follow-up continuation prompt unless disabled |
| All todos are `completed` or `cancelled` | hides the sidebar and stops continuation |

## Tools

### `todowrite`

Creates or replaces the structured task list. Each call must pass the full list.

```json
{
  "todos": [
    {
      "content": "src/utils/validation.ts: Add validateEmail() for input sanitization - expect boolean result",
      "status": "in_progress",
      "priority": "high"
    },
    {
      "content": "validation.test.ts: Add invalid-email regression test - expect foo to fail",
      "status": "pending",
      "priority": "medium"
    }
  ]
}
```

### `todoread`

Reads the current todo list for the active coding session.

```json
{}
```

## Settings

Todo continuation is enabled by default in interactive sessions. Disable it with either the CLI flag or settings:

```bash
pi --disable-todo-continuation
```

```json
{
  "todotools": {
    "continuation": {
      "enabled": false
    }
  }
}
```

Project settings override global settings.

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

Extracted from `packages/coding-agent/src/core/extensions/builtin/todotools` in `code-yeongyu/senpi-mono`.

## License

[MIT](LICENSE).

## Related

- [senpi](https://github.com/code-yeongyu/senpi) — the fork/runtime these extensions are extracted from.
- [Ultraworkers Discord](https://discord.gg/PUwSMR9XNk) — community link from the senpi README.
- [Dori](https://sisyphuslabs.ai) — the product powered by senpi under the hood.

## Acknowledgements

- **Mario Zechner** ([@badlogic](https://github.com/badlogic)) — author of [pi-mono](https://github.com/badlogic/pi-mono) and the pi-coding-agent extension API this package targets.
- **Yeongyu Kim** ([@code-yeongyu](https://github.com/code-yeongyu)) — maintainer of the senpi fork and this extracted extension.
