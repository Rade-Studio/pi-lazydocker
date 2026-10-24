import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { runFullscreen, runSuspended, type FullscreenIO } from "../src/fullscreen.ts";

function fakes() {
  const calls: string[] = [];
  const tui = {
    stop: () => void calls.push("stop"),
    start: () => void calls.push("start"),
    requestRender: (force?: boolean) => void calls.push(`render:${force}`),
  };
  const output: string[] = [];
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    raw: [] as boolean[],
    setRawMode(mode: boolean) {
      this.raw.push(mode);
    },
    resume: () => void calls.push("resume"),
    pause: () => void calls.push("pause"),
  });
  const io = { stdin, stdout: { write: (text: string) => output.push(text) } } as unknown as FullscreenIO;
  return { calls, tui, output, stdin, io };
}

// Node itself is the child process so the tests run on every CI platform.
const options = (script: string) => ({ executable: process.execPath, args: ["-e", script], cwd: process.cwd(), env: { ...process.env } });

describe("runSuspended", () => {
  it("stops, runs, restarts and forces a render on exit 0", async () => {
    const { calls, tui, output, io } = fakes();
    const result = await runSuspended(tui, options("process.exit(0)"), io);
    assert.deepEqual(result, { code: 0, signal: null });
    assert.deepEqual(calls, ["stop", "start", "render:true"]);
    assert.equal(output[0], "\x1b[2J\x1b[H");
  });

  it("waits for a key in raw mode after a non-zero exit", async () => {
    const { calls, tui, output, stdin, io } = fakes();
    const pending = runSuspended(tui, options("process.exit(3)"), io);
    while (!calls.includes("resume")) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.match(output.join(""), /lazydocker exited with code 3\. Press any key to return to Pi\./);
    assert.ok(!calls.includes("start"));
    stdin.emit("data", Buffer.from("x"));
    assert.deepEqual(await pending, { code: 3, signal: null });
    assert.deepEqual(stdin.raw, [true, false]);
    assert.deepEqual(calls.slice(-2), ["start", "render:true"]);
  });

  it("reports a spawn error and still restores", async () => {
    const { calls, tui, output, stdin, io } = fakes();
    const pending = runSuspended(tui, { ...options(""), executable: "/nonexistent/lazydocker" }, io);
    while (!calls.includes("resume")) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.match(output.join(""), /Could not start lazydocker: .*ENOENT/);
    stdin.emit("data", "x");
    const result = await pending;
    assert.ok("error" in result);
    assert.deepEqual(calls.slice(-2), ["start", "render:true"]);
  });
});

describe("runFullscreen", () => {
  it("uses a non-overlay custom component and resolves with the result", async () => {
    const { tui, io } = fakes();
    let customOptions: unknown = "unset";
    const ctx = {
      ui: {
        custom: (factory: (...args: unknown[]) => unknown, opts?: unknown) => {
          customOptions = opts;
          return new Promise((resolve) => {
            const component = factory(tui, {}, {}, resolve) as { render(width: number): string[] };
            assert.deepEqual(component.render(80), []);
          });
        },
      },
    };
    const result = await runFullscreen(ctx as never, options("process.exit(0)"), io);
    assert.deepEqual(result, { code: 0, signal: null });
    assert.equal(customOptions, undefined);
  });
});
