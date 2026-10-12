import { existsSync } from "node:fs";

/** Obsidian may disable Electron's RunAsNode fuse. Always use a real Node runtime. */
export function resolveNodeExecutable(
  hostExecutable = process.execPath,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (file: string) => boolean = existsSync,
): string {
  if (env.MD_COMPANION_NODE?.trim()) return env.MD_COMPANION_NODE.trim();
  if (
    /(?:^|[/\\])node(?:\.exe)?$/i.test(hostExecutable) &&
    exists(hostExecutable)
  )
    return hostExecutable;
  const filename = platform === "win32" ? "node.exe" : "node";
  const append = (directory: string) =>
    `${directory.replace(/[/\\]+$/, "")}/${filename}`;
  const pathValue = env.PATH || env.Path || env.path || "";
  const candidates = pathValue
    .split(platform === "win32" ? ";" : ":")
    .filter(Boolean)
    .map((p) => append(p.replace(/^"|"$/g, "")));
  if (platform === "win32") {
    for (const base of [
      env.ProgramFiles,
      env["ProgramFiles(x86)"],
      env.LOCALAPPDATA && `${env.LOCALAPPDATA}/Programs`,
    ])
      if (base) candidates.push(append(`${base}/nodejs`));
  } else
    candidates.push(
      "/opt/homebrew/bin/node",
      "/usr/local/bin/node",
      "/usr/bin/node",
    );
  return candidates.find(exists) || "node";
}
