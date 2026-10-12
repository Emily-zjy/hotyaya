import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root, Element, Text } from "hast";
import { fonts, type Theme } from "./theme";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
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
  const date = front?.[1].match(/^(?:updated|created|date):\s*(.+)$/m)?.[1]?.trim() ?? "";
  return { title, body, tags, date };
}
/**
 * The article body is the note's own Markdown (raw HTML in the note is never passed
 * through), styled with a theme-factory theme. The model only contributes the summary.
 */
export function renderArticleHtml(
  markdown: string,
  theme: Theme,
  opts: { summary?: string; fallbackTitle: string },
): string {
  const t = theme;
  const f = fonts(t);
  const note = splitNote(markdown);
  const title = note.title || opts.fallbackTitle;
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
            node.properties = { ...node.properties, rel: ["noopener", "noreferrer"] };
        });
      })
      .use(rehypeStringify)
      .processSync(note.body),
  );
  const meta = [note.date, ...note.tags].filter(Boolean);
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
@media (max-width:860px){.wrap{grid-template-columns:1fr;gap:24px}nav.toc{position:static;border-bottom:1px solid var(--line);padding-bottom:16px}}
@media print{header.hero{background:none;color:var(--ink);padding:0 0 24px}nav.toc{display:none}.wrap{display:block;padding:0}}
</style>
</head>
<body>
<header class="hero"><div class="in"><h1>${esc(title)}</h1><div class="rule"></div>${opts.summary ? `<p>${esc(opts.summary)}</p>` : ""}${meta.length ? `<div class="meta">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>` : ""}</div></header>
<div class="wrap">
${toc.length >= 2 ? `<nav class="toc" aria-label="目录"><strong>目录</strong>${toc.map((h) => `<a href="#${h.id}">${esc(h.text)}</a>`).join("")}</nav>` : "<div></div>"}
<article>
${html}
</article>
</div>
</body>
</html>
`;
}
