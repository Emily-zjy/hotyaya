import { z } from "zod";
const httpUrl = z
  .string()
  .max(2048)
  .refine((v) => {
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "Expected HTTP(S) URL");
export const requestSchema = z.object({
  action: z.enum([
    "chat",
    "comment",
    "explain",
    "polish",
    "translate",
    "table",
    "research",
    "image",
    "pptx",
    "slides",
    "html",
  ]),
  instruction: z.string().max(20000),
  document: z.object({
    path: z.string().max(2000),
    content: z.string().max(1000000),
    selection: z.string().max(1000000).optional(),
  }),
  config: z.object({
    baseUrl: z.union([httpUrl, z.literal("")]),
    model: z.string().max(300),
    apiKey: z.string().max(2000).optional(),
    imageModel: z.string().max(300).optional(),
    imageBaseUrl: httpUrl.optional(),
    imageApiKey: z.string().max(2000).optional(),
    fastModel: z.string().max(300).optional(),
  }),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(50000),
      }),
    )
    .max(30)
    .optional(),
  targetLanguage: z.enum(["zh", "en"]).optional(),
  searchUrl: httpUrl.optional(),
  crawlUrl: httpUrl.optional(),
  browserMcpUrl: httpUrl.optional(),
  localChrome: z.boolean().optional(),
});
export const tableSchema = z
  .object({
    columns: z.array(z.string().min(1).max(200)).min(1).max(20),
    rows: z.array(z.array(z.string().max(4000))).max(200),
  })
  .refine(
    (v) => v.rows.every((r) => r.length === v.columns.length),
    "Rows must match column count",
  );
const clip = (max: number) =>
  z.string().transform((v) => v.trim().slice(0, max));
const points = z
  .array(clip(200))
  .default([])
  .transform((v) => v.filter(Boolean).slice(0, 9));
export const deckSchema = z.object({
  title: clip(120).pipe(z.string().min(1)),
  subtitle: clip(200).optional(),
  design: z
    .enum(["editorial", "studio", "technical"])
    .optional()
    .catch(undefined),
  slides: z
    .array(
      z.object({
        layout: z
          .enum([
            "bullets",
            "cards",
            "compare",
            "quote",
            "section",
            "process",
            "timeline",
            "metrics",
            "chart",
          ])
          .catch("bullets"),
        title: clip(80).pipe(z.string().min(1)),
        bullets: points,
        left: z.object({ heading: clip(60), bullets: points }).optional(),
        right: z.object({ heading: clip(60), bullets: points }).optional(),
        quote: clip(200).optional(),
        steps: z
          .array(z.object({ label: clip(40), detail: clip(160).optional() }))
          .max(12)
          .optional(),
        metrics: z
          .array(
            z.object({
              value: clip(24),
              label: clip(60),
              detail: clip(100).optional(),
            }),
          )
          .max(9)
          .optional(),
        chart: z
          .object({
            name: clip(80),
            labels: z.array(clip(40)).min(1).max(8),
            values: z.array(z.number().finite()).min(1).max(8),
            unit: clip(20).optional(),
          })
          .refine(
            (c) => c.labels.length === c.values.length,
            "Chart labels must match values",
          )
          .optional(),
        note: clip(1000).optional(),
      }),
    )
    .min(1)
    .max(30),
});
export type Deck = z.infer<typeof deckSchema>;
/** Parse model JSON, tolerating code fences and prose around the outermost object. */
export function parseJSON(value: string) {
  const text = value
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf("{"),
      end = text.lastIndexOf("}");
    if (start >= 0 && end > start)
      return JSON.parse(text.slice(start, end + 1));
    throw error;
  }
}
