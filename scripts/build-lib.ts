import esbuild, { BuildOptions } from "esbuild";
import {
  readFile,
  writeFile
} from "node:fs/promises";
import process from "node:process";
import { extname } from "node:path/posix";

interface NpmPackage {
  version: string;
}

const npmPackage = JSON.parse(await readFile("./package.json", "utf8")) as NpmPackage;

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
*/
`;

const buildOptions: BuildOptions = {
  banner: {
    js: banner
  },
  bundle: true,
  entryPoints: ["src/**/*.ts"],
  external: ["esbuild"],
  format: "cjs",
  logLevel: "info",
  outdir: "dist/lib",
  platform: "node",
  sourcemap: "inline",
  target: "ESNext",
  treeShaking: true,
  write: false,

  plugins: [
    {
      name: "preprocess",
      setup(build): void {
        build.onLoad({ filter: /\.(js|ts|cjs|mjs|cts|mts)$/ }, async (args) => {
          let contents = await readFile(args.path, "utf8");
          contents = contents.replace(/import\.meta\.url/g, "__filename");
          contents = contents.replace("${NODE_PACKAGE_VERSION}", npmPackage.version);

          return {
            contents,
            loader: "ts"
          };
        });
      },
    },
    {
      name: "rename-extension",
      setup(build): void {
        build.onEnd(async (result) => {
          for (const file of result.outputFiles ?? []) {
            if (!file.path.endsWith(".js") || file.path.endsWith(".d.js")) {
              continue;
            }
            const newPath = file.path.replace(/\.js$/, ".cjs");
            await writeFile(newPath, file.text);
          }
        });
      }
    }
  ]
};

const context = await esbuild.context(buildOptions);

await context.rebuild();
process.exit(0);
