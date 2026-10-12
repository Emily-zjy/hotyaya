import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const bundle = await build({
  entryPoints: ["scripts/preview.tsx"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const html =
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><style>body{margin:0;background:#faf9f6;font:16px system-ui;color:#343934}main{margin:60px;max-width:600px;line-height:1.9}button,textarea{font:inherit}*{box-sizing:border-box}</style><main><small>MD Companion · 界面验收（模拟数据）</small><h1>让阅读留下痕迹</h1><p>把阅读变成日常：先记下疑问，再寻找联系。</p><hr><p>这是独立浏览器预览，用于检查真实插件组件的布局和交互。</p></main><div id="root"></div><script src="/app.js"></script></html>';
createServer(async (req, res) => {
  try {
    const route = req.url || "/";
    if (route === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
    } else if (route === "/app.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].contents);
    } else if (route === "/styles.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(await readFile("styles.css"));
    } else if (route === "/sample.png" && process.env.PREVIEW_IMAGE) {
      res.setHeader("Content-Type", "image/png");
      res.end(await readFile(process.env.PREVIEW_IMAGE));
    } else if (route === "/assets/pet/yellow_idle_8fps.gif") {
      res.setHeader("Content-Type", "image/gif");
      res.end(await readFile("." + route));
    } else {
      res.writeHead(404);
      res.end();
    }
  } catch {
    res.writeHead(500);
    res.end();
  }
}).listen(4179, "127.0.0.1", () =>
  console.log("Preview http://127.0.0.1:4179 (fixture only)"),
);

