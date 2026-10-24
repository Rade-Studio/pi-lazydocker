import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SHORTCUT, parseCommandArgs, resolveConfig } from "../src/config.ts";

describe("resolveConfig", () => {
  it("uses documented defaults when no variable is set", () => {
    const { config, warnings } = resolveConfig({});
    assert.deepEqual(config, {
      command: "lazydocker",
      mode: "overlay",
      shortcut: "alt+l",
      width: "92%",
      height: "90%",
    });
    assert.equal(DEFAULT_SHORTCUT, "alt+l");
    assert.deepEqual(warnings, []);
  });

  it("reads every variable when valid", () => {
    const { config, warnings } = resolveConfig({
      PI_LAZYDOCKER_COMMAND: " /opt/bin/lazydocker ",
      PI_LAZYDOCKER_MODE: "Fullscreen",
      PI_LAZYDOCKER_KEY: " ctrl+alt+d ",
      PI_LAZYDOCKER_WIDTH: "120",
      PI_LAZYDOCKER_HEIGHT: "75%",
    });
    assert.deepEqual(config, {
      command: "/opt/bin/lazydocker",
      mode: "fullscreen",
      shortcut: "ctrl+alt+d",
      width: 120,
      height: "75%",
    });
    assert.deepEqual(warnings, []);
  });

  it("disables the shortcut with an empty value or off", () => {
    assert.equal(resolveConfig({ PI_LAZYDOCKER_KEY: "" }).config.shortcut, undefined);
    assert.equal(resolveConfig({ PI_LAZYDOCKER_KEY: "  " }).config.shortcut, undefined);
    assert.equal(resolveConfig({ PI_LAZYDOCKER_KEY: "OFF" }).config.shortcut, undefined);
  });

  it("falls back to defaults and warns on invalid values", () => {
    const { config, warnings } = resolveConfig({
      PI_LAZYDOCKER_COMMAND: "   ",
      PI_LAZYDOCKER_MODE: "popup",
      PI_LAZYDOCKER_WIDTH: "0",
      PI_LAZYDOCKER_HEIGHT: "150%",
    });
    assert.equal(config.command, "lazydocker");
    assert.equal(config.mode, "overlay");
    assert.equal(config.width, "92%");
    assert.equal(config.height, "90%");
    assert.deepEqual(warnings, [
      'PI_LAZYDOCKER_MODE="popup" is not "overlay" or "fullscreen"; using "overlay".',
      'PI_LAZYDOCKER_WIDTH="0" is not a positive number of cells or a 1-100% percentage; using "92%".',
      'PI_LAZYDOCKER_HEIGHT="150%" is not a positive number of cells or a 1-100% percentage; using "90%".',
    ]);
  });
});

describe("parseCommandArgs", () => {
  it("returns no mode and no arguments for empty input", () => {
    assert.deepEqual(parseCommandArgs(""), { ok: true, mode: undefined, help: false, args: [] });
    assert.deepEqual(parseCommandArgs("   "), { ok: true, mode: undefined, help: false, args: [] });
  });

  it("recognizes mode flags and their short forms", () => {
    assert.deepEqual(parseCommandArgs("--fullscreen"), { ok: true, mode: "fullscreen", help: false, args: [] });
    assert.deepEqual(parseCommandArgs("-F"), { ok: true, mode: "fullscreen", help: false, args: [] });
    assert.deepEqual(parseCommandArgs("--overlay"), { ok: true, mode: "overlay", help: false, args: [] });
    assert.deepEqual(parseCommandArgs("-O"), { ok: true, mode: "overlay", help: false, args: [] });
  });

  it("recognizes help", () => {
    assert.deepEqual(parseCommandArgs("--help"), { ok: true, mode: undefined, help: true, args: [] });
    assert.deepEqual(parseCommandArgs("-h"), { ok: true, mode: undefined, help: true, args: [] });
  });

  it("forwards other arguments to lazydocker, honoring quotes", () => {
    assert.deepEqual(parseCommandArgs(`-F -f "docker compose.yml" -p 'my app'`), {
      ok: true,
      mode: "fullscreen",
      help: false,
      args: ["-f", "docker compose.yml", "-p", "my app"],
    });
  });

  it("forwards everything after -- verbatim", () => {
    assert.deepEqual(parseCommandArgs("-- --help -F"), {
      ok: true,
      mode: undefined,
      help: false,
      args: ["--help", "-F"],
    });
  });

  it("rejects conflicting mode flags", () => {
    assert.deepEqual(parseCommandArgs("--overlay --fullscreen"), {
      ok: false,
      error: "Use either --overlay or --fullscreen, not both.",
    });
  });

  it("rejects an unterminated quote", () => {
    assert.deepEqual(parseCommandArgs(`-f "compose.yml`), {
      ok: false,
      error: "Unterminated quote in arguments.",
    });
  });
});
