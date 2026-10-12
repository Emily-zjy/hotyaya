import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
const { version } = JSON.parse(await readFile("manifest.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid version");
await rm(`dist/md-companion-${version}.zip`, {force:true});
if (process.platform === "win32") {
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory((Join-Path (Get-Location) 'dist/md-companion'), (Join-Path (Get-Location) 'dist/md-companion-${version}.zip'), [IO.Compression.CompressionLevel]::Optimal, $true)`,
    ],
    { stdio: "inherit" },
  );
} else {
  execFileSync("zip", ["-r", `md-companion-${version}.zip`, "md-companion"], {
    cwd: "dist",
    stdio: "inherit",
  });
}
console.log(`dist/md-companion-${version}.zip`);
