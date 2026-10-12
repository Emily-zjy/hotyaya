import * as esbuild from "esbuild";
import { cp, mkdir } from "node:fs/promises";
const codeOnly = process.argv.includes("--code-only");
if (!codeOnly) await import("./licenses.mjs");
await esbuild.build({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "es2022",
  external: ["obsidian", "electron"],
  jsx: "automatic",
  sourcemap: false,
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
await esbuild.build({
  entryPoints: ["src/worker/server.ts"],
  outfile: "worker.cjs",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: false,
  minify: false,
  banner: {
    js: 'var __import_meta_url = require("url").pathToFileURL(__filename).href;',
  },
  define: { "import.meta.url": "__import_meta_url" },
});
const out = "dist/md-companion";
await mkdir(out, { recursive: true });
for (const file of [
  "main.js",
  "worker.cjs",
  "manifest.json",
  "styles.css",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
])
  await cp(file, `${out}/${file}`);
for (const dir of codeOnly
  ? []
  : ["assets", "vendor/skills", "vendor/licenses", "services"])
  await cp(dir, `${out}/${dir}`, {
    recursive: true,
    filter: (source) =>
      !/(?:^|[/\\])__pycache__(?:[/\\]|$)|\.pyc$/.test(source),
  });
await cp("vendor/manifest.json", `${out}/vendor/manifest.json`);
console.log(`Built ${out}`);
