/**
 * pi-lazydocker: `/lazydocker` and a shortcut (alt+l by default) that open
 * lazydocker in a floating overlay or fullscreen.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";
import { parseCommandArgs, resolveConfig, USAGE, type LaunchMode } from "./config.ts";
import { openLazydocker } from "./launcher.ts";

type Env = Readonly<Record<string, string | undefined>>;

/** Build the extension factory; `open` is injectable for tests. */
export function createExtension(env: Env = process.env, open: typeof openLazydocker = openLazydocker): (pi: ExtensionAPI) => void {
  return (pi) => {
    const { config, warnings } = resolveConfig(env);
    let warned = false;

    const launch = async (ctx: ExtensionContext, mode: LaunchMode, args: string[]) => {
      if (!warned) {
        warned = true;
        for (const warning of warnings) ctx.ui.notify(warning, "warning");
      }
      await open(ctx, config, { mode, args });
    };

    pi.registerCommand("lazydocker", {
      description: "Open lazydocker (overlay or fullscreen)",
      handler: async (input, ctx) => {
        const parsed = parseCommandArgs(input);
        if (!parsed.ok) {
          ctx.ui.notify(`${parsed.error}\n\n${USAGE}`, "error");
          return;
        }
        if (parsed.help) {
          ctx.ui.notify(USAGE, "info");
          return;
        }
        await launch(ctx, parsed.mode ?? config.mode, parsed.args);
      },
    });

    if (config.shortcut) {
      pi.registerShortcut(config.shortcut as KeyId, {
        description: "Open lazydocker",
        handler: (ctx) => launch(ctx, config.mode, []),
      });
    }
  };
}

export default createExtension();
