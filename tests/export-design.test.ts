// @vitest-environment jsdom
import { expect, test } from "vitest";
import JSZip from "jszip";
import { deckSchema } from "../src/worker/schema";
import { renderSlidesHtml } from "../src/worker/slides-html";
import { renderArticleHtml } from "../src/worker/article-html";
import { exportPptx } from "../src/worker/ppt";
import { loadThemes, pickTheme } from "../src/worker/theme";
import { resolve } from "node:path";
import { prepareSlides } from "../src/worker/export-design";

const theme = pickTheme(loadThemes(resolve("vendor/skills")), "ocean-depths");
const sample = {
  title: "产品评审",
  design: "editorial",
  slides: [
    { layout: "bullets", title: "结论", bullets: ["先验证需求", "再扩展功能"] },
    {
      layout: "process",
      title: "实施步骤",
      steps: [
        { label: "调研", detail: "访谈用户" },
        { label: "验证", detail: "小范围试用" },
      ],
    },
    {
      layout: "timeline",
      title: "计划",
      steps: [
        { label: "第一周", detail: "建立基线" },
        { label: "第二周", detail: "评审改进" },
      ],
    },
    {
      layout: "metrics",
      title: "样例指标",
      metrics: [{ value: "12", label: "样例访谈数", detail: "演示数据" }],
    },
    {
      layout: "chart",
      title: "样例分布",
      chart: { labels: ["甲组", "乙组"], values: [12, 8], name: "演示数据" },
    },
  ],
};
test("semantic layouts survive validation and stay distinct from cards", () => {
  const deck = deckSchema.parse(sample);
  expect(deck.slides.map((s) => s.layout)).toEqual([
    "bullets",
    "process",
    "timeline",
    "metrics",
    "chart",
  ]);
  const doc = new DOMParser().parseFromString(
    renderSlidesHtml(deck, theme),
    "text/html",
  );
  expect(doc.querySelector('.slide[data-layout="bullets"] .cards')).toBeNull();
  for (const layout of ["process", "timeline", "metrics", "chart"])
    expect(doc.querySelector(`.slide[data-layout="${layout}"]`)).not.toBeNull();
  expect(doc.body.textContent).toContain("访谈用户");
  expect(doc.body.textContent).toContain("样例访谈数");
});
test("native PPT contains editable charts and semantic content", async () => {
  const zip = await JSZip.loadAsync(await exportPptx(sample, theme));
  expect(
    Object.keys(zip.files).some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)),
  ).toBe(true);
  const xml = (
    await Promise.all(
      Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .map((f) => zip.file(f)!.async("string")),
    )
  ).join("");
  expect(xml).toContain("访谈用户");
  expect(xml).toContain("样例访谈数");
});
test("article layouts differ structurally and preserve safe source content", () => {
  const markdown =
    "# 阅读笔记\n\n## 发现\n原文事实。\n\n## 行动\n- 验证假设\n\n<script>alert(1)</script>";
  for (const design of ["editorial", "report", "docs"] as const) {
    const html = renderArticleHtml(markdown, theme, {
      fallbackTitle: "笔记",
      summary: "摘要",
      design,
    });
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.body.dataset.design).toBe(design);
    expect(doc.querySelector("article")!.textContent).toContain("原文事实");
    expect(doc.querySelectorAll("nav.toc a")).toHaveLength(2);
    expect(html).not.toContain("alert(1)");
    expect(doc.querySelector(".hero")).not.toBeNull();
  }
});
test("speaker notes are accessible without exposing model HTML", () => {
  const doc = new DOMParser().parseFromString(
    renderSlidesHtml(
      deckSchema.parse({
        title: "标题",
        slides: [
          {
            layout: "quote",
            title: "结论",
            quote: "<img src=x>",
            note: "</script><script>alert(1)</script>",
          },
        ],
      }),
      theme,
    ),
    "text/html",
  );
  expect(doc.querySelector('button[aria-label="讲者备注"]')).not.toBeNull();
  expect(doc.querySelector("img")).toBeNull();
  expect(doc.querySelectorAll("script")).toHaveLength(1);
});
test("dense charts and metrics paginate, while steps keep their sequence", () => {
  const labels = Array.from(
    { length: 8 },
    (_, i) => `${i}：${"中文标签".repeat(9)}`,
  );
  const deck = deckSchema.parse({
    title: "长内容",
    slides: [
      {
        layout: "chart",
        title: "图表",
        chart: { name: "数据", labels, values: [1, 2, 3, 4, 5, 6, 7, 8] },
      },
      {
        layout: "metrics",
        title: "指标",
        metrics: Array.from({ length: 3 }, (_, i) => ({
          value: `${i} 万亿人民币，截至本年度末`,
          label: "完整指标",
        })),
      },
      {
        layout: "process",
        title: "步骤",
        steps: Array.from({ length: 6 }, (_, i) => ({ label: `步骤${i + 1}` })),
      },
    ],
  });
  const pages = prepareSlides(deck);
  expect(pages.filter((s) => s.layout === "chart")).toHaveLength(4);
  expect(
    pages.filter((s) => s.layout === "chart").flatMap((s) => s.chart!.labels),
  ).toEqual(labels);
  expect(
    pages
      .filter((s) => s.layout === "chart")
      .every((s) => s.chartRange?.max === 8),
  ).toBe(true);
  expect(pages.filter((s) => s.layout === "metrics")).toHaveLength(3);
  const doc = new DOMParser().parseFromString(
    renderSlidesHtml(deck, theme),
    "text/html",
  );
  expect(
    [...doc.querySelectorAll(".step-num")].map((n) => n.textContent),
  ).toEqual(["1", "2", "3", "4", "5", "6"]);
});
test("Chinese article reading time counts Han characters", () => {
  const html = renderArticleHtml("# 长文\n\n" + "汉".repeat(1200), theme, {
    fallbackTitle: "长文",
  });
  expect(html).toContain("约 3 分钟");
});
