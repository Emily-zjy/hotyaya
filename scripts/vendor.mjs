import { execFileSync } from "node:child_process";
import { mkdir, cp, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const sources = [
  ["ppt-master", "hugohe3/ppt-master", ["skills/ppt-master"]],
  [
    "frontend-slides",
    "zarazhangrui/frontend-slides",
    ["plugins/frontend-slides", "scripts"],
  ],
  ["humanizer", "blader/humanizer", []],
  ["humanizer-zh", "op7418/Humanizer-zh", []],
  [
    "baoyu",
    "JimLiu/baoyu-skills",
    [
      "skills/baoyu-translate",
      "skills/baoyu-article-illustrator",
      "skills/baoyu-image-gen",
      "skills/baoyu-markdown-to-html",
      "skills/baoyu-format-markdown",
    ],
  ],
  [
    "fabric",
    "danielmiessler/Fabric",
    [
      "data/patterns/summarize",
      "data/patterns/explain_docs",
      "data/patterns/analyze_prose",
      "data/patterns/extract_wisdom",
    ],
  ],
  [
    "anthropic-skills",
    "anthropics/skills",
    ["skills/theme-factory", "skills/frontend-design"],
  ],
  [
    "vscode-pets",
    "tonybaloney/vscode-pets",
    ["media/rubber-duck", "src/panel"],
  ],
];
const manifest = [];
await mkdir(path.join(root, "vendor/skills"), { recursive: true });
await mkdir(path.join(root, "vendor/licenses"), { recursive: true });
await mkdir(path.join(root, "assets/pet"), { recursive: true });
for (const [name, repo, sparse] of sources) {
  const dir = path.join(root, "vendor/repos", name);
  try {
    await readFile(path.join(dir, ".git/HEAD"));
  } catch {
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    git(
      ...(proxy ? ["-c", `http.proxy=${proxy}`] : []),
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      `https://github.com/${repo}.git`,
      dir,
    );
    if (sparse.length)
      git(
        "-C",
        dir,
        ...(proxy ? ["-c", `http.proxy=${proxy}`] : []),
        "sparse-checkout",
        "set",
        ...sparse,
      );
  }
  const commit = git("-C", dir, "rev-parse", "HEAD");
  await cp(
    path.join(dir, "LICENSE"),
    path.join(root, "vendor/licenses", `${name}.txt`),
  );
  if (name === "ppt-master") {
    await cp(
      path.join(dir, "skills/ppt-master"),
      path.join(root, "vendor/skills/ppt-master"),
      { recursive: true },
    );
  } else if (name === "baoyu" || name === "anthropic-skills") {
    for (const folder of sparse)
      await cp(
        path.join(dir, folder),
        path.join(root, "vendor/skills", path.basename(folder)),
        { recursive: true },
      );
  } else if (name === "fabric") {
    await cp(
      path.join(dir, "data/patterns"),
      path.join(root, "vendor/skills/fabric"),
      { recursive: true },
    );
  } else if (name === "vscode-pets") {
    await cp(
      path.join(dir, "media/rubber-duck"),
      path.join(root, "assets/pet"),
      { recursive: true },
    );
    await cp(
      path.join(dir, "src/panel/pets/rubberduck.ts"),
      path.join(root, "assets/pet/upstream-rubberduck.ts"),
    ).catch(() => {});
  } else {
    const out = path.join(root, "vendor/skills", name);
    await mkdir(out, { recursive: true });
    for (const file of await readdir(dir, { withFileTypes: true })) {
      if (file.name.startsWith(".")) continue;
      if (
        (file.isFile() && /\.(md|css|html|txt)$/.test(file.name)) ||
        (file.isDirectory() && ["scripts", "plugins"].includes(file.name))
      )
        await cp(path.join(dir, file.name), path.join(out, file.name), {
          recursive: true,
        });
    }
  }
  manifest.push({
    name,
    repository: `https://github.com/${repo}`,
    commit,
    license: `licenses/${name}.txt`,
  });
  console.log(`${name}: ${commit}`);
}
await writeFile(
  path.join(root, "vendor/manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
