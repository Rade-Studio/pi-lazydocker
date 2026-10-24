import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import xterm from "@xterm/headless";
import { renderLine, renderScreen } from "../src/terminal-render.ts";

async function term(data: string, cols = 20, rows = 3) {
  const terminal = new xterm.Terminal({ cols, rows, allowProposedApi: true });
  await new Promise<void>((resolve) => terminal.write(data, resolve));
  return terminal;
}

describe("renderScreen", () => {
  it("renders every row at exactly cols visible width", async () => {
    const terminal = await term("hello\r\nworld");
    const lines = renderScreen(terminal);
    assert.equal(lines.length, 3);
    for (const line of lines) assert.equal(visibleWidth(line), 20);
    assert.ok(lines[0]?.startsWith("hello"));
    assert.ok(lines[0]?.endsWith("\x1b[0m"));
  });

  it("emits SGR attributes", async () => {
    const terminal = await term("\x1b[1mB\x1b[0m\x1b[2mD\x1b[0m\x1b[3mI\x1b[0m\x1b[4mU\x1b[0m\x1b[7mR\x1b[0m\x1b[9mS\x1b[0m\x1b[8mH\x1b[0m");
    const line = renderLine(terminal, 0);
    for (const code of ["1", "2", "3", "4", "7", "9", "8"]) {
      assert.match(line, new RegExp(`\\x1b\\[0;${code}m`), `missing SGR ${code}`);
    }
  });

  it("emits 16-color, 256-color and truecolor fg/bg", async () => {
    const terminal = await term("\x1b[31ma\x1b[94mb\x1b[42mc\x1b[0m\x1b[38;5;200md\x1b[48;5;17me\x1b[0m\x1b[38;2;1;2;3mf\x1b[48;2;4;5;6mg");
    const line = renderLine(terminal, 0);
    assert.match(line, /\x1b\[0;31ma/);
    assert.match(line, /\x1b\[0;94mb/);
    assert.match(line, /\x1b\[0;94;42mc/);
    assert.match(line, /\x1b\[0;38;5;200md/);
    assert.match(line, /\x1b\[0;38;5;200;48;5;17me/);
    assert.match(line, /\x1b\[0;38;2;1;2;3mf/);
    assert.match(line, /\x1b\[0;38;2;1;2;3;48;2;4;5;6mg/);
    assert.equal(visibleWidth(line), 20);
  });

  it("skips continuation cells of wide characters", async () => {
    const terminal = await term("中文x", 10, 1);
    const line = renderLine(terminal, 0);
    assert.ok(line.startsWith("中文x"));
    assert.equal(visibleWidth(line), 10);
  });

  it("pads missing rows to the width", async () => {
    const terminal = await term("", 5, 2);
    assert.deepEqual(renderScreen(terminal).map((line) => visibleWidth(line)), [5, 5]);
  });
});
