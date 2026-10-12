import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/**
 * Two-stage illustration pipeline built on baoyu-article-illustrator:
 * 1. the chat model rewrites the selection into a structured plan (type × style × elements);
 * 2. code assembles the image prompt from a fixed template, the chosen style's full spec
 *    and the skill's mandatory composition rules, so every image shares one skeleton.
 */
export const TYPES = ["infographic", "scene", "flowchart", "comparison", "framework", "timeline"] as const;
export const STYLES = [
  "sketch-notes",
  "vector-illustration",
  "notion",
  "warm",
  "minimal",
  "blueprint",
  "watercolor",
  "elegant",
  "editorial",
  "scientific",
  "screen-print",
] as const;
type Kind = (typeof TYPES)[number];
type Style = (typeof STYLES)[number];
/** Type × Style matrix from the skill's references/styles.md: 2 = ✓✓, 1 = ✓, 0 = ✗. */
const FIT: Record<Kind, number[]> = {
  infographic: [2, 2, 2, 1, 2, 2, 1, 2, 2, 2, 1],
  scene: [0, 1, 1, 2, 1, 0, 2, 1, 1, 0, 2],
  flowchart: [2, 2, 2, 1, 1, 2, 0, 1, 2, 1, 0],
  comparison: [2, 2, 2, 1, 2, 1, 1, 2, 2, 1, 1],
  framework: [2, 2, 2, 1, 2, 2, 0, 2, 1, 2, 1],
  timeline: [1, 1, 2, 1, 1, 1, 2, 2, 2, 1, 1],
};
export function compatible(type: Kind, style: Style): Style {
  const row = FIT[type];
  if (row[STYLES.indexOf(style)] > 0) return style;
  // Incompatible pair: the first fully compatible style for this type.
  return STYLES[row.indexOf(2)];
}
/** Cut at a sentence or clause boundary, never mid-word. */
const short = (max: number) =>
  z.string().transform((v) => {
    const t = v.trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const at = Math.max(...[". ", "; ", ", ", "。", "；", "，"].map((m) => cut.lastIndexOf(m)));
    return (at > max * 0.5 ? cut.slice(0, at + 1) : cut.replace(/\s+\S*$/, "")).trim();
  });
/** Long labels render as garbled text; drop them rather than truncate. */
const label = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t && t.length <= 14 ? t : undefined;
  });
export const planSchema = z.object({
  type: z.enum(TYPES).catch("infographic"),
  style: z.enum(STYLES).catch("vector-illustration"),
  title: label,
  idea: short(500),
  layout: short(800).optional(),
  elements: z
    .array(z.object({ label, visual: short(500) }))
    .min(1)
    .transform((v) => v.slice(0, 5)),
  mood: short(160).optional(),
  people: z.boolean().catch(false),
});
export type Plan = z.infer<typeof planSchema>;

export const PLAN_DIRECTIVE = `Rewrite the document (or selection) into ONE illustration plan for an image model. Return ONLY JSON:
{"type":"${TYPES.join("|")}","style":"${STYLES.join("|")}","title":"short title in the document language (optional)","idea":"one English sentence: the single visual idea that explains the content","layout":"English: composition, zones and reading flow","elements":[{"label":"1–6 word label in the document language","visual":"English: what to draw for this element and how it connects to the others"}],"mood":"English: tone in a few words","people":false}
Rules: pick the type that matches the information structure (process -> flowchart, two options -> comparison, model/architecture -> framework, history -> timeline, story/emotion -> scene, facts/metrics -> infographic). Pick a style suited to the subject and audience: tech/system design -> blueprint or vector-illustration, business/thought leadership -> elegant or editorial, education/explainers -> sketch-notes or notion, lifestyle/narrative -> warm or watercolor, opinion/culture -> screen-print. 3–5 elements using the document's real terms. Labels: at most 10 characters (Chinese) or 3 words, no arrows or symbols; prefer fewer labels over long ones. The title and element labels are the ONLY text allowed in the image: layout and visual descriptions must not introduce any other words, letters, yes/no marks or headings (describe icons and arrows instead). Describe visuals concretely (objects, icons, arrows, positions), never abstractly. Set people true only if human figures are essential.`;

async function section(file: string, names: string[]) {
  const text = await readFile(file, "utf8");
  const parts = text.split(/(?=^## )/m);
  return parts
    .filter((p) => names.some((n) => p.startsWith(`## ${n}`)))
    .join("")
    .replace(/^## /gm, "")
    .trim();
}
/** Final prompt: plan + style spec + the skill's mandatory rules, always in the same order. */
export async function buildPrompt(plan: Plan, skillRoot: string, language: string) {
  const style = compatible(plan.type, plan.style);
  const dir = join(skillRoot, "baoyu-article-illustrator", "references");
  let spec: string;
  try {
    spec = await section(join(dir, "styles", `${style}.md`), [
      "Design Aesthetic",
      "Background",
      "Color Palette",
      "Visual Elements",
      "Style Rules",
    ]);
  } catch {
    throw new Error(`Required vendored skill unavailable: baoyu-article-illustrator/${style}`);
  }
  const labelled = plan.elements.filter((e) => e.label);
  const prompt = [
    `${plan.title ? `${plan.title} — ` : ""}${plan.type} illustration in ${style} style.`,
    plan.idea,
    plan.layout ? `LAYOUT: ${plan.layout}` : "",
    `ELEMENTS:\n${plan.elements.map((e, i) => `${i + 1}. ${e.visual}${e.label ? ` — label: "${e.label}"` : ""}`).join("\n")}`,
    plan.mood ? `MOOD: ${plan.mood}` : "",
    `STYLE SPECIFICATION (${style}):\n${spec}`,
    "COMPOSITION: Clean composition with generous white space. Simple or no background. Main elements centered or positioned by content needs. One clear focal point; no visual clutter; consistent line weight and lighting across all elements.",
    "Color values (#hex) and color names are rendering guidance only — do NOT display color names, hex codes, or palette labels as visible text in the image.",
    labelled.length
      ? `TEXT: Only these labels may appear, spelled exactly, in ${language}: ${labelled.map((e) => `"${e.label}"`).join(", ")}${plan.title ? `, plus the title "${plan.title}"` : ""}. Text should be large and prominent with clean, legible lettering. No other words, no paragraphs, no watermarks, no signatures.`
      : "TEXT: No text, letters or numbers in the image. No watermarks, no signatures.",
    plan.people
      ? "Human figures: simplified stylized silhouettes or symbolic representations, not photorealistic."
      : "No human figures unless essential; never photorealistic people.",
    "ASPECT: 3:2 landscape, high detail, polished professional finish.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { prompt, style };
}

export interface ImageTarget {
  url: string;
  key: string;
  model: string;
}
async function readBody(response: Response, max: number) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error("Image response too large");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
function providerMessage(raw: Buffer) {
  try {
    const j = JSON.parse(raw.toString("utf8"));
    const m = j?.error?.message ?? j?.error ?? j?.message;
    return typeof m === "string" ? m.slice(0, 300) : "";
  } catch {
    return raw.toString("utf8").slice(0, 200);
  }
}
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });
/**
 * Calls an OpenAI-compatible /images/generations endpoint. Prefers 1536×1024 at high quality;
 * gateways that reject those parameters get a plain request. Transient failures retry twice.
 */
export async function requestImage(
  target: ImageTarget,
  prompt: string,
  signal: AbortSignal,
  onRetry: (detail: string) => void = () => {},
): Promise<any> {
  const variants: Record<string, unknown>[] = [
    { size: "1536x1024", quality: "high" },
    { size: "1536x1024" },
    { size: "1024x1024" },
  ];
  let variant = 0,
    transient = 0;
  let lastError = "";
  // Parameter downgrades are free; transient failures (network, 429, 5xx) retry at most twice.
  for (;;) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(target.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${target.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: target.model, prompt, n: 1, ...variants[variant] }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(240_000)]),
      });
    } catch (error) {
      signal.throwIfAborted();
      lastError = error instanceof Error ? error.message : "network error";
      if (++transient > 2) break;
      onRetry(`网络错误或超时：${lastError}，自动重试（${transient + 1}/3）`);
      await sleep(1500 * transient, signal);
      continue;
    }
    const body = await readBody(response, 60_000_000);
    if (response.ok) return JSON.parse(body.toString("utf8"));
    const message = providerMessage(body);
    lastError = `HTTP ${response.status}${message ? `：${message}` : ""}`;
    if (response.status === 400 && variant < variants.length - 1 && /size|quality|param|unsupported|invalid/i.test(message)) {
      variant++;
      onRetry(`接口不支持当前参数，改用 ${JSON.stringify(variants[variant])}`);
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && ++transient <= 2) {
      onRetry(`${lastError}，自动重试（${transient + 1}/3）`);
      await sleep(2000 * transient, signal);
      continue;
    }
    break;
  }
  throw new Error(`图像接口请求失败（${lastError}）。请检查图像模型名称、密钥和接口地址。`);
}
