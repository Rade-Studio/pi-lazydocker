import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { resolveConfig } from "../src/config.ts";
import { createExtension } from "../src/index.ts";
import { openLazydocker, type LauncherDeps } from "../src/launcher.ts";

const dir = mkdtempSync(join(tmpdir(), "pi-lazydocker-launcher-"));
const binary = join(dir, "lazydocker");
writeFileSync(binary, "#!/bin/sh\nexit 0\n");
chmodSync(binary, 0o755);
after(() => rmSync(dir, { recursive: true, force: true }));

const env = { PATH: dir };

function fakeCtx({ mode = "tui", rows = 40, columns = 120, overlayResult = { action: "closed" } as unknown } = {}) {
  const notes: Array<[string, string | undefined]> = [];
  const customCalls: unknown[] = [];
  const ctx = {
    mode,
    cwd: "/work/proj",
    ui: {
      notify: (message: string, type?: string) => void notes.push([message, type]),
      custom: (factory: (...args: unknown[]) => unknown, opts?: unknown) => {
        customCalls.push(opts);
        const tui = { terminal: { rows, columns }, requestRender: () => {} };
        factory(tui, { fg: (_: string, t: string) => t, bold: (t: string) => t }, {}, () => {});
        return Promise.resolve(overlayResult);
      },
    },
  };
  return { ctx: ctx as never, notes, customCalls, size: { rows, columns } };
}

function deps(overrides: Partial<LauncherDeps> = {}) {
  const fullscreen: unknown[] = [];
  const base: LauncherDeps = {
    env,
    loadBackend: async () => ({
      ok: true,
      backend: {
        spawn: () => ({ onData: () => {}, onExit: () => {}, write: () => {}, resize: () => {}, kill: () => {} }),
        createTerminal: () => ({ write: () => {}, resize: () => {}, dispose: () => {} }) as never,
      },
    }),
    runFullscreen: async (_ctx, options) => {
      fullscreen.push(options);
      return { code: 0, signal: null };
    },
    terminalSize: () => ({ rows: 40, columns: 120 }),
    ...overrides,
  };
  return { deps: base, fullscreen };
}

const { config } = resolveConfig({});
config.command = binary;

describe("openLazydocker", () => {
  it("opens the overlay with the configured size options", async () => {
    const { ctx, customCalls } = fakeCtx();
    const { deps: d, fullscreen } = deps();
    await openLazydocker(ctx, config, { mode: "overlay", args: ["-p", "x"] }, d);
    assert.deepEqual(customCalls, [{ overlay: true, overlayOptions: { width: "92%", maxHeight: "90%", anchor: "center", margin: 1 } }]);
    assert.equal(fullscreen.length, 0);
  });

  it("falls back to fullscreen with a warning when the backend fails to load", async () => {
    const { ctx, notes, customCalls } = fakeCtx();
    const { deps: d, fullscreen } = deps({ loadBackend: async () => ({ ok: false, error: "no prebuilt binary" }) });
    await openLazydocker(ctx, config, { mode: "overlay", args: [] }, d);
    assert.deepEqual(notes, [["Overlay unavailable (no prebuilt binary); opening lazydocker fullscreen.", "warning"]]);
    assert.equal(customCalls.length, 0);
    assert.deepEqual(fullscreen, [{ executable: binary, args: [], cwd: "/work/proj", env }]);
  });

  it("shows only the first line of a multi-line backend error", async () => {
    const { ctx, notes } = fakeCtx();
    const { deps: d } = deps({ loadBackend: async () => ({ ok: false, error: "could not find the platform package\n  at require (x)\n  more" }) });
    await openLazydocker(ctx, config, { mode: "overlay", args: [] }, d);
    assert.deepEqual(notes, [["Overlay unavailable (could not find the platform package); opening lazydocker fullscreen.", "warning"]]);
  });

  it("warns with the reason when the overlay could not start lazydocker", async () => {
    const { ctx, notes } = fakeCtx({ overlayResult: { action: "fullscreen", reason: "conpty unavailable" } });
    const { deps: d, fullscreen } = deps();
    await openLazydocker(ctx, config, { mode: "overlay", args: [] }, d);
    assert.deepEqual(notes, [["Overlay could not start lazydocker (conpty unavailable); opening it fullscreen.", "warning"]]);
    assert.equal(fullscreen.length, 1);
  });

  it("falls back to fullscreen when the terminal is too small", async () => {
    const { ctx, notes } = fakeCtx();
    const { deps: d, fullscreen } = deps({ terminalSize: () => ({ rows: 14, columns: 100 }) });
    await openLazydocker(ctx, config, { mode: "overlay", args: [] }, d);
    assert.equal(fullscreen.length, 1);
    assert.equal(notes[0]?.[1], "info");
    assert.match(notes[0]?.[0] ?? "", /too small/);
  });

  it("switches to fullscreen when the overlay asks for it", async () => {
    const { ctx } = fakeCtx({ overlayResult: { action: "fullscreen" } });
    const { deps: d, fullscreen } = deps();
    await openLazydocker(ctx, config, { mode: "overlay", args: ["-p", "x"] }, d);
    assert.deepEqual(fullscreen, [{ executable: binary, args: ["-p", "x"], cwd: "/work/proj", env }]);
  });

  it("runs fullscreen mode directly", async () => {
    const { ctx, customCalls } = fakeCtx();
    const { deps: d, fullscreen } = deps();
    await openLazydocker(ctx, config, { mode: "fullscreen", args: [] }, d);
    assert.equal(fullscreen.length, 1);
    assert.equal(customCalls.length, 0);
  });

  it("notifies preflight failures and launches nothing", async () => {
    const { ctx, notes, customCalls } = fakeCtx({ mode: "rpc" });
    const { deps: d, fullscreen } = deps();
    await openLazydocker(ctx, config, { mode: "overlay", args: [] }, d);
    assert.deepEqual(notes, [["lazydocker needs Pi's interactive terminal; it is unavailable in rpc mode.", "error"]]);
    assert.equal(customCalls.length + fullscreen.length, 0);
  });

  it("notifies unexpected errors", async () => {
    const { ctx, notes } = fakeCtx();
    const { deps: d } = deps({ runFullscreen: async () => Promise.reject(new Error("boom")) });
    await openLazydocker(ctx, config, { mode: "fullscreen", args: [] }, d);
    assert.deepEqual(notes, [["lazydocker failed: boom", "error"]]);
  });
});

function fakePi() {
  const commands = new Map<string, { description?: string; handler: (args: string, ctx: unknown) => unknown }>();
  const shortcuts = new Map<string, { description?: string; handler: (ctx: unknown) => unknown }>();
  const pi = {
    registerCommand: (name: string, options: { description?: string; handler: (args: string, ctx: unknown) => unknown }) => void commands.set(name, options),
    registerShortcut: (key: string, options: { description?: string; handler: (ctx: unknown) => unknown }) => void shortcuts.set(key, options),
  };
  return { pi: pi as never, commands, shortcuts };
}

describe("extension entry", () => {
  it("registers the command and alt+l by default", () => {
    const { pi, commands, shortcuts } = fakePi();
    createExtension({})(pi);
    assert.equal(commands.get("lazydocker")?.description, "Open lazydocker (overlay or fullscreen)");
    assert.deepEqual([...shortcuts.keys()], ["alt+l"]);
    assert.equal(shortcuts.get("alt+l")?.description, "Open lazydocker");
  });

  it("uses PI_LAZYDOCKER_KEY for the shortcut", () => {
    const { pi, shortcuts } = fakePi();
    createExtension({ PI_LAZYDOCKER_KEY: "ctrl+alt+d" })(pi);
    assert.deepEqual([...shortcuts.keys()], ["ctrl+alt+d"]);
  });

  it("registers no shortcut when PI_LAZYDOCKER_KEY=off", () => {
    const { pi, shortcuts, commands } = fakePi();
    createExtension({ PI_LAZYDOCKER_KEY: "off" })(pi);
    assert.equal(shortcuts.size, 0);
    assert.ok(commands.has("lazydocker"));
  });

  it("shows usage for --help without launching", async () => {
    const { pi, commands } = fakePi();
    const opened: unknown[] = [];
    createExtension({}, async (...args) => void opened.push(args))(pi);
    const { ctx, notes } = fakeCtx();
    await commands.get("lazydocker")?.handler("--help", ctx);
    assert.equal(notes.length, 1);
    assert.match(notes[0]?.[0] ?? "", /^Usage: \/lazydocker/);
    assert.equal(notes[0]?.[1], "info");
    assert.equal(opened.length, 0);
  });

  it("reports parse errors with usage", async () => {
    const { pi, commands } = fakePi();
    const opened: unknown[] = [];
    createExtension({}, async (...args) => void opened.push(args))(pi);
    const { ctx, notes } = fakeCtx();
    await commands.get("lazydocker")?.handler("--overlay --fullscreen", ctx);
    assert.equal(notes[0]?.[1], "error");
    assert.match(notes[0]?.[0] ?? "", /^Use either --overlay or --fullscreen, not both\.\n\nUsage:/);
    assert.equal(opened.length, 0);
  });

  it("opens with the flag mode or the configured mode, warning once about config", async () => {
    const { pi, commands, shortcuts } = fakePi();
    const opened: Array<{ mode: string; args: string[] }> = [];
    createExtension({ PI_LAZYDOCKER_MODE: "bogus" }, async (_ctx, _config, request) => void opened.push(request))(pi);
    const { ctx, notes } = fakeCtx();
    await commands.get("lazydocker")?.handler("-F -p app", ctx);
    await shortcuts.get("alt+l")?.handler(ctx);
    assert.deepEqual(opened, [{ mode: "fullscreen", args: ["-p", "app"] }, { mode: "overlay", args: [] }]);
    assert.equal(notes.filter(([, type]) => type === "warning").length, 1);
    assert.match(notes[0]?.[0] ?? "", /PI_LAZYDOCKER_MODE="bogus"/);
  });
});
