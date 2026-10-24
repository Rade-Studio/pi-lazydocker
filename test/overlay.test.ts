import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import xterm from "@xterm/headless";
import { LazydockerOverlay, type OverlayResult, type PtyBackend, type PtyLike, type PtySpawnOptions } from "../src/overlay.ts";

class FakePty implements PtyLike {
  writes: string[] = [];
  resizes: Array<[number, number]> = [];
  kills = 0;
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number }) => void> = [];
  onData(listener: (data: string) => void) {
    this.dataListeners.push(listener);
    return { dispose: () => {} };
  }
  onExit(listener: (event: { exitCode: number }) => void) {
    this.exitListeners.push(listener);
    return { dispose: () => {} };
  }
  write(data: string) {
    this.writes.push(data);
  }
  resize(cols: number, rows: number) {
    this.resizes.push([cols, rows]);
  }
  kill() {
    this.kills++;
  }
  emitData(data: string) {
    for (const listener of this.dataListeners) listener(data);
  }
  emitExit(exitCode: number) {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}

function setup(rows = 30) {
  const pty = new FakePty();
  const spawns: Array<{ file: string; args: string[]; opts: PtySpawnOptions }> = [];
  const backend: PtyBackend = {
    spawn(file, args, opts) {
      spawns.push({ file, args, opts });
      return pty;
    },
    createTerminal: (cols, rows) => new xterm.Terminal({ cols, rows, allowProposedApi: true }),
  };
  let renders = 0;
  const tui = { terminal: { rows, columns: 100 }, requestRender: () => void renders++ };
  const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
  const results: OverlayResult[] = [];
  const overlay = new LazydockerOverlay(
    tui as never,
    theme as never,
    backend,
    { executable: "/bin/lazydocker", args: ["-p", "app"], cwd: "/work/myproj", env: { PATH: "/bin" }, height: "50%" },
    (result) => results.push(result),
  );
  return { overlay, pty, spawns, results, renders: () => renders };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("LazydockerOverlay", () => {
  it("renders a framed screen with exact width, title and hints", async () => {
    const { overlay, pty, spawns } = setup();
    let lines = overlay.render(60);
    pty.emitData("hello");
    await flush();
    lines = overlay.render(60);
    assert.equal(lines.length, 15);
    for (const line of lines) assert.equal(visibleWidth(line), 60);
    assert.match(lines[0] ?? "", /^╭─ lazydocker · myproj ─+╮$/);
    assert.match(lines[1] ?? "", /^│hello +\x1b\[0m│$/);
    assert.match(lines.at(-1) ?? "", /^╰─+ ctrl\+q close · ctrl\+o fullscreen ─╯$/);
    const spawn = spawns[0];
    assert.equal(spawn?.file, "/bin/lazydocker");
    assert.deepEqual(spawn?.args, ["-p", "app"]);
    assert.equal(spawn?.opts.name, "xterm-256color");
    assert.equal(spawn?.opts.cwd, "/work/myproj");
    assert.equal(spawn?.opts.env.TERM, "xterm-256color");
    assert.equal(spawn?.opts.env.COLORTERM, "truecolor");
    assert.equal(spawn?.opts.env.PATH, "/bin");
    assert.deepEqual([spawn?.opts.cols, spawn?.opts.rows], [58, 13]);
  });

  it("resizes the pty when the inner size changes", () => {
    const { overlay, pty } = setup();
    overlay.render(60);
    overlay.render(60);
    assert.deepEqual(pty.resizes, []);
    overlay.render(80);
    assert.deepEqual(pty.resizes, [[78, 13]]);
  });

  it("requests a render when output arrives", async () => {
    const { overlay, pty, renders } = setup();
    overlay.render(60);
    const before = renders();
    pty.emitData("x");
    await flush();
    assert.ok(renders() > before);
  });

  it("ctrl+q closes and kills the pty (legacy and kitty forms)", () => {
    for (const key of ["\x11", "\x1b[113;5u"]) {
      const { overlay, pty, results } = setup();
      overlay.render(60);
      overlay.handleInput(key);
      assert.deepEqual(results, [{ action: "closed" }]);
      assert.equal(pty.kills, 1);
      assert.deepEqual(pty.writes, []);
    }
  });

  it("ctrl+o switches to fullscreen and kills the pty, in legacy and kitty form", () => {
    for (const key of ["\x0f", "\x1b[111;5u"]) {
      const { overlay, pty, results } = setup();
      overlay.render(60);
      overlay.handleInput(key);
      assert.deepEqual(results, [{ action: "fullscreen" }]);
      assert.equal(pty.kills, 1);
    }
  });

  // Pi binds ctrl+f to transcript search on Windows/WSL, so it is not an overlay control.
  it("forwards ctrl+f to lazydocker instead of treating it as a control key", () => {
    const { overlay, pty, results } = setup();
    overlay.render(60);
    overlay.handleInput("\x06");
    assert.deepEqual(pty.writes, ["\x06"]);
    assert.deepEqual(results, []);
  });

  it("forwards translated input to the pty", () => {
    const { overlay, pty, results } = setup();
    overlay.render(60);
    overlay.handleInput("\x1b[27u");
    overlay.handleInput("j");
    overlay.handleInput("\x1b[99;5u");
    overlay.handleInput("\x1b[106;1:3u");
    assert.deepEqual(pty.writes, ["\x1b", "j", "\x03"]);
    assert.deepEqual(results, []);
  });

  it("closes immediately on exit code 0", () => {
    const { overlay, pty, results } = setup();
    overlay.render(60);
    pty.emitExit(0);
    assert.deepEqual(results, [{ action: "exited", code: 0 }]);
  });

  it("keeps the screen on a non-zero exit until a key is pressed", () => {
    const { overlay, pty, results } = setup();
    overlay.render(60);
    pty.emitExit(2);
    assert.deepEqual(results, []);
    const lines = overlay.render(60);
    assert.match(lines.at(-1) ?? "", /lazydocker exited with code 2 · press any key/);
    for (const line of lines) assert.equal(visibleWidth(line), 60);
    overlay.handleInput("x");
    assert.deepEqual(results, [{ action: "exited", code: 2 }]);
    assert.deepEqual(pty.writes, []);
    overlay.handleInput("y");
    assert.equal(results.length, 1);
  });

  it("dispose kills a live pty once", () => {
    const { overlay, pty } = setup();
    overlay.render(60);
    overlay.dispose();
    overlay.dispose();
    assert.equal(pty.kills, 1);
  });

  it("dispose does not kill an exited pty", () => {
    const { overlay, pty } = setup();
    overlay.render(60);
    pty.emitExit(0);
    overlay.dispose();
    assert.equal(pty.kills, 0);
  });
});
