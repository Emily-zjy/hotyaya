# MD Companion · hotyaya

Obsidian 桌面插件：在 Markdown 笔记右上角开启辅助器，小黄鸭陪伴阅读，点击后打开白色简约聊天窗。任务通过 LangGraph 执行，显示真实步骤、耗时、模型流式输出和结果。

## 安装

1. 将发行包中的整个 `md-companion` 文件夹复制到你的库的 `.obsidian/plugins/`。必须保留 `worker.cjs`、`vendor/` 和 `assets/`，不要只复制 `main.js`。
2. 在 Obsidian 的第三方插件中启用 **hotyaya**。要求桌面版 Obsidian 1.11.4 或更新。
3. 打开插件设置，点击“扫描配置”，选择 Obsidian SecretStorage 中的密钥，或者“手动输入”。填写 OpenAI 兼容 API 地址和模型名称，再“测试连接”。支持 LiteLLM。
4. 打开 `.md`，点击右上角闪光图标开启。拖动小黄鸭可移动位置，点击聊天，也可选中文字后右键使用翻译、配图、表格。

插件需要本机安装 Node.js 22 或更新版本，并自动查找 Node 启动随包附带的执行器，不需要手动运行服务。Windows 会查找 PATH 和 Node 标准安装目录；自定义运行时可设置 `MD_COMPANION_NODE` 为 node.exe 的完整路径。它只监听 `127.0.0.1`，使用每次启动生成的随机令牌。插件关闭时结束执行器。模型密钥只存在于 SecretStorage/环境变量和请求内存中，不写入 `data.json`。

0.1.1 修复了某些 Obsidian 安装中执行器启动即退出的问题：不再把 Obsidian.exe 当作 Node.js 运行时。更新插件文件后，需要在第三方插件中关闭再开启 hotyaya。

### 地址从哪里获取

- **模型 API 地址、模型名、密钥**：从你正在使用的模型服务商控制台/API 文档取得，三项要对应同一服务。已有公司网关就使用管理员给出的连接信息，不是浏览器聊天页面地址。
- **SearXNG**：你或管理员部署的搜索服务地址，只在“相关资讯”功能中需要。没有部署先留空。[官方部署说明](https://docs.searxng.org/admin/installation-docker.html)。
- **Crawl4AI**：可选的网页正文抓取服务地址。没有部署留空，有 SearXNG 也可使用搜索摘要。[上游部署说明](https://github.com/unclecode/crawl4ai)。
- **图像 API**：图像服务商提供。与聊天服务共用接口时，地址可以留空；图像模型名称需从支持生图的模型列表取得。普通聊天模型不一定能生图。

`127.0.0.1` 是你的电脑，不是已提供给你的公共服务；必须先在电脑上启动服务才可连接。联网与配图配置默认折叠，不影响基础文字功能。

## 功能

| 操作 | 实际复用 |
|---|---|
| 阅读、解读、简短评论 | Fabric patterns + LangChain |
| 中文/英文自然润色 | Humanizer-zh / Humanizer |
| 中英互译 | Baoyu Translate；自动选择相反语言，也可在聊天中指定 |
| 选区表格 | LangChain + Zod 校验 + remark-gfm Markdown 序列化 |
| HTML 文章 | Baoyu Markdown/HTML skill 指导模型生成单文件 HTML |
| HTML 演示稿 | Frontend Slides 的 skill、预设和 HTML/CSS 参考 |
| 可编辑 PPTX | PPT Master 的完整 attribution guard、SVG quality checker 和原生 SVG→DrawingML 导出器 |
| 企业插图 | Baoyu illustration/image-gen 参考 + 配置的 images/generations API；保存或插入选区后 |
| 相关资讯 | SearXNG JSON 搜索 + 可选 Crawl4AI 正文抓取；校验回答中的引用属于真实检索结果 |
| 聊天交互 | assistant-ui ExternalStoreRuntime/Composer、React、Radix Collapsible、Lucide |
| 宠物素材 | VS Code Pets 的 Marc Duiker 小黄鸭动画；未包含限制分发的猫咪素材 |

聊天可输入 `/pptx`、`/slides`、`/html`、`/image`、`/research`、`/translate`、`/polish`、`/table`，或者“生成 PPT”“整理成表格”等常见指令。输入框左侧“＋”展开功能菜单，选择后自动收起。顶部采用无 logo 的紧凑单行栏，按住标题栏可拖动聊天框；宠物可独立拖动。两者均限制在窗口内。切换笔记后只为已开启辅助器的 .md 显示，任务绑定当前文件快照。

文字修改先展示差异，点击“应用修改”才替换选区（无选区时替换全文）。生成期间修改笔记或切换文件，会拒绝应用旧结果。应用后可点“撤销修改”；继续手动编辑后请使用 Obsidian 自带撤销。导出采用唯一文件名，不覆盖既有文件。自动评论仅作用于本次会话中明确开启的当前笔记，停笔 12 秒后触发，至少间隔 60 秒，可在设置/聊天中开启安静模式。

## PPT 导出

0.2.0 起 PPT 由 pptxgenjs（MIT）在执行器内直接生成原生可编辑的文字和形状，不再需要 Python。模型先输出结构化大纲（封面、要点、卡片、对比、金句、章节页），再排版为 16:9 白底商务版式，附讲者备注。

## 联网与配图

联网：填写你自己的 SearXNG 地址，例如 `http://127.0.0.1:8080`，服务需启用 JSON 输出。Crawl4AI 地址可选；未填写时明确只使用搜索摘要，填写后调用 `/crawl` 读取正文。`services/` 中提供可选 Docker Compose 配置。

配图：填写图像模型 ID，接口需支持 OpenAI 兼容的 `/images/generations`，返回 `data[0].b64_json` 或 `data[0].url`。可单独配置图像 API 与密钥。输出保存到库内配置的目录，再点击“插入配图”插入选区后。没有配置时会显示具体错误，不会伪造图片。

执行器可发现：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`LITELLM_API_KEY`、`LITELLM_BASE_URL`；图像可用 `OPENAI_IMAGE_API_KEY`、`OPENAI_IMAGE_BASE_URL`、`OPENAI_IMAGE_MODEL`。这些必须存在于启动 Obsidian 的进程环境中。扫描只显示是否存在密钥，不显示值，不读取其他插件私有配置。

## 开发与验证

```powershell
npm ci
npm run typecheck
npm test
npm run build
npx tsx scripts/smoke.ts
npm run package
```

PPT 集成测试使用本项目 `.venv`，必须先安装上述 Python 依赖。测试使用本地 OpenAI 兼容 HTTP fixture，不调用付费模型；验证鉴权、取消、错误、引用、图片下载、真实 PPT 导出与可编辑文本，以及 UI 流式显示/重试/修改预览。真实模型质量、外部服务兼容和 Obsidian 宿主交互仍需在安装后用实际配置验收。

本次验证：41 项测试、类型检查、构建和打包后执行器的启动/流式请求检查通过。`node scripts/preview.mjs` 可在 `http://127.0.0.1:4179` 查看真实 UI 组件的模拟数据预览；预览不调用模型，也不修改笔记。

`npm run vendor` 从 `vendor/repos` 同步选定上游内容并生成 `vendor/manifest.json`；重新克隆需要可达 GitHub，可通过 `HTTPS_PROXY` 配置代理。已随源代码保存所需 vendor 资源，因此正常构建不依赖重新克隆。固定提交见 manifest，许可证见 `THIRD_PARTY_NOTICES.md` 和 `vendor/licenses/`。

开发目录和分发包不包含 API Key、个人笔记或机器的 Python 环境。PPT/HTML/生图服务的模型使用成本由你的服务提供商决定。







0.1.2：流式响应没有答案正文时，最多补发一次非流式模型请求（可能产生额外一次请求费用），并显示真实的兼容重试步骤。推理字段不会作为最终答案展示；重试仍为空时显示结束原因和检查建议。正常流式回答不增加请求。


0.1.3：支持标准 Streamable HTTP Playwright MCP（填写完整 /mcp 地址），与 SearXNG 搜索组合使用；同时填写时优先于 Crawl4AI。每次搜索最多读取前三页，本执行器中同一 MCP 服务串行抓取，完成后至少等待 3.1 秒；同一搜索服务请求至少间隔 10 秒。浏览器服务异常时停止本轮抓取并明确降级为搜索摘要。只使用固定的标签页/导航/快照工具，模型无法调用任意浏览器操作。需在公司网络或可达该服务的网络下使用。


0.2.0：模型网关卡住时自动重试——30 秒内无任何响应（含推理流）或输出中断 30 秒即放弃该次请求，指数退避后重试，最多 3 次；配置“快速模型”后最后一次改用它，相关资讯与自动评论也使用快速模型。重试前已显示的半截内容会被清除。停止按钮立即结束界面状态，迟到的输出不会进入下一条回答。生成过程中可自由滚动，离开底部后不再强制跟随。表格、翻译、润色和普通回答都可以“替换选区/全文”（先预览差异）或“插入下方”。HTML/PPT/配图以文件卡片呈现：默认保存到原笔记同目录，可直接打开，或“另存为”下载。相关资讯先判断笔记类型（学习笔记找教程博客，产品找官网/规格书/白皮书），多组检索词搜索、解析百度/搜狗跳转链接、按主题词过滤无关结果，并可用本机 Chrome（Playwright MCP，独立临时配置）读取正文。图像接口地址只填域名时自动补全 /v1。

配图（0.2.0 更新）：分两步。先由模型把选区改写成结构化配图方案（宝玉 article-illustrator 技能的类型 × 风格，3–5 个画面元素和简短标签），再由程序按固定模板拼出生图提示词：附上所选风格的完整规范、留白构图、禁止出现色值文字、只允许指定标签等规则，然后调用图像接口（优先 1536×1024、high 质量，接口不支持时自动降级参数；网络/429/5xx 最多重试两次）。生图提示词可在步骤中展开查看。配置了快速模型时，第一步使用快速模型。
