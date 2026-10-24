/**
 * Checks that run before lazydocker starts, so failures become one clear
 * message instead of an empty overlay or a terminal that flashes and returns.
 */

import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";

type Env = Readonly<Record<string, string | undefined>>;

export type PreflightResult =
  | { ok: true; executable: string }
  | { ok: false; reason: "no-tui" | "missing-binary"; message: string };

export interface PreflightInput {
  /** `ctx.mode` from Pi: "tui" | "rpc" | "json" | "print". */
  mode: string;
  command: string;
  env?: Env;
  platform?: NodeJS.Platform;
}

export function preflight({ mode, command, env = process.env, platform = process.platform }: PreflightInput): PreflightResult {
  if (mode !== "tui") {
    return {
      ok: false,
      reason: "no-tui",
      message: `lazydocker needs Pi's interactive terminal; it is unavailable in ${mode} mode.`,
    };
  }

  const executable = findExecutable(command, env, platform);
  if (!executable) {
    return {
      ok: false,
      reason: "missing-binary",
      message: `Could not find "${command}" on your PATH.\n${installHint(platform)}\nOr point PI_LAZYDOCKER_COMMAND at the binary.`,
    };
  }

  return { ok: true, executable };
}

/** Resolve a command like the shell would, without spawning anything. */
export function findExecutable(command: string, env: Env = process.env, platform: NodeJS.Platform = process.platform): string | undefined {
  const windows = platform === "win32";
  // On Windows a PATHEXT match beats an extensionless file (such as an npm shell shim).
  const extensions = windows ? [...(readEnv(env, "PATHEXT", windows) ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean), ""] : [""];
  const hasSeparator = command.includes("/") || (windows && command.includes("\\"));

  const candidates = hasSeparator || isAbsolute(command)
    ? [resolve(command)]
    : (readEnv(env, "PATH", windows) ?? "").split(delimiterFor(platform)).filter(Boolean).map((dir) => join(dir, command));

  for (const base of candidates) {
    for (const extension of extensions) {
      const candidate = base + extension;
      if (isExecutable(candidate, windows)) return candidate;
    }
  }
  return undefined;
}

/** Windows environment variable names are case-insensitive (`Path`, `PATH`). */
function readEnv(env: Env, name: string, windows: boolean): string | undefined {
  if (!windows) return env[name];
  const key = Object.keys(env).find((candidate) => candidate.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

function delimiterFor(platform: NodeJS.Platform): string {
  return platform === process.platform ? delimiter : platform === "win32" ? ";" : ":";
}

function isExecutable(path: string, windows: boolean): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (!windows) accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function installHint(platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return "Install it with: brew install lazydocker";
    case "win32":
      return "Install it with: scoop install lazydocker  (or: choco install lazydocker)";
    default:
      return [
        "Install it with one of:",
        "  brew install lazydocker",
        "  go install github.com/jesseduffield/lazydocker@latest",
        "  curl -fsSL https://raw.githubusercontent.com/jesseduffield/lazydocker/master/scripts/install_update_linux.sh | bash",
      ].join("\n");
  }
}
