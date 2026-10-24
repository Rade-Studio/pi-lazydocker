/**
 * Fullscreen mode: suspend Pi's TUI, hand the terminal to lazydocker, restore.
 *
 * lazydocker is spawned asynchronously so the agent keeps working in the
 * background; pi-tui skips renders while stopped.
 */

import { spawn } from "node:child_process";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

export interface FullscreenOptions {
  executable: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
}

export type FullscreenResult = { code: number | null; signal: NodeJS.Signals | null } | { error: string };

/** Streams used while Pi is suspended; injectable for tests. */
export interface FullscreenIO {
  stdin: Pick<NodeJS.ReadStream, "on" | "off" | "resume" | "pause"> & { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown };
  stdout: Pick<NodeJS.WriteStream, "write">;
}

const NOOP: Component = { render: () => [], invalidate: () => {} };

export function runFullscreen(ctx: Pick<ExtensionContext, "ui">, options: FullscreenOptions, io?: FullscreenIO): Promise<FullscreenResult> {
  return ctx.ui.custom<FullscreenResult>((tui, _theme, _keybindings, done) => {
    void runSuspended(tui, options, io ?? { stdin: process.stdin, stdout: process.stdout }).then(done);
    return NOOP;
  });
}

/** Run lazydocker with Pi stopped; never rejects. */
export async function runSuspended(tui: Pick<TUI, "stop" | "start" | "requestRender">, options: FullscreenOptions, io: FullscreenIO): Promise<FullscreenResult> {
  let result: FullscreenResult;
  try {
    tui.stop();
    io.stdout.write("\x1b[2J\x1b[H");
    result = await spawnInherit(options);
    const message = "error" in result
      ? `Could not start lazydocker: ${result.error}`
      : result.code !== 0 ? `lazydocker exited with code ${result.code ?? result.signal}.` : undefined;
    if (message) {
      io.stdout.write(`\r\n${message} Press any key to return to Pi.\r\n`);
      await waitForKey(io.stdin);
    }
  } catch (error) {
    result = { error: error instanceof Error ? error.message : String(error) };
  }
  try {
    tui.start();
    tui.requestRender(true);
  } catch {
    // Pi will redraw on the next event.
  }
  return result;
}

function spawnInherit({ executable, args, cwd, env }: FullscreenOptions): Promise<FullscreenResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: FullscreenResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const child = spawn(executable, args, { cwd, env, stdio: "inherit" });
      child.once("error", (error) => settle({ error: error.message }));
      child.once("exit", (code, signal) => settle({ code, signal }));
    } catch (error) {
      settle({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}

function waitForKey(stdin: FullscreenIO["stdin"]): Promise<void> {
  return new Promise((resolve) => {
    const raw = stdin.isTTY === true && typeof stdin.setRawMode === "function";
    if (raw) stdin.setRawMode?.(true);
    const onData = () => {
      stdin.off("data", onData);
      if (raw) stdin.setRawMode?.(false);
      stdin.pause();
      resolve();
    };
    stdin.on("data", onData);
    stdin.resume();
  });
}
