import { Command } from "commander";
import {
  BuildMode,
  buildPlugin
} from "./PluginBuilder.ts";
import process from "node:process";
import { lint } from "./ESLint/ESLint.ts";
import { spellcheck } from "./spellcheck.ts";
import { updateVersion } from "./version.ts";
import type { MaybePromise } from "./Async.ts";
import {
  getTaskResult,
  TaskResult
} from "./TaskResult.ts";

/**
 * The number of leading arguments to skip when parsing command-line arguments.
 * The first two elements typically represent the Node.js executable and the script path:
 * ["node", "path/to/cli.cjs", ...actualArgs]
 */
const NODE_SCRIPT_ARGV_SKIP_COUNT = 2;

export function cli(argv: string[] = process.argv.slice(NODE_SCRIPT_ARGV_SKIP_COUNT)): void {
  const NODE_PACKAGE_VERSION = "${NODE_PACKAGE_VERSION}";
  const program = new Command();

  program
    .name("obsidian-dev-utils")
    .description("CLI to some obsidian-dev-utils commands")
    .version(NODE_PACKAGE_VERSION);

  program.command("build")
    .description("Build the plugin")
    .action(wrapTask(() => buildPlugin({ mode: BuildMode.Production })));

  program.command("dev")
    .description("Build the plugin in development mode")
    .action(wrapTask(() => buildPlugin({ mode: BuildMode.Development })));

  program.command("lint")
    .description("Lints the source code")
    .action(wrapTask(() => lint()));

  program.command("lint-fix")
    .description("Lints the source code and applies automatic fixes if possible")
    .action(wrapTask(() => lint(true)));

  program.command("version")
    .description("Release new version")
    .argument("<major|minor|patch>", "Version to release")
    .action(wrapTask(async (version: string) => updateVersion(version)));

  program.command("spellcheck")
    .description("Spellcheck the source code")
    .action(wrapTask(() => spellcheck()));

  program.parse(argv, { from: "user" });
}

export function wrapTask<TaskArgs extends unknown[]>(taskFn: (...taskArgs: TaskArgs) => MaybePromise<TaskResult | void>): (...taskArgs: TaskArgs) => Promise<void> {
  return async (...taskArgs: TaskArgs) => {
    const result = await getTaskResult(taskFn, taskArgs);
    result.exit();
  };
}
