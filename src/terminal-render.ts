/**
 * Render an `@xterm/headless` screen buffer as ANSI strings Pi can draw.
 *
 * Each line restates its full SGR state at every style change and resets at
 * the end, so lines can be composited anywhere without leaking styles.
 */

import type { IBufferCell, Terminal } from "@xterm/headless";

/** Render the visible screen, one string per row, each exactly `terminal.cols` wide. */
export function renderScreen(terminal: Terminal): string[] {
  const lines: string[] = [];
  for (let row = 0; row < terminal.rows; row++) lines.push(renderLine(terminal, row));
  return lines;
}

/** Render one visible row (0-based from the top of the viewport). */
export function renderLine(terminal: Terminal, row: number): string {
  const cols = terminal.cols;
  const buffer = terminal.buffer.active;
  const line = buffer.getLine(buffer.viewportY + row);
  if (!line) return " ".repeat(cols) + "\x1b[0m";

  let out = "";
  let current = "0";
  let width = 0;
  let cell: IBufferCell | undefined;

  for (let col = 0; col < cols; col++) {
    cell = line.getCell(col, cell);
    if (!cell) break;
    const cellWidth = cell.getWidth();
    if (cellWidth === 0) continue;
    // A wide char that would overflow the row is replaced by a space.
    if (width + cellWidth > cols) break;

    const sgr = cellSgr(cell);
    if (sgr !== current) {
      out += `\x1b[${sgr}m`;
      current = sgr;
    }
    out += cell.getChars() || " ";
    width += cellWidth;
  }

  if (width < cols) {
    if (current !== "0") out += "\x1b[0m";
    out += " ".repeat(cols - width);
  }
  return out + "\x1b[0m";
}

function cellSgr(cell: IBufferCell): string {
  const codes = ["0"];
  if (cell.isBold()) codes.push("1");
  if (cell.isDim()) codes.push("2");
  if (cell.isItalic()) codes.push("3");
  if (cell.isUnderline()) codes.push("4");
  if (cell.isInverse()) codes.push("7");
  if (cell.isInvisible()) codes.push("8");
  if (cell.isStrikethrough()) codes.push("9");

  if (cell.isFgRGB()) codes.push(rgb(38, cell.getFgColor()));
  else if (cell.isFgPalette()) codes.push(palette(cell.getFgColor(), 30, 90, 38));

  if (cell.isBgRGB()) codes.push(rgb(48, cell.getBgColor()));
  else if (cell.isBgPalette()) codes.push(palette(cell.getBgColor(), 40, 100, 48));

  return codes.join(";");
}

function rgb(prefix: number, color: number): string {
  return `${prefix};2;${(color >> 16) & 0xff};${(color >> 8) & 0xff};${color & 0xff}`;
}

function palette(index: number, normal: number, bright: number, extended: number): string {
  if (index < 8) return String(normal + index);
  if (index < 16) return String(bright + index - 8);
  return `${extended};5;${index}`;
}
