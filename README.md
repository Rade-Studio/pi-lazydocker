# pi-lazydocker

**Open [lazydocker](https://github.com/jesseduffield/lazydocker) inside [Pi](https://pi.dev) with one keystroke.** Press `alt+l` and your containers, logs and stats show up in a themed floating window over your session. Press `ctrl+q` and you're back where you left off, with the agent still running.

[![CI](https://github.com/ahernand53/pi-lazydocker/actions/workflows/ci.yml/badge.svg)](https://github.com/ahernand53/pi-lazydocker/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/pi-lazydocker.svg)](https://www.npmjs.com/package/pi-lazydocker)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<!-- Record with `vhs assets/demo.tape`, then uncomment:
![pi-lazydocker demo](assets/demo.gif)
-->

## Quick start

1. Install lazydocker (any method from [its README](https://github.com/jesseduffield/lazydocker#installation)):

   ```bash
   brew install lazydocker
   ```

2. Install the package:

   ```bash
   pi install npm:pi-lazydocker            # Pi
   gentle-shell install npm:pi-lazydocker  # gentle-shell
   ```

3. Inside Pi, press **`alt+l`** (or run `/lazydocker`).

## Two ways to open it

| Mode | What you get | Open it with |
|---|---|---|
| **Overlay** (default) | A rounded, theme-colored window centered over Pi. Pi stays visible and the agent keeps working underneath. | `alt+l`, `/lazydocker`, `/lazydocker --overlay` |
| **Fullscreen** | lazydocker owns the whole terminal; Pi is restored exactly as it was when you quit. | `/lazydocker --fullscreen`, or `ctrl+f` from the overlay |

The overlay falls back to fullscreen by itself when it cannot run: if the native PTY module failed to install on your platform, or if the terminal is smaller than 60×15. You always get lazydocker.

## Keys

| Where | Key | Action |
|---|---|---|
| Pi | `alt+l` | Open lazydocker in your default mode |
| Overlay | `ctrl+q` | Close the overlay |
| Overlay | `ctrl+f` | Reopen in fullscreen |
| Overlay / fullscreen | `q` | Quit lazydocker normally |

Every other key goes straight to lazydocker. See [lazydocker's keybindings](https://github.com/jesseduffield/lazydocker/blob/master/docs/keybindings/Keybindings_en.md).

> **Does `alt+l` clash with anything?** No, not in Pi's defaults or in gentle-shell (which uses `alt+g`, `alt+u`, `alt+a`, `alt+s` and `alt+k`). If you already use it, change or disable it with `PI_LAZYDOCKER_KEY`.

## Command

```text
/lazydocker [--overlay | --fullscreen] [lazydocker args...]
```

| Flag | Meaning |
|---|---|
| `-O`, `--overlay` | Open in the floating window |
| `-F`, `--fullscreen` | Hand the whole terminal to lazydocker |
| `-h`, `--help` | Show usage |
| `--` | Pass everything after it to lazydocker unchanged |

Any other argument goes to lazydocker, for example a specific compose file:

```text
/lazydocker -f docker-compose.prod.yml
```

lazydocker starts in Pi's working directory, so it picks up the Compose project of whatever repo your session is in.

## Configuration

Configuration is optional. Set these variables in your shell profile:

| Variable | Default | Description |
|---|---|---|
| `PI_LAZYDOCKER_KEY` | `alt+l` | Shortcut. Set it to `off` (or empty) to disable it. |
| `PI_LAZYDOCKER_MODE` | `overlay` | Mode for the shortcut and for a bare `/lazydocker`: `overlay` or `fullscreen`. |
| `PI_LAZYDOCKER_WIDTH` | `92%` | Overlay width, in columns (`140`) or as a percentage (`80%`). |
| `PI_LAZYDOCKER_HEIGHT` | `90%` | Overlay max height, in rows or as a percentage. |
| `PI_LAZYDOCKER_COMMAND` | `lazydocker` | Binary or wrapper to run, for example an absolute path. |

Invalid values never break the extension. It falls back to the default and shows a warning the first time you open lazydocker.

```fish
# fish example
set -Ux PI_LAZYDOCKER_KEY ctrl+alt+d
set -Ux PI_LAZYDOCKER_WIDTH 85%
```

## Requirements

- Pi in interactive (TUI) mode. In print, JSON or RPC mode the command explains why it can't run.
- Node.js ≥ 22.18.
- lazydocker on your `PATH` (or set `PI_LAZYDOCKER_COMMAND`).
- A reachable Docker (or Docker-compatible) engine. lazydocker reports connection problems itself.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Could not find "lazydocker" on your PATH` | Install lazydocker, or set `PI_LAZYDOCKER_COMMAND` to its absolute path. The message lists the install commands for your OS. |
| `Overlay unavailable (...); opening lazydocker fullscreen.` | The prebuilt PTY binary for your platform didn't load. Fullscreen keeps working. Reinstall the package or [open an issue](https://github.com/ahernand53/pi-lazydocker/issues) with the message. |
| lazydocker exits right away | It usually can't reach the Docker daemon. Fullscreen mode keeps the error on screen until you press a key. On WSL, make sure Docker Desktop's WSL integration (or the Docker service) is running. |
| `alt+l` does nothing | Your terminal may intercept Alt. In Windows Terminal or iTerm2, check that Alt/Option sends Meta/Esc+, or pick another key with `PI_LAZYDOCKER_KEY`. |

## How it works

- **Overlay:** lazydocker runs in a pseudo-terminal ([`@lydell/node-pty`](https://www.npmjs.com/package/@lydell/node-pty), prebuilt for Linux, macOS and Windows on x64 and arm64, with no compiler needed). Its output feeds a headless terminal emulator ([`@xterm/headless`](https://www.npmjs.com/package/@xterm/headless)), and each frame is drawn into a Pi overlay component. Keystrokes from Pi's enhanced keyboard protocols (kitty, modifyOtherKeys) are translated back to the classic sequences lazydocker understands.
- **Fullscreen:** Pi's TUI is paused, lazydocker inherits the real terminal, and Pi redraws when it exits. lazydocker runs asynchronously, so the agent isn't blocked.

## Development

```bash
git clone https://github.com/ahernand53/pi-lazydocker.git
cd pi-lazydocker
npm install
npm run check        # typecheck + tests
pi -e .              # try it in Pi without installing
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

- [lazydocker](https://github.com/jesseduffield/lazydocker) by Jesse Duffield. This package only embeds it.
- Ideas from [@joelazar/lazygit](https://github.com/joelazar/pi-lazygit) and [@rexkit/pi-lazygit](https://github.com/Rexkit/pi-lazygit).

## License

[MIT](LICENSE) © Asdrubal Hernandez
