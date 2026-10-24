/**
 * Decide how to open lazydocker: overlay when possible, fullscreen otherwise.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { LaunchMode, LazydockerConfig } from "./config.ts";
import { runFullscreen, type FullscreenOptions, type FullscreenResult } from "./fullscreen.ts";
import { LazydockerOverlay, loadPtyBackend, type BackendLoadResult, type OverlayResult } from "./overlay.ts";
import { preflight } from "./preflight.ts";

type Env = Record<string, string | undefined>;
type LaunchContext = Pick<ExtensionContext, "mode" | "cwd" | "ui">;

export const MIN_OVERLAY_COLUMNS = 60;
export const MIN_OVERLAY_ROWS = 15;

export interface LauncherDeps {
  env: Env;
  loadBackend: () => Promise<BackendLoadResult>;
  runFullscreen: (ctx: LaunchContext, options: FullscreenOptions) => Promise<FullscreenResult>;
  terminalSize: () => { rows: number; columns: number };
}

const defaultDeps = (): LauncherDeps => ({
  env: process.env,
  loadBackend: loadPtyBackend,
  runFullscreen: (ctx, options) => runFullscreen(ctx, options),
  terminalSize: () => ({ rows: process.stdout.rows ?? 24, columns: process.stdout.columns ?? 80 }),
});

export interface LaunchRequest {
  mode: LaunchMode;
  args: string[];
}

export async function openLazydocker(ctx: LaunchContext, config: LazydockerConfig, request: LaunchRequest, deps: Partial<LauncherDeps> = {}): Promise<void> {
  const { env, loadBackend, runFullscreen: fullscreen, terminalSize } = { ...defaultDeps(), ...deps };
  try {
    const check = preflight({ mode: ctx.mode, command: config.command, env });
    if (!check.ok) {
      ctx.ui.notify(check.message, "error");
      return;
    }
    const options: FullscreenOptions = { executable: check.executable, args: request.args, cwd: ctx.cwd, env };
    if (request.mode === "fullscreen") {
      await fullscreen(ctx, options);
      return;
    }

    const loaded = await loadBackend();
    if (!loaded.ok) {
      ctx.ui.notify(`Overlay unavailable (${loaded.error}); opening lazydocker fullscreen.`, "warning");
      await fullscreen(ctx, options);
      return;
    }

    const { rows, columns } = terminalSize();
    if (columns < MIN_OVERLAY_COLUMNS || rows < MIN_OVERLAY_ROWS) {
      ctx.ui.notify(`Terminal is too small for the overlay (${columns}x${rows}, needs ${MIN_OVERLAY_COLUMNS}x${MIN_OVERLAY_ROWS}); opening lazydocker fullscreen.`, "info");
      await fullscreen(ctx, options);
      return;
    }

    const result = await ctx.ui.custom<OverlayResult>(
      (tui, theme, _keybindings, done) => new LazydockerOverlay(tui, theme, loaded.backend, { ...options, height: config.height }, done),
      { overlay: true, overlayOptions: { width: config.width, maxHeight: config.height, anchor: "center", margin: 1 } },
    );
    if (result?.action === "fullscreen") await fullscreen(ctx, options);
  } catch (error) {
    ctx.ui.notify(`lazydocker failed: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}
