import type { Deck } from "./schema";
import type { Theme } from "./theme";

export type DeckDesign = "editorial" | "studio" | "technical";
export type ArticleDesign = "editorial" | "report" | "docs";
export function deckDesign(deck: Deck, theme: Theme): DeckDesign {
  return (
    deck.design ??
    (theme.serif
      ? "editorial"
      : /tech|midnight|ocean/.test(theme.id)
        ? "technical"
        : "studio")
  );
}
export function articleDesign(
  choice: unknown,
  markdown: string,
  theme: Theme,
): ArticleDesign {
  if (choice === "editorial" || choice === "report" || choice === "docs")
    return choice;
  if (/^```|^#{2,3}\s.*(?:API|安装|配置|接口)/m.test(markdown)) return "docs";
  if (/^\|.+\|\s*$|^#{2,3}\s.*(?:指标|计划|总结|评审)/m.test(markdown))
    return "report";
  return "editorial";
}

/** Keep content readable without silently cutting overflowing lists or diagrams. */
export type PreparedSlide = Deck["slides"][number] & {
  startIndex?: number;
  chartRange?: { min: number; max: number };
};
export function prepareSlides(deck: Deck): PreparedSlide[] {
  return deck.slides
    .filter(
      (s, i) => !(i === 0 && s.layout === "section" && s.title === deck.title),
    )
    .flatMap((s) => {
      if (
        (s.layout === "process" || s.layout === "timeline") &&
        !s.steps?.length
      )
        s = { ...s, steps: s.bullets.map((label) => ({ label })) };
      if (
        (s.layout === "metrics" && !s.metrics?.length) ||
        (s.layout === "chart" && !s.chart)
      )
        s = { ...s, layout: "bullets" };
      if (s.layout === "chart" && s.chart) {
        const chart = s.chart;
        const count = chart.labels.some((label) => label.length > 16) ? 2 : 6;
        const pages = Math.ceil(chart.labels.length / count);
        const min = Math.min(0, ...chart.values),
          max = Math.max(0, ...chart.values);
        return Array.from({ length: pages }, (_, i) => ({
          ...s,
          chartRange: { min, max: min === max ? max + 1 : max },
          title: pages > 1 ? `${s.title} · ${i + 1}/${pages}` : s.title,
          chart: {
            ...chart,
            labels: chart.labels.slice(i * count, (i + 1) * count),
            values: chart.values.slice(i * count, (i + 1) * count),
          },
        }));
      }
      if (s.layout === "compare" && (s.left || s.right)) {
        const count = [
          ...(s.left?.bullets ?? []),
          ...(s.right?.bullets ?? []),
        ].some((v) => v.length > 60)
          ? 2
          : 4;
        const pages = Math.max(
          1,
          Math.ceil(
            Math.max(
              s.left?.bullets.length ?? 0,
              s.right?.bullets.length ?? 0,
            ) / count,
          ),
        );
        return Array.from({ length: pages }, (_, i) => ({
          ...s,
          title: pages > 1 ? `${s.title} · ${i + 1}/${pages}` : s.title,
          left: s.left && {
            ...s.left,
            bullets: s.left.bullets.slice(i * count, (i + 1) * count),
          },
          right: s.right && {
            ...s.right,
            bullets: s.right.bullets.slice(i * count, (i + 1) * count),
          },
        }));
      }
      const field =
        s.layout === "process" || s.layout === "timeline"
          ? "steps"
          : s.layout === "metrics"
            ? "metrics"
            : s.layout === "cards" || s.layout === "bullets"
              ? "bullets"
              : null;
      if (!field) return [s];
      const items = s[field] ?? [];
      const long = items.some((v) =>
        typeof v === "string"
          ? v.length > 80
          : (v.detail?.length ?? 0) > 80 || v.label.length > 20,
      );
      const count =
        s.layout === "metrics"
          ? s.metrics!.some(
              (m) =>
                m.value.length > 8 ||
                m.label.length > 20 ||
                (m.detail?.length ?? 0) > 60,
            )
            ? 1
            : 3
          : long
            ? 2
            : 4;
      if (items.length <= count) return [s];
      return Array.from(
        { length: Math.ceil(items.length / count) },
        (_, i) => ({
          ...s,
          title: `${s.title} · ${i + 1}/${Math.ceil(items.length / count)}`,
          startIndex: i * count,
          [field]: items.slice(i * count, (i + 1) * count),
        }),
      );
    });
}

export const DECK_DIRECTIVE = `Return ONLY JSON:
{"theme":"one id from THEMES","design":"editorial|studio|technical","title":"deck title","subtitle":"one line","slides":[{"layout":"bullets|cards|compare|quote|section|process|timeline|metrics|chart","title":"specific conclusion","bullets":["short point"],"left":{"heading":"","bullets":[]},"right":{"heading":"","bullets":[]},"quote":"","steps":[{"label":"stage/date","detail":"what happens"}],"metrics":[{"value":"exact source number with unit","label":"what it measures","detail":"source or scope"}],"chart":{"name":"measure","unit":"unit","labels":["category"],"values":[12]},"note":"speaker notes"}]}.
Only include fields needed by each layout. Build 6–12 slides in the document language, fewer for short sources. One claim per slide; put supporting detail and caveats in speaker notes. Use source content only. NEVER invent numbers, dates, quotes, sources or metrics to fill a design. Charts require comparable numeric values and the same unit explicitly in the source; otherwise choose prose. Preserve uncertainty.
Choose design to match content AND user preference: editorial for reading/research (light paper, oversized type, asymmetric margins); studio for product/creative storytelling (split cover, large shapes); technical for engineering/data (dark cover, ruled grid). Design changes composition, not just palette. Choose a matching theme independently. Use process for ordered steps, timeline for dates/milestones, metrics for up to 3 explicit KPIs, chart for up to 8 comparable values, compare for two alternatives, quote for one source takeaway, cards only for parallel categories. Prefer 3–4 relevant layout types when content supports them; never force variety by inventing facts. Do not turn every short list into cards. At most 4 short points/steps per slide; split dense content. No code, SVG or markdown.`;
export const ARTICLE_DIRECTIVE = `Return ONLY JSON {"theme":"one id from THEMES","design":"editorial|report|docs","summary":"2–3 sentence factual overview in the document language"}. Honor the user's visual preference; otherwise choose editorial for essays/reading notes (paper masthead, spacious reading column), report for reviews/plans (split summary and section index), docs for technical guides (compact header, sticky navigation, code/table emphasis). Choose theme independently. Preserve uncertainty and never invent metrics, author names, dates or claims. The full article body is rendered from the source document, not rewritten.`;
