import { readdir, readFile, mkdir, cp, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const lock = JSON.parse(
  await readFile(path.join(root, "package-lock.json"), "utf8"),
);
const out = path.join(root, "vendor/licenses/npm");
await mkdir(out, { recursive: true });
const manifest = [];
for (const [location, meta] of Object.entries(lock.packages)) {
  if (!location || meta.dev) continue;
  const dir = path.join(root, location);
  const name = location.replaceAll("node_modules/", "").replaceAll("/", "__");
  let files = [];
  try {
    files = (await readdir(dir)).filter((file) =>
      /^(license|licence|copying|notice)(\.|$)/i.test(file),
    );
  } catch {}
  for (const file of files)
    await cp(path.join(dir, file), path.join(out, `${name}-${file}`));
  manifest.push({
    location,
    version: meta.version,
    license: meta.license,
    files,
  });
}
await writeFile(
  path.join(out, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Collected license notices for ${manifest.length} runtime packages.`,
);
