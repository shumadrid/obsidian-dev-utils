import {
  Linter,
  loadESLint
} from "eslint";
import { configs } from "./eslint.config.ts";
import {
  dirname,
  join
} from "node:path/posix";
import { packageDirectory } from "pkg-dir";
import { fileURLToPath } from "node:url";

if (typeof __filename === "undefined") {
  globalThis.__filename = fileURLToPath(import.meta.url);
  globalThis.__dirname = dirname(__filename);
}

export async function lintAndFix(overrideConfig?: Linter.Config | Linter.Config[]): Promise<void> {
  const packageDir = await packageDirectory({ cwd: __dirname });
  if (!packageDir) {
    throw new Error("Could not find package directory.");
  }
  overrideConfig ??= configs;

  const arr = overrideConfig instanceof Array ? overrideConfig : [overrideConfig];
  const ignorePatterns = arr.flatMap((config) => config.ignores ?? []);

  const FlatESLint = await loadESLint({ useFlatConfig: true });
  const eslint = new FlatESLint({
    fix: true,
    overrideConfigFile: join(packageDir, "dist/eslint.config.empty.cjs"),
    overrideConfig: overrideConfig,
    ignorePatterns
  });
  const results = await eslint.lintFiles(["."]);
  await FlatESLint.outputFixes(results);

  const formatter = await eslint.loadFormatter("stylish");
  const str = await formatter.format(results, { cwd: process.cwd(), rulesMeta: {} });
  console.log(str);
}
