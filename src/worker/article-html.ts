import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root, Element, Text } from "hast";
import { fonts, type Theme } from "./theme";
import { articleDesign } from "./export-design";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function textOf(node: Element): string {
  let out = "";
  visit(node, "text", (t: Text) => {
    out += t.value;
  });
  return out;
}
export function splitNote(markdown: string) {
  const front = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let body = front ? markdown.slice(front[0].length) : markdown;
  const title =
    front?.[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1] ??
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    "";
  // The title becomes the page header; drop the duplicate H1.
  body = body.replace(/^#\s+.+\r?\n?/m, "");
  const tags =
    front?.[1]
      .match(/^tags:\s*\[?([^\]\n]*)\]?/m)?.[1]
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean) ?? [];
  const date =
    front?.[1].match(/^(?:updated|created|date):\s*(.+)$/m)?.[1]?.trim() ?? "";
  return { title, body, tags, date };
}
/**
 * The article body is the note's own Markdown (raw HTML in the note is never passed
 * through), styled with a theme-factory theme. The model only contributes the summary.
 */
export function renderArticleHtml(
  markdown: string,
  theme: Theme,
  opts: { summary?: string; fallbackTitle: string; design?: unknown },
): string {
  const t = theme;
  const f = fonts(t);
  const note = splitNote(markdown);
  const title = note.title || opts.fallbackTitle;
  const design = articleDesign(opts.design, note.body, theme);
  const readingMinutes = Math.max(
    1,
    Math.ceil(
      (note.body.match(/[\u3400-\u9fff]/g)?.length ?? 0) / 400 +
        (note.body.match(/[a-zA-Z]+/g)?.length ?? 0) / 220,
    ),
  );
  const toc: { id: string; text: string }[] = [];
  const html = String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(() => (tree: Root) => {
        visit(tree, "element", (node: Element) => {
          if (node.tagName === "h2") {
            const id = `s${toc.length + 1}`;
            node.properties = { ...node.properties, id };
            toc.push({ id, text: textOf(node) });
          }
          if (node.tagName === "table") {
            node.properties = { ...node.properties, className: ["tbl"] };
          }
          if (node.tagName === "a")
            node.properties = {
              ...node.properties,
              rel: ["noopener", "noreferrer"],
            };
        });
      })
      .use(rehypeStringify)
      .processSync(note.body),
  );
  const meta = [note.date, ...note.tags].filter(Boolean);
  const index =
    toc.length >= 2
      ? `<nav class="toc" aria-label="目录"><strong>本页目录</strong>${toc.map((h, i) => `<a href="#${h.id}"><span>${String(i + 1).padStart(2, "0")}</span>${esc(h.text)}</a>`).join("")}</nav>`
      : "";
  const heading = `<div class="heading"><p class="eyebrow">${design === "docs" ? "文档" : design === "report" ? "专题报告" : "阅读笔记"} · 约 ${readingMinutes} 分钟</p><h1>${esc(title)}</h1>${meta.length ? `<div class="meta">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>` : ""}</div>`;
  const summary = opts.summary
    ? `<div class="summary"><span class="summary-label">内容提要</span><p>${esc(opts.summary)}</p></div>`
    : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--dark:#${t.dark};--light:#${t.light};--accent:#${t.accent};--accent2:#${t.accent2};--ink:#${t.ink};--muted:#${t.muted};--soft:#${t.soft};--line:#${t.line};--head:${f.cssHead};--body:${f.cssBody}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--light);color:var(--ink);font-family:var(--body);font-size:17px;line-height:1.85;-webkit-font-smoothing:antialiased}
header.hero{background:var(--dark);color:var(--light);padding:96px 24px 72px}
.hero .in,.wrap{max-width:1080px;margin:0 auto}
.hero h1{font-family:var(--head);font-size:clamp(32px,5vw,52px);line-height:1.2;margin:0;max-width:22em;letter-spacing:.01em}
.hero .rule{width:72px;height:6px;background:var(--accent2);margin:28px 0}
.hero p{font-size:19px;line-height:1.75;max-width:40em;margin:0;opacity:.86}
.hero .meta{margin-top:28px;display:flex;flex-wrap:wrap;gap:8px}
.hero .meta span{font-size:13px;padding:3px 12px;border:1px solid currentColor;border-radius:999px;opacity:.7}
.wrap{display:grid;grid-template-columns:220px minmax(0,1fr);gap:64px;padding:64px 24px 96px}
nav.toc{position:sticky;top:32px;align-self:start;font-size:14px;line-height:1.5}
nav.toc strong{display:block;font-size:13px;color:var(--muted);margin-bottom:12px;font-weight:600}
nav.toc a{display:block;color:var(--muted);text-decoration:none;padding:6px 0 6px 14px;border-left:2px solid var(--line)}
nav.toc a:hover,nav.toc a:focus-visible{color:var(--ink);border-left-color:var(--accent)}
article{max-width:44em;min-width:0}
article>:first-child{margin-top:0}
article h2{font-family:var(--head);font-size:28px;line-height:1.3;margin:64px 0 18px;padding-top:12px;border-top:3px solid var(--accent)}
article h3{font-family:var(--head);font-size:21px;margin:36px 0 10px}
article p{margin:0 0 18px}
article ul,article ol{padding-left:1.4em;margin:0 0 20px}
article li{margin:6px 0}
article li::marker{color:var(--accent)}
article a{color:var(--accent);text-underline-offset:3px}
article strong{color:var(--ink)}
article blockquote{margin:28px 0;padding:18px 24px;background:var(--soft);border-left:5px solid var(--accent2);font-size:18px}
article blockquote p:last-child{margin:0}
article code{font-family:Consolas,"SFMono-Regular",monospace;font-size:.88em;background:var(--soft);padding:2px 6px;border-radius:4px}
article pre{background:var(--dark);color:var(--light);padding:20px 22px;border-radius:8px;overflow:auto;line-height:1.65;font-size:14.5px}
article pre code{background:none;padding:0;color:inherit}
.tbl{width:100%;border-collapse:collapse;margin:24px 0;font-size:15px;display:block;overflow-x:auto}
.tbl th{background:var(--soft);text-align:left;font-weight:600}
.tbl th,.tbl td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}
hr{border:0;border-top:1px solid var(--line);margin:48px 0}
img{max-width:100%}
a:focus-visible{outline:3px solid var(--accent2);outline-offset:2px}
.skip{position:absolute;top:-100px;left:16px;padding:8px 16px;background:var(--light);z-index:5}.skip:focus{top:12px}
.eyebrow{font-size:12px!important;letter-spacing:.12em;margin-bottom:28px!important;color:var(--muted)}
.summary-label{display:block;font-size:12px;font-weight:700;letter-spacing:.08em;margin-bottom:12px}
.summary{margin-top:28px}.summary p{font-size:18px}
nav.toc a{display:flex;gap:12px}nav.toc a span{font-size:11px;opacity:.7;padding-top:3px}
article{overflow-wrap:anywhere;counter-reset:section}article h2{scroll-margin-top:32px}article pre{overflow-wrap:normal}footer{max-width:1080px;margin:auto;padding:24px;border-top:1px solid var(--line);font-size:13px;display:flex;justify-content:space-between}footer a{color:var(--ink)}
.wrap.no-toc{grid-template-columns:minmax(0,1fr);max-width:820px}
body[data-design="editorial"] header.hero{background:var(--light);color:var(--ink);padding:64px 24px 50px;border-top:8px solid var(--ink)}
body[data-design="editorial"] .hero .in{max-width:1080px;border-bottom:1px solid var(--ink);padding-bottom:44px}
body[data-design="editorial"] .hero h1{font-size:clamp(38px,6vw,78px);font-family:"Songti SC",SimSun,Georgia,serif;max-width:16em;font-weight:600;line-height:1.25}
body[data-design="editorial"] .summary{max-width:45em;border-left:3px solid var(--accent);padding-left:24px;margin-top:40px}
body[data-design="editorial"] .summary-label{display:none}body[data-design="editorial"] .wrap{padding-top:32px}
body[data-design="editorial"] article h2{border:0;font-size:30px;margin-top:54px}body[data-design="editorial"] article blockquote{background:none;border-left:2px solid var(--accent);font-size:21px}
body[data-design="report"] header.hero{background:var(--dark);color:var(--light);padding:72px 24px}
body[data-design="report"] .hero .in{display:grid;grid-template-columns:1.25fr 1fr;gap:64px;align-items:end}
body[data-design="report"] .eyebrow{color:var(--light);opacity:.7}
body[data-design="report"] .summary{padding:28px;border:1px solid #ffffff55;margin:0}
body[data-design="report"] .summary p{font-size:16px}body[data-design="report"] .hero h1{font-size:clamp(32px,4vw,56px)}
body[data-design="report"] article h2{counter-increment:section;border-top:1px solid var(--line);padding-top:24px}body[data-design="report"] article h2::before{content:counter(section,decimal-leading-zero);font-size:15px;color:var(--accent);margin-right:16px;vertical-align:middle}
body[data-design="docs"] header.hero{background:var(--light);color:var(--ink);padding:40px 24px 32px;border-bottom:1px solid var(--line)}
body[data-design="docs"] .hero .in{max-width:1200px;padding-left:284px}body[data-design="docs"] .hero h1{font-size:36px}body[data-design="docs"] .eyebrow{margin-bottom:14px!important}
body[data-design="docs"] .summary{margin-top:18px}.summary p{max-width:42em}body[data-design="docs"] .summary-label{display:none}body[data-design="docs"] .summary p{font-size:16px}
body[data-design="docs"] .wrap{max-width:1200px;padding-top:36px;gap:64px}body[data-design="docs"] nav.toc{background:var(--soft);padding:20px;border-radius:6px}
body[data-design="docs"] article h2{border-top:0;border-bottom:1px solid var(--line);padding-bottom:12px;font-size:25px;margin-top:44px}body[data-design="docs"] article pre{border-radius:0;border-left:4px solid var(--accent2)}
@media (max-width:860px){body[data-design="report"] .hero .in{grid-template-columns:1fr;gap:24px}body[data-design="docs"] .hero .in{padding-left:0}.hero{padding-top:40px!important}article{max-width:100%}}
@media (max-width:860px){.wrap{grid-template-columns:1fr;gap:24px}nav.toc{position:static;border-bottom:1px solid var(--line);padding-bottom:16px}}
@media print{header.hero{background:none;color:var(--ink);padding:0 0 24px}nav.toc{display:none}.wrap{display:block;padding:0}}
</style>
</head>
<body data-design="${design}" id="top">
<a class="skip" href="#content">跳至正文</a>
<header class="hero"><div class="in">${heading}${summary}</div></header>
<div class="wrap${index ? "" : " no-toc"}">
${index}
<article id="content">
${html}
</article>
</div>
<footer><span>${esc(title)}</span><a href="#top">回到顶部 ↑</a></footer>
</body>
</html>
`;
}
