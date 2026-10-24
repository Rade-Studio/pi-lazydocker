/**
 * Configuration and `/lazydocker` argument parsing.
 *
 * Every setting comes from an environment variable so the package works with
 * zero configuration and can be tuned per shell profile. Invalid values never
 * break the extension: they fall back to the default and produce a warning.
 */

export type LaunchMode = "overlay" | "fullscreen";

/** Columns/rows, or a percentage of the terminal ("90%"). */
export type SizeValue = number | `${number}%`;

export interface LazydockerConfig {
  /** Binary or wrapper to run. */
  command: string;
  /** Mode used by the shortcut and by `/lazydocker` without flags. */
  mode: LaunchMode;
  /** Shortcut that opens lazydocker, or undefined when disabled. */
  shortcut: string | undefined;
  /** Overlay width. */
  width: SizeValue;
  /** Overlay maximum height. */
  height: SizeValue;
}

export const DEFAULT_SHORTCUT = "alt+l";

const DEFAULTS = {
  command: "lazydocker",
  mode: "overlay",
  width: "92%",
  height: "90%",
} as const satisfies Omit<LazydockerConfig, "shortcut">;

type Env = Readonly<Record<string, string | undefined>>;

export function resolveConfig(env: Env = process.env): { config: LazydockerConfig; warnings: string[] } {
  const warnings: string[] = [];

  const command = env.PI_LAZYDOCKER_COMMAND?.trim() || DEFAULTS.command;

  let mode: LaunchMode = DEFAULTS.mode;
  const rawMode = env.PI_LAZYDOCKER_MODE?.trim();
  if (rawMode) {
    const normalized = rawMode.toLowerCase();
    if (normalized === "overlay" || normalized === "fullscreen") {
      mode = normalized;
    } else {
      warnings.push(`PI_LAZYDOCKER_MODE="${rawMode}" is not "overlay" or "fullscreen"; using "${DEFAULTS.mode}".`);
    }
  }

  return {
    config: {
      command,
      mode,
      shortcut: resolveShortcut(env.PI_LAZYDOCKER_KEY),
      width: resolveSize("PI_LAZYDOCKER_WIDTH", env.PI_LAZYDOCKER_WIDTH, DEFAULTS.width, warnings),
      height: resolveSize("PI_LAZYDOCKER_HEIGHT", env.PI_LAZYDOCKER_HEIGHT, DEFAULTS.height, warnings),
    },
    warnings,
  };
}

/** Unset → alt+l; empty or "off" (any case) → disabled; anything else is used as-is. */
function resolveShortcut(raw: string | undefined): string | undefined {
  if (raw === undefined) return DEFAULT_SHORTCUT;
  const value = raw.trim();
  return value === "" || value.toLowerCase() === "off" ? undefined : value;
}

function resolveSize(name: string, raw: string | undefined, fallback: SizeValue, warnings: string[]): SizeValue {
  const value = raw?.trim();
  if (!value) return fallback;
  const parsed = parseSize(value);
  if (parsed !== undefined) return parsed;
  warnings.push(`${name}="${value}" is not a positive number of cells or a 1-100% percentage; using "${fallback}".`);
  return fallback;
}

export function parseSize(value: string): SizeValue | undefined {
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(value);
  if (percent) {
    const amount = Number(percent[1]);
    return amount > 0 && amount <= 100 ? `${amount}%` : undefined;
  }
  if (/^\d+$/.test(value)) {
    const cells = Number(value);
    return cells > 0 ? cells : undefined;
  }
  return undefined;
}

export type ParsedArgs =
  | { ok: true; mode: LaunchMode | undefined; help: boolean; args: string[] }
  | { ok: false; error: string };

/**
 * Parse `/lazydocker [--overlay|-O] [--fullscreen|-F] [--help|-h] [lazydocker args...] [-- args...]`.
 * Unknown arguments are forwarded to lazydocker (for example `-f compose.yml -p app`).
 */
export function parseCommandArgs(input: string): ParsedArgs {
  const tokens = tokenize(input);
  if (!tokens) return { ok: false, error: "Unterminated quote in arguments." };

  let mode: LaunchMode | undefined;
  let help = false;
  const args: string[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] as string;
    if (token === "--") {
      args.push(...tokens.slice(index + 1));
      break;
    }
    const flagMode = token === "--fullscreen" || token === "-F" ? "fullscreen" : token === "--overlay" || token === "-O" ? "overlay" : undefined;
    if (flagMode) {
      if (mode && mode !== flagMode) return { ok: false, error: "Use either --overlay or --fullscreen, not both." };
      mode = flagMode;
    } else if (token === "--help" || token === "-h") {
      help = true;
    } else {
      args.push(token);
    }
  }

  return { ok: true, mode, help, args };
}

/** Split like a POSIX shell for words, single quotes, double quotes and backslash escapes. */
function tokenize(input: string): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let inToken = false;
  let quote: "'" | '"' | undefined;

  for (let index = 0; index < input.length; index++) {
    const char = input[index] as string;
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else if (char === "\\" && quote === '"' && index + 1 < input.length) {
        current += input[++index];
      } else {
        current += char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      inToken = true;
    } else if (char === "\\" && index + 1 < input.length) {
      current += input[++index];
      inToken = true;
    } else if (/\s/.test(char)) {
      if (inToken) tokens.push(current);
      current = "";
      inToken = false;
    } else {
      current += char;
      inToken = true;
    }
  }

  if (quote) return undefined;
  if (inToken) tokens.push(current);
  return tokens;
}

export const USAGE = [
  "Usage: /lazydocker [--overlay | --fullscreen] [lazydocker args...]",
  "",
  "  -O, --overlay     Open in a floating window inside Pi",
  "  -F, --fullscreen  Hand the whole terminal to lazydocker",
  "  -h, --help        Show this help",
  "",
  "Other arguments are passed to lazydocker, e.g. /lazydocker -f compose.prod.yml",
  "Inside the overlay: ctrl+q closes, ctrl+o switches to fullscreen.",
].join("\n");
