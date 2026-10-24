# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-24

### Added

- `/lazydocker` command and `alt+l` shortcut that open lazydocker inside Pi.
- Overlay mode: a themed floating window backed by a pseudo-terminal and a headless terminal emulator. `ctrl+q` closes it and `ctrl+o` reopens lazydocker in fullscreen.
- Fullscreen mode: pauses Pi's TUI, gives lazydocker the whole terminal, and restores Pi on exit. A non-zero exit stays on screen until a key is pressed.
- Automatic fallback from overlay to fullscreen when the PTY module can't load or the terminal is too small.
- Preflight checks with OS-specific install hints when lazydocker is missing.
- Configuration through `PI_LAZYDOCKER_KEY`, `PI_LAZYDOCKER_MODE`, `PI_LAZYDOCKER_WIDTH`, `PI_LAZYDOCKER_HEIGHT` and `PI_LAZYDOCKER_COMMAND`.
