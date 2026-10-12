import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Themes come from Anthropic's theme-factory skill (vendor/skills/theme-factory/themes).
 * Every PPT, HTML slide deck and HTML article is styled with one of them; the model only
 * picks which. Roles are derived from the palette so each theme renders legibly.
 */
export interface Theme {
  id: string;
  name: string;
  summary: string;
  bestFor: string;
  serif: boolean;
  /** Hex without '#'. */
  dark: string;
  light: string;
  accent: string;
  accent2: string;
  ink: string;
  muted: string;
  soft: string;
  line: string;
}
const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
function saturation(hex: string) {
  const c = rgb(hex);
  return Math.max(...c) - Math.min(...c);
}
export function mix(a: string, b: string, t: number) {
  const x = rgb(a),
    y = rgb(b);
  return x
    .map((v, i) =>
      Math.round((v * (1 - t) + y[i] * t) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}
function derive(id: string, text: string): Theme {
  const name = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? id;
  const summary = text.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? "";
  const bestFor =
    text.match(/## Best Used For\s+([\s\S]*?)(?:\n##|$)/)?.[1]?.trim() ?? "";
  const colors = [...text.matchAll(/`#([0-9a-fA-F]{6})`/g)].map((m) => m[1].toLowerCase());
  const serif = /Headers\*\*:\s*[^\n]*Serif/i.test(text);
  const byLum = [...colors].sort((a, b) => luminance(a) - luminance(b));
  let dark = byLum[0],
    light = byLum.at(-1)!;
  // Keep the page background genuinely light and the cover genuinely dark.
  if (luminance(light) < 0.75) light = mix(light, "ffffff", 0.85);
  if (luminance(dark) > 0.06) dark = mix(dark, "000000", 0.45);
  const rest = colors.filter((c) => c !== byLum[0] && c !== byLum.at(-1));
  // Accent: the most saturated remaining color that is readable on the light page.
  const candidates = [...rest, byLum[0]].sort((a, b) => saturation(b) - saturation(a));
  let accent = candidates.find((c) => contrast(c, light) >= 3) ?? dark;
  if (contrast(accent, light) < 3) accent = mix(accent, "000000", 0.35);
  const accent2 = rest.find((c) => c !== accent) ?? mix(accent, light, 0.4);
  const ink = contrast(dark, light) >= 7 ? dark : mix(dark, "000000", 0.5);
  return {
    id,
    name,
    summary,
    bestFor,
    serif,
    dark,
    light,
    accent,
    accent2,
    ink,
    muted: mix(ink, light, 0.42),
    soft: mix(light, accent, 0.07),
    line: mix(light, accent, 0.2),
  };
}
let cache: Theme[] | undefined;
export function loadThemes(skillRoot: string): Theme[] {
  if (cache) return cache;
  const dir = join(skillRoot, "theme-factory", "themes");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    throw new Error("Required vendored skill unavailable: theme-factory");
  }
  if (!files.length) throw new Error("Required vendored skill unavailable: theme-factory");
  return (cache = files.map((f) =>
    derive(f.replace(/\.md$/, ""), readFileSync(join(dir, f), "utf8")),
  ));
}
/** Accepts an id ("ocean-depths") or display name ("Ocean Depths"); falls back to a neutral theme. */
export function pickTheme(themes: Theme[], choice: unknown): Theme {
  const key = String(choice ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "");
  return (
    themes.find((t) => t.id === key || t.name.toLowerCase().replace(/\s+/g, "-") === key) ??
    themes.find((t) => t.id === "modern-minimalist") ??
    themes[0]
  );
}
/** One line per theme for the model to choose from. */
export function themeMenu(themes: Theme[]) {
  return themes
    .map((t) => `- ${t.id}: ${t.summary} Best for: ${t.bestFor}`)
    .join("\n");
}
export const fonts = (t: Theme) => ({
  /** Fonts that exist on Windows/Office; theme-factory's DejaVu/Free fonts usually do not. */
  // Windows serif CJK fonts (SimSun) render thin in slides; serif stays in HTML only.
  pptHead: "Microsoft YaHei",
  pptBody: "Microsoft YaHei",
  cssHead: t.serif
    ? `"Source Han Serif SC","Noto Serif SC","Songti SC",SimSun,Georgia,serif`
    : `"PingFang SC","Microsoft YaHei","Noto Sans SC","Segoe UI",system-ui,sans-serif`,
  cssBody: `"PingFang SC","Microsoft YaHei","Noto Sans SC","Segoe UI",system-ui,sans-serif`,
});
