/**
 * Translate Pi's keyboard input into the legacy byte sequences lazydocker expects.
 *
 * Pi may enable the kitty keyboard protocol and xterm modifyOtherKeys, so keys
 * arrive as `CSI codepoint;mods u` or `CSI 27;mods;codepoint ~`. lazydocker
 * (gocui) only understands classic terminal input, where esc is a bare `\x1b`
 * and ctrl+letter is a control byte.
 */

import { isKeyRelease } from "@earendil-works/pi-tui";

const SHIFT = 1;
const ALT = 2;
const CTRL = 4;

// CSI code[:shifted[:base]] [; mods[:event] [; text]] u
const KITTY = /^\x1b\[(\d+)(?::(\d*))?(?::\d*)?(?:;(\d*)(?::(\d+))?)?(?:;[\d:]*)?u$/;
// CSI 27 ; mods ; code ~
const MODIFY_OTHER_KEYS = /^\x1b\[27;(\d+);(\d+)~$/;
// CSI 1;mods[:event] letter  and  CSI n;mods[:event] ~
const MODIFIED_FUNCTIONAL = /^\x1b\[(\d+);(\d+):\d+([A-Za-z~])$/;

// Kitty private-use codepoints for keypad keys that produce text.
const KEYPAD: Record<number, string> = {
  57399: "0", 57400: "1", 57401: "2", 57402: "3", 57403: "4", 57404: "5", 57405: "6", 57406: "7", 57407: "8", 57408: "9",
  57409: ".", 57410: "/", 57411: "*", 57412: "-", 57413: "+", 57414: "\r", 57415: "=",
};

export function toLegacyInput(data: string): string {
  if (isKeyRelease(data)) return "";

  const kitty = KITTY.exec(data);
  if (kitty) {
    const code = Number(kitty[1]);
    const shifted = kitty[2] ? Number(kitty[2]) : undefined;
    const mods = kitty[3] ? Number(kitty[3]) - 1 : 0;
    if (kitty[4] === "3") return "";
    return encodeKey(code, mods, shifted) ?? data;
  }

  const other = MODIFY_OTHER_KEYS.exec(data);
  if (other) return encodeKey(Number(other[2]), Number(other[1]) - 1, undefined) ?? data;

  // Legacy functional keys are fine, but strip a kitty event-type suffix.
  const functional = MODIFIED_FUNCTIONAL.exec(data);
  if (functional) return `\x1b[${functional[1]};${functional[2]}${functional[3]}`;

  return data;
}

function encodeKey(code: number, mods: number, shifted: number | undefined): string | undefined {
  const alt = mods & ALT ? "\x1b" : "";
  const ctrl = (mods & CTRL) !== 0;
  const shift = (mods & SHIFT) !== 0;

  switch (code) {
    case 27:
      return alt + "\x1b";
    case 13:
      return alt + "\r";
    case 9:
      return shift ? "\x1b[Z" : alt + "\t";
    case 127:
    case 8:
      return alt + (ctrl ? "\x08" : "\x7f");
  }

  const keypad = KEYPAD[code];
  if (keypad !== undefined) return alt + keypad;
  // Other private-use codepoints are modifier or media keys with no legacy bytes.
  if (code >= 57344 && code <= 63743) return "";

  if (ctrl) {
    if (code === 32 || code === 64 || code === 50) return alt + "\x00";
    if (code >= 97 && code <= 122) return alt + String.fromCharCode(code - 96);
    if (code >= 65 && code <= 90) return alt + String.fromCharCode(code - 64);
    if (code >= 91 && code <= 95) return alt + String.fromCharCode(code - 64);
    return undefined;
  }

  if (code < 32) return alt + String.fromCharCode(code);
  let char = String.fromCodePoint(shift && shifted !== undefined ? shifted : code);
  if (shift && shifted === undefined) char = char.toUpperCase();
  return alt + char;
}
