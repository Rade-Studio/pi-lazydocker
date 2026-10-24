import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, it } from "node:test";
import { findExecutable, installHint, preflight } from "../src/preflight.ts";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "pi-lazydocker-"));
}

function fakeBinary(dir: string, name: string, mode = 0o755): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, "#!/bin/sh\nexit 0\n");
  chmodSync(path, mode);
  return path;
}

describe("findExecutable", () => {
  it("finds a binary on PATH, first match wins", () => {
    const root = scratch();
    const first = fakeBinary(join(root, "a"), "lazydocker");
    fakeBinary(join(root, "b"), "lazydocker");
    const env = { PATH: [join(root, "missing"), join(root, "a"), join(root, "b")].join(delimiter) };
    assert.equal(findExecutable("lazydocker", env, "linux"), first);
  });

  it("ignores files that are not executable", () => {
    const root = scratch();
    fakeBinary(root, "lazydocker", 0o644);
    assert.equal(findExecutable("lazydocker", { PATH: root }, "linux"), undefined);
  });

  it("accepts an explicit path to an executable", () => {
    const root = scratch();
    const path = fakeBinary(root, "my-wrapper");
    assert.equal(findExecutable(path, { PATH: "" }, "linux"), path);
    assert.equal(findExecutable(join(root, "nope"), { PATH: "" }, "linux"), undefined);
  });

  it("returns undefined when PATH is empty or unset", () => {
    assert.equal(findExecutable("lazydocker", {}, "linux"), undefined);
  });

  it("tries PATHEXT extensions on Windows", () => {
    const root = scratch();
    const path = fakeBinary(root, "lazydocker.EXE");
    assert.equal(findExecutable("lazydocker", { Path: root, PATHEXT: ".COM;.EXE" }, "win32"), path);
  });
});

describe("installHint", () => {
  it("gives platform-specific install commands", () => {
    assert.match(installHint("darwin"), /brew install lazydocker/);
    assert.match(installHint("linux"), /brew install lazydocker/);
    assert.match(installHint("linux"), /go install github\.com\/jesseduffield\/lazydocker@latest/);
    assert.match(installHint("win32"), /scoop install lazydocker/);
    assert.match(installHint("win32"), /choco install lazydocker/);
  });
});

describe("preflight", () => {
  it("refuses outside the interactive TUI", () => {
    const result = preflight({ mode: "print", command: "lazydocker", env: {}, platform: "linux" });
    assert.deepEqual(result, {
      ok: false,
      reason: "no-tui",
      message: "lazydocker needs Pi's interactive terminal; it is unavailable in print mode.",
    });
  });

  it("explains how to install a missing binary", () => {
    const result = preflight({ mode: "tui", command: "lazydocker", env: { PATH: scratch() }, platform: "darwin" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "missing-binary");
    assert.equal(
      result.ok === false && result.message,
      `Could not find "lazydocker" on your PATH.\n${installHint("darwin")}\nOr point PI_LAZYDOCKER_COMMAND at the binary.`,
    );
  });

  it("returns the resolved executable when everything is ready", () => {
    const root = scratch();
    const path = fakeBinary(root, "lazydocker");
    assert.deepEqual(preflight({ mode: "tui", command: "lazydocker", env: { PATH: root }, platform: "linux" }), {
      ok: true,
      executable: path,
    });
  });
});
