# PPT 与 HTML 导出视觉改进

## 问题与范围

用户反馈 PPT 和 HTML 输出看起来一样。代码中主题主要更换配色，PPT 与 HTML 演示稿把 2–4 条短列表强制转成卡片，文章导出只有深色首屏与侧栏一种构图。

沿用现有 PptxGenJS、Markdown 和离线导出流程，不替换插件基础设施。

## 调研与应用

- [Microsoft：有效演示建议](https://support.microsoft.com/en-us/powerpoint/tips-for-creating-and-delivering-an-effective-presentation)：简洁文字、可读字体、适量图表。增加内容语义版式，减少单页密度。
- [Presentation Zen：设计建议](https://www.garrreynolds.com/design-tips)：视觉层次、简洁构图。使封面、重点结论、流程和数据页各自承担不同表达目的。
- [reveal.js：Layout](https://revealjs.com/layout/)：参照演示舞台的空间组织原则，保留现有离线 HTML 实现，不引入 CDN。
- [USWDS：Typography](https://designsystem.digital.gov/components/typography/)：长文需要适当行宽与行距。文章保留完整来源正文，以响应式阅读栏呈现。
- [PptxGenJS：Charts](https://gitbrent.github.io/PptxGenJS/docs/api-charts/)：使用原生可编辑条形图。

## 实现

演示稿增加独立于 theme 的 design：editorial（浅色编辑式）、studio（标题与内容索引分栏）、technical（技术演示）。新增 process、timeline、metrics、chart；不再把短列表自动改成卡片。

HTML 文章增加 editorial、report、docs；分别采用杂志式页首、报告摘要分栏、紧凑文档页首与目录。包含目录锚点、阅读时长、跳至正文和返回顶部，正文仍从原始 Markdown 渲染，模型不改写正文。

模型提示根据来源和用户风格要求选版式；不得为了填充数据图表编造数值。旧 JSON 未给 design 时仍可渲染。语义数据由 Zod 校验，HTML 文本转义，备注通过 textContent 显示。

密集列表、对比、流程、指标、长标签图表分页。流程延续原始编号，图表分页保持共同数值范围。原生 PPT 的文字、形状和图表可编辑。

## 验证

`scripts/preview-exports.ts` 使用同一演示内容与配色生成三套 PPT/HTML 演示及三套文章，生成路径 `.superpowers/pet-preview/exports`。图表样例明确标注虚构。

`scripts/render-export-preview.ps1` 使用本机 PowerPoint 后台渲染样例，关闭自己打开的文档，不关闭已有用户文档。自动测试覆盖原生图表、内容保留、安全转义、分页比例与编号、中文阅读时长及已有 worker 导出流程。浏览器检查宽屏、窄屏、翻页与备注。
