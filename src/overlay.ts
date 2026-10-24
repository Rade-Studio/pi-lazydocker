/**
 * Floating overlay: lazydocker runs in a pseudo-terminal, its output is fed
 * into a headless xterm screen model, and that screen is drawn inside a
 * themed frame. The native pieces are loaded lazily so a broken install
 * degrades to fullscreen instead of crashing Pi.
 */

import { basename } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, type Component, type Focusable, type TUI } from "@earendil-works/pi-tui";
import type { Terminal } from "@xterm/headless";
import type { SizeValue } from "./config.ts";
import { toLegacyInput } from "./input.ts";
import { renderScreen } from "./terminal-render.ts";

export interface PtySpawnOptions {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
}

/** The subset of a node-pty `IPty` the overlay uses. */
export interface PtyLike {
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (event: { exitCode: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export interface PtyBackend {
  spawn(file: string, args: string[], opts: PtySpawnOptions): PtyLike;
  createTerminal(cols: number, rows: number): Terminal;
}

export type BackendLoadResult = { ok: true; backend: PtyBackend } | { ok: false; error: string };

/** Load `@lydell/node-pty` and `@xterm/headless` on demand. */
export async function loadPtyBackend(): Promise<BackendLoadResult> {
  try {
    const pty = await import("@lydell/node-pty");
    const xterm = await import("@xterm/headless");
    const spawn = pty.spawn ?? (pty as unknown as { default: typeof pty }).default.spawn;
    const XTerminal = xterm.default.Terminal;
    return {
      ok: true,
      backend: {
        spawn: (file, args, opts) => spawn(file, args, opts),
        createTerminal: (cols, rows) => new XTerminal({ cols, rows, allowProposedApi: true, scrollback: 0 }),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export type OverlayResult = { action: "closed" } | { action: "fullscreen"; reason?: string } | { action: "exited"; code: number };

export interface OverlayOptions {
  executable: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  /** Overlay height option, resolved against the terminal rows. */
  height: SizeValue;
}

const HINT = "ctrl+q close · ctrl+o fullscreen";
const MIN_INNER_COLS = 10;
const MIN_INNER_ROWS = 3;

export class LazydockerOverlay implements Component, Focusable {
  focused = false;
  private pty: PtyLike | undefined;
  private terminal: Terminal | undefined;
  private cols = 0;
  private rows = 0;
  private exitCode: number | undefined;
  private finished = false;
  private disposed = false;
  private alive = false;
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly backend: PtyBackend;
  private readonly options: OverlayOptions;
  private readonly done: (result: OverlayResult) => void;

  constructor(tui: TUI, theme: Theme, backend: PtyBackend, options: OverlayOptions, done: (result: OverlayResult) => void) {
    this.tui = tui;
    this.theme = theme;
    this.backend = backend;
    this.options = options;
    this.done = done;
  }

  render(width: number): string[] {
    const cols = Math.max(MIN_INNER_COLS, width - 2);
    const rows = this.innerRows();
    this.ensureSize(cols, rows);

    const border = (text: string) => this.theme.fg("borderAccent", text);
    const screen = this.terminal ? renderScreen(this.terminal) : [];
    const lines = [this.topBorder(cols)];
    for (let row = 0; row < rows; row++) {
      lines.push(border("│") + (screen[row] ?? " ".repeat(cols)) + border("│"));
    }
    lines.push(this.bottomBorder(cols));
    return lines.map((line) => fit(line, width));
  }

  handleInput(data: string): void {
    if (this.finished) return;
    if (this.exitCode !== undefined) {
      this.finish({ action: "exited", code: this.exitCode });
      return;
    }
    if (matchesKey(data, "ctrl+q")) {
      this.finish({ action: "closed" });
      return;
    }
    if (matchesKey(data, "ctrl+o")) {
      this.finish({ action: "fullscreen" });
      return;
    }
    const bytes = toLegacyInput(data);
    if (bytes) this.pty?.write(bytes);
  }

  invalidate(): void {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.killPty();
    this.terminal?.dispose();
  }

  private innerRows(): number {
    const total = this.tui.terminal.rows;
    const height = this.options.height;
    const requested = typeof height === "number" ? height : Math.floor((total * Number.parseFloat(height)) / 100);
    return Math.max(MIN_INNER_ROWS, Math.min(requested, total - 2) - 2);
  }

  private ensureSize(cols: number, rows: number): void {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    if (!this.pty) {
      this.start(cols, rows);
      return;
    }
    this.terminal?.resize(cols, rows);
    if (this.alive) this.pty.resize(cols, rows);
  }

  private start(cols: number, rows: number): void {
    const { executable, args, cwd, env } = this.options;
    this.terminal = this.backend.createTerminal(cols, rows);
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) if (value !== undefined) cleanEnv[key] = value;
    cleanEnv.TERM = "xterm-256color";
    cleanEnv.COLORTERM = "truecolor";

    let pty: PtyLike;
    try {
      pty = this.backend.spawn(executable, args, { name: "xterm-256color", cols, rows, cwd, env: cleanEnv });
    } catch (error) {
      // Called from render(): finish outside the render pass and let the launcher fall back.
      const reason = error instanceof Error ? error.message : String(error);
      queueMicrotask(() => this.finish({ action: "fullscreen", reason }));
      return;
    }
    this.pty = pty;
    this.alive = true;
    pty.onData((data) => {
      if (this.disposed) return;
      this.terminal?.write(data, () => this.tui.requestRender());
    });
    pty.onExit(({ exitCode }) => {
      this.alive = false;
      if (this.finished || this.disposed) return;
      this.exitCode = exitCode;
      if (exitCode === 0) this.finish({ action: "exited", code: 0 });
      else this.tui.requestRender();
    });
  }

  private finish(result: OverlayResult): void {
    if (this.finished) return;
    this.finished = true;
    this.killPty();
    this.done(result);
  }

  private killPty(): void {
    if (!this.pty || !this.alive) return;
    this.alive = false;
    try {
      this.pty.kill();
    } catch {
      // Already gone.
    }
  }

  private topBorder(cols: number): string {
    const { theme } = this;
    const title = truncateToWidth(` lazydocker · ${basename(this.options.cwd) || this.options.cwd} `, Math.max(0, cols - 2), "…");
    const rest = Math.max(0, cols - 1 - visibleWidth(title));
    return theme.fg("borderAccent", "╭─") + theme.fg("accent", theme.bold(title)) + theme.fg("borderAccent", "─".repeat(rest) + "╮");
  }

  private bottomBorder(cols: number): string {
    const { theme } = this;
    const failed = this.exitCode !== undefined && this.exitCode !== 0 && !this.finished;
    const text = failed ? ` lazydocker exited with code ${this.exitCode} · press any key ` : ` ${HINT} `;
    const label = truncateToWidth(text, Math.max(0, cols - 2), "…");
    const rest = Math.max(0, cols - 1 - visibleWidth(label));
    const styled = failed ? theme.fg("error", label) : theme.fg("muted", label);
    return theme.fg("borderAccent", "╰" + "─".repeat(rest)) + styled + theme.fg("borderAccent", "─╯");
  }
}

/** Clamp or pad a styled line to exactly `width` columns. */
function fit(line: string, width: number): string {
  const current = visibleWidth(line);
  if (current > width) return truncateToWidth(line, width, "");
  return current < width ? line + " ".repeat(width - current) : line;
}
