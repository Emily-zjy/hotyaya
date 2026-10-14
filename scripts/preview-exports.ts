/** Deterministic renderer preview; no model credentials, user files or network calls. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deckSchema } from "../src/worker/schema";
import { exportPptx } from "../src/worker/ppt";
import { renderSlidesHtml } from "../src/worker/slides-html";
import { renderArticleHtml } from "../src/worker/article-html";
import { loadThemes, pickTheme } from "../src/worker/theme";

const out = resolve(".superpowers/pet-preview/exports");
await mkdir(out, { recursive: true });
const themes = loadThemes(resolve("vendor/skills"));
const theme = pickTheme(themes, "ocean-depths");
const stress = deckSchema.parse({
  title: "长内容边界检查",
  design: "technical",
  slides: [
    {
      layout: "chart",
      title: "八个长标签按页展示且保持统一比例",
      chart: {
        name: "边界演示数据",
        labels: Array.from(
          { length: 8 },
          (_, i) => `${i + 1}：${"中文标签".repeat(9)}`,
        ),
        values: [-3, 2, 4, 6, 8, 10, 12, 14],
      },
    },
    {
      layout: "metrics",
      title: "长数值和解释",
      metrics: Array.from({ length: 3 }, () => ({
        value: "十二万亿元人民币年度统计完整口径",
        label: "完整的指标名称需要保留其适用范围和限制条件",
        detail: "这是测试内容。".repeat(12),
      })),
    },
    {
      layout: "process",
      title: "长步骤保留全部说明",
      steps: Array.from({ length: 6 }, (_, i) => ({
        label: `第${i + 1}步${"步骤名称".repeat(7)}`,
        detail: "这是需要完整保留的详细说明。".repeat(10),
      })),
    },
  ],
});
await writeFile(
  resolve(out, "stress-slides.html"),
  renderSlidesHtml(stress, theme),
);
const content = {
  title: "让知识真正用起来",
  subtitle: "个人知识库的整理与复用 · 版式演示",
  slides: [
    {
      layout: "bullets",
      title: "一条笔记，先回答一个问题",
      bullets: [
        "写下当时的问题和判断",
        "保留能核对的来源",
        "为下一次使用留下入口",
      ],
      note: "这里演示列表版式，不把短列表自动转成卡片。",
    },
    {
      layout: "process",
      title: "知识整理的四个步骤",
      steps: [
        { label: "收集", detail: "把材料放进统一的收件箱" },
        { label: "理解", detail: "用自己的话说明核心观点" },
        { label: "连接", detail: "关联正在推进的问题" },
        { label: "复用", detail: "在写作或决策中引用笔记" },
      ],
    },
    {
      layout: "metrics",
      title: "练习计划",
      metrics: [
        { value: "1 个", label: "当前问题", detail: "每次练习只围绕一个问题" },
        {
          value: "3 条",
          label: "支持材料",
          detail: "示例练习要求，并非调研结论",
        },
        { value: "1 次", label: "复盘", detail: "记录哪些材料真正有用" },
      ],
    },
    {
      layout: "compare",
      title: "收藏和理解的区别",
      left: {
        heading: "只是收藏",
        bullets: ["保留原文链接", "按来源建立目录", "很少再次打开"],
      },
      right: {
        heading: "形成自己的理解",
        bullets: ["写下观点和疑问", "按问题建立关联", "使用后补充结论"],
      },
    },
    {
      layout: "timeline",
      title: "四周练习安排",
      steps: [
        { label: "第一周", detail: "整理收件箱，选定一个主题" },
        { label: "第二周", detail: "把材料改写成独立笔记" },
        { label: "第三周", detail: "围绕问题建立主题索引" },
        { label: "第四周", detail: "完成一篇短文并复盘" },
      ],
    },
    {
      layout: "chart",
      title: "示例：每周复用笔记次数",
      chart: {
        name: "虚构演示数据",
        unit: "次",
        labels: ["第一周", "第二周", "第三周", "第四周"],
        values: [2, 4, 5, 8],
      },
      note: "数值仅用于检查图表版式，不代表产品效果。",
    },
    {
      layout: "quote",
      title: "本次练习的目标",
      quote: "写下你理解了什么，以及下一次什么时候会用到它。",
    },
  ],
};
const markdown = `# 让知识真正用起来

记录的价值，在于下一次遇到问题时能够找到并使用它。整理笔记不需要一次完成；从一个正在处理的问题开始，通常更容易坚持。

## 先明确问题
每条笔记尽量回答一个具体问题。保存来源的同时，补上自己的判断，说明哪些内容已经验证，哪些仍然存疑。

> 写下你理解了什么，以及下一次什么时候会用到它。

## 建立整理流程
1. 收集：把材料放进统一的收件箱。
2. 理解：用自己的话说明核心观点。
3. 连接：关联正在推进的问题。
4. 复用：在写作或决策中引用笔记。

## 制定练习计划
以下是一个可调整的练习安排，并非效果承诺。

| 周次 | 练习重点 | 产出 |
| --- | --- | --- |
| 第一周 | 整理收件箱 | 一个主题 |
| 第二周 | 形成独立笔记 | 三条材料 |
| 第三周 | 建立关联 | 主题索引 |
| 第四周 | 写作与复盘 | 一篇短文 |

## 保留使用线索
给笔记添加能帮助检索的字段，避免仅靠文件夹记忆位置。

\`\`\`yaml
topic: 知识管理
status: 待验证
next_use: 下次写作
\`\`\`

## 复盘
回顾笔记是否帮助了实际工作。找不到材料时，调整入口；观点不清楚时，补充解释；证据不足时，保留疑问。
`;
for (const design of ["editorial", "studio", "technical"] as const) {
  const deck = deckSchema.parse({ ...content, design });
  await writeFile(
    resolve(out, `${design}.pptx`),
    await exportPptx(deck, theme),
  );
  await writeFile(
    resolve(out, `${design}-slides.html`),
    renderSlidesHtml(deck, theme),
  );
}
for (const design of ["editorial", "report", "docs"] as const)
  await writeFile(
    resolve(out, `${design}-article.html`),
    renderArticleHtml(markdown, theme, {
      design,
      fallbackTitle: "知识整理",
      summary:
        "围绕一个实际问题整理材料，再把理解用于写作与决策。本文给出可调整的四周练习安排，并保留完整笔记内容。",
    }),
  );
await writeFile(
  resolve(out, "index.html"),
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>hotyaya · 导出版式预览</title><style>body{background:#f3f0e9;color:#1a2332;font-family:system-ui,'Microsoft YaHei',sans-serif;margin:0}main{max-width:1100px;margin:auto;padding:64px 24px}h1{font-size:42px}p{line-height:1.8;color:#53616b}h2{margin-top:48px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}article{border-top:2px solid #1a2332;padding:20px 0}a{color:#176c75;display:inline-block;margin:8px 18px 8px 0}img{width:100%;border:1px solid #ddd}small{letter-spacing:2px}</style><main><small>HOTYAYA / EXPORT DESIGN</small><h1>同一份内容，不同的表达方式</h1><p>下面使用同一份演示内容和同一套配色，便于检查版式差异。图表为明确标注的虚构演示数据。</p><h2>演示稿 · 可编辑 PPT 与 HTML</h2><section>${[
    ["editorial", "阅读与研究"],
    ["studio", "产品与创意"],
    ["technical", "技术与数据"],
  ]
    .map(
      ([id, name]) =>
        `<article><h3>${name}</h3><img src="${id}-rendered/幻灯片1.JPG" alt="${name}的 PowerPoint 实际渲染封面"><a href="${id}-slides.html">打开 HTML 演示</a><a href="${id}.pptx">下载 PPT</a></article>`,
    )
    .join("")}</section><h2>HTML · 完整长文</h2><section>${[
    ["editorial", "杂志阅读"],
    ["report", "专题报告"],
    ["docs", "技术文档"],
  ]
    .map(
      ([id, name]) =>
        `<article><h3>${name}</h3><a href="${id}-article.html">打开网页</a></article>`,
    )
    .join("")}</section></main></html>`,
);
const names: Record<string, string> = {
  "arctic-frost": "极地冰霜",
  "botanical-garden": "植物花园",
  "desert-rose": "沙漠玫瑰",
  "forest-canopy": "森林树冠",
  "golden-hour": "金色时光",
  "midnight-galaxy": "午夜星河",
  "modern-minimalist": "现代简约",
  "ocean-depths": "海洋深蓝",
  "sunset-boulevard": "落日大道",
  "tech-innovation": "科技创新",
};
const paletteCards: string[] = [];
for (const palette of themes) {
  const id = `palette-${palette.id}`;
  const deck = deckSchema.parse({ ...content, design: "studio" });
  await writeFile(resolve(out, `${id}.pptx`), await exportPptx(deck, palette));
  await writeFile(
    resolve(out, `${id}-slides.html`),
    renderSlidesHtml(deck, palette),
  );
  await writeFile(
    resolve(out, `${id}-article.html`),
    renderArticleHtml(markdown, palette, {
      design: "report",
      fallbackTitle: "知识整理",
      summary: "同一份内容使用不同的主题配色，正文与版式保持一致，便于比较。",
    }),
  );
  const source = await readFile(
    resolve("vendor/skills/theme-factory/themes", `${palette.id}.md`),
    "utf8",
  );
  const colors = [...source.matchAll(/`#([0-9a-fA-F]{6})`/g)].map((m) => m[1]);
  paletteCards.push(
    `<article style="--paper:#${palette.light};--ink:#${palette.ink};--accent:#${palette.accent}"><div class="mini"><span>${names[palette.id]}</span><strong>让知识真正用起来</strong><i></i></div><h2>${names[palette.id]} <small>${palette.name}</small></h2><p>skills 原始色板</p><div class="swatches">${colors.map((c) => `<span style="background:#${c}" title="#${c}"></span>`).join("")}</div><p class="hex">${colors.map((c) => `#${c}`).join(" · ")}</p><a href="${id}-slides.html">演示效果</a><a href="${id}-article.html">网页效果</a><a href="${id}.pptx">下载 PPT</a></article>`,
  );
}
await writeFile(
  resolve(out, "palettes.html"),
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>hotyaya · skills 配色总览</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f3ed;color:#24242b;font-family:system-ui,'Microsoft YaHei',sans-serif}main{max-width:1200px;margin:auto;padding:48px 24px}h1{font-size:clamp(30px,5vw,48px)}.intro{max-width:800px;line-height:1.8;color:#666}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-top:36px}article{background:white;border:1px solid #dedbd4;padding:18px}h2{font-size:20px;margin:20px 0 12px}small{display:block;font-size:12px;font-weight:400;color:#707079;margin-top:4px}.mini{height:160px;background:var(--paper);color:var(--ink);padding:22px;position:relative;border-right:48px solid var(--accent)}.mini span{font-size:10px}.mini strong{display:block;font-size:23px;max-width:180px;margin-top:22px}.mini i{display:block;width:32px;height:3px;background:var(--accent);margin-top:16px}.swatches{display:flex;height:30px}.swatches span{flex:1}p{font-size:12px;color:#666}.hex{font-family:monospace;font-size:10px;overflow-wrap:anywhere}a{display:inline-block;color:#353546;margin:8px 16px 0 0;font-size:13px}a:focus-visible{outline:2px solid currentColor;outline-offset:3px}</style><main><a href="index.html">← 版式对照</a><h1>skills 里的 10 套配色</h1><p class="intro">所有色板均读取项目自带的 theme-factory。下面同时展示原始颜色和实际导出效果；为保证文字可读，导出时会从原色派生浅底、正文色与辅助色。点击同一套主题的演示、网页或 PPT，查看完整效果。</p><section>${paletteCards.join("")}</section></main></html>`,
);
const galleryPath = resolve(out, "index.html");
const gallery = await readFile(galleryPath, "utf8");
await writeFile(
  galleryPath,
  gallery.replace(
    "<h2>演示稿",
    '<p><a href="palettes.html">查看 skills 中全部 10 套配色 →</a></p><h2>演示稿',
  ),
);
console.log(`Export previews: ${out}`);
