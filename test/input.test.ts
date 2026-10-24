import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toLegacyInput } from "../src/input.ts";

const cases: Array<[string, string, string]> = [
  ["kitty escape", "\x1b[27u", "\x1b"],
  ["kitty enter", "\x1b[13u", "\r"],
  ["kitty tab", "\x1b[9u", "\t"],
  ["kitty shift+tab", "\x1b[9;2u", "\x1b[Z"],
  ["kitty backspace", "\x1b[127u", "\x7f"],
  ["kitty alt+backspace", "\x1b[127;3u", "\x1b\x7f"],
  ["kitty ctrl+c", "\x1b[99;5u", "\x03"],
  ["kitty ctrl+shift+c", "\x1b[99;6u", "\x03"],
  ["kitty ctrl+space", "\x1b[32;5u", "\x00"],
  ["kitty ctrl+[", "\x1b[91;5u", "\x1b"],
  ["kitty alt+a", "\x1b[97;3u", "\x1ba"],
  ["kitty alt+shift+a", "\x1b[97;4u", "\x1bA"],
  ["kitty alt+/", "\x1b[47;3u", "\x1b/"],
  ["kitty ctrl+alt+x", "\x1b[120;7u", "\x1b\x18"],
  ["kitty plain a", "\x1b[97u", "a"],
  ["kitty shift+a", "\x1b[97;2u", "A"],
  ["kitty shift with alternate key", "\x1b[49:33;2u", "!"],
  ["kitty keypad 0", "\x1b[57399u", "0"],
  ["kitty press event suffix", "\x1b[99;5:1u", "\x03"],
  ["kitty repeat event", "\x1b[106;1:2u", "j"],
  ["modifyOtherKeys ctrl+c", "\x1b[27;5;99~", "\x03"],
  ["modifyOtherKeys shift+A", "\x1b[27;2;65~", "A"],
  ["modifyOtherKeys ctrl+enter", "\x1b[27;5;13~", "\r"],
  ["modifyOtherKeys alt+x", "\x1b[27;3;120~", "\x1bx"],
  ["arrow up legacy", "\x1b[A", "\x1b[A"],
  ["ss3 arrow", "\x1bOB", "\x1bOB"],
  ["ctrl+up", "\x1b[1;5A", "\x1b[1;5A"],
  ["ctrl+up with event", "\x1b[1;5:1A", "\x1b[1;5A"],
  ["home", "\x1b[H", "\x1b[H"],
  ["end", "\x1b[F", "\x1b[F"],
  ["pgup", "\x1b[5~", "\x1b[5~"],
  ["pgdn", "\x1b[6~", "\x1b[6~"],
  ["delete", "\x1b[3~", "\x1b[3~"],
  ["insert", "\x1b[2~", "\x1b[2~"],
  ["shift+delete with event", "\x1b[3;2:1~", "\x1b[3;2~"],
  ["F1", "\x1bOP", "\x1bOP"],
  ["shift+F1", "\x1b[1;2P", "\x1b[1;2P"],
  ["F5", "\x1b[15~", "\x1b[15~"],
  ["ctrl+F12", "\x1b[24;5~", "\x1b[24;5~"],
  ["plain text", "q", "q"],
  ["utf-8 text", "ñ", "ñ"],
  ["legacy ctrl", "\x03", "\x03"],
  ["bracketed paste", "\x1b[200~hello\x1b[201~", "\x1b[200~hello\x1b[201~"],
  ["kitty release dropped", "\x1b[99;5:3u", ""],
  ["arrow release dropped", "\x1b[1;5:3A", ""],
  ["modifier-only key dropped", "\x1b[57441;2u", ""],
];

describe("toLegacyInput", () => {
  for (const [name, input, expected] of cases) {
    it(name, () => {
      assert.equal(toLegacyInput(input), expected);
    });
  }
});
