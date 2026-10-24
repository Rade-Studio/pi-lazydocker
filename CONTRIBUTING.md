# Contributing

Thanks for helping improve pi-lazydocker! Issues and pull requests are welcome.

## Setup

```bash
npm install
npm run check   # tsc --noEmit + node --test
pi -e .         # load the working copy into Pi
```

No build step is needed: Pi loads TypeScript directly, and the tests run on Node's built-in type stripping. Two consequences:

- Import local modules with an explicit `.ts` extension.
- Use only erasable TypeScript syntax: no `enum`, no `namespace`, no constructor parameter properties.

## Project layout

| Path | Responsibility |
|---|---|
| `src/index.ts` | Extension entry: registers `/lazydocker` and the shortcut |
| `src/config.ts` | Environment configuration and command-argument parsing |
| `src/preflight.ts` | TUI-mode and binary checks, install hints |
| `src/launcher.ts` | Picks a mode and handles the fallbacks |
| `src/overlay.ts` | Floating window: PTY + headless terminal component |
| `src/terminal-render.ts` | Headless terminal buffer → ANSI lines |
| `src/input.ts` | Pi keyboard protocols → legacy terminal input |
| `src/fullscreen.ts` | Suspends Pi's TUI and runs lazydocker in the real terminal |

## Guidelines

- **Test first.** Add a failing test in `test/` before changing behavior. Tests must not need Docker or lazydocker. Use the fake PTY backend and temporary directories.
- **Keep the extension resilient.** A missing binary, a broken native module or a bad environment variable must produce a clear notification, never a crash.
- **Document what you change.** Update `README.md` (keys, flags, variables) and add an entry under `[Unreleased]` in `CHANGELOG.md`.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Manual check before a release

1. `npm run check` passes.
2. In Pi: `alt+l` opens the overlay, `ctrl+f` switches to fullscreen, `q` returns to Pi.
3. `/lazydocker --fullscreen` with Docker stopped shows the error until a key is pressed.
4. `PI_LAZYDOCKER_KEY=off pi` registers no shortcut.
