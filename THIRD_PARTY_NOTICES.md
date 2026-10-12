# Third-party notices

This project assembles upstream libraries, prompts, workflows and assets. Preserve this file and `vendor/licenses/` when redistributing. Exact source commits are recorded in `vendor/manifest.json`.

| Component | Source | License / use |
|---|---|---|
| LangChain.js / LangGraph.js | https://github.com/langchain-ai/langchainjs ; https://github.com/langchain-ai/langgraphjs | MIT; npm bundles |
| assistant-ui | https://github.com/assistant-ui/assistant-ui | MIT; chat runtime and composer |
| Radix UI | https://github.com/radix-ui/primitives | MIT; collapsible steps (the same primitive family used by shadcn/ui) |
| React | https://github.com/facebook/react | MIT |
| Lucide | https://github.com/lucide-icons/lucide | ISC with inherited Feather MIT notices; bundled icons |
| unified / remark / rehype | https://github.com/unifiedjs/unified ; https://github.com/remarkjs | MIT |
| Zod | https://github.com/colinhacks/zod | MIT |
| jsdiff | https://github.com/kpdecker/jsdiff | BSD-3-Clause |
| Model Context Protocol TypeScript SDK | https://github.com/modelcontextprotocol/typescript-sdk | MIT; HTTP client for the separately operated Playwright MCP service |
| PptxGenJS | https://github.com/gitbrent/PptxGenJS | MIT; native editable PPTX generation |
| Anthropic Skills: theme-factory, frontend-design | https://github.com/anthropics/skills (commit dbd4588) | Apache-2.0 (`vendor/licenses/anthropic-skills.txt`); theme palettes and design guidance applied to every PPT/HTML output |
| PPT Master | https://github.com/hugohe3/ppt-master | MIT; skill reference retained; copyright Hugo He |
| Frontend Slides | https://github.com/zarazhangrui/frontend-slides | MIT; prompt + design references |
| Humanizer | https://github.com/blader/humanizer | MIT; prompt |
| Humanizer-zh | https://github.com/op7418/Humanizer-zh | MIT; prompt |
| Baoyu Skills | https://github.com/JimLiu/baoyu-skills | MIT unless otherwise stated; individual third-party notices in skill directories retained |
| Fabric | https://github.com/danielmiessler/Fabric | MIT; selected patterns |
| VS Code Pets | https://github.com/tonybaloney/vscode-pets | MIT; rubber duck graphics credited upstream to Marc Duiker; upstream LICENSE retained. Cat/dog purchased artwork not bundled |

SearXNG (AGPL-3.0) and Crawl4AI (Apache-2.0) are optional separately operated services; their server source is not copied into this plugin. Review their project notices when deploying. Only Apache-2.0 Anthropic skills are included; the source-available document skills (pptx, docx, xlsx, pdf) are not.

Additional npm license texts are collected in `vendor/licenses/npm/` by `scripts/licenses.mjs` before packaging. No Python runtime is required or bundled.

## oneko cat sprites

`assets/pet/oneko.gif` and frame coordinates are from https://github.com/adryd325/oneko.js (downloaded 2026-10-12). Copyright © 2022 adryd; MIT permission notice retained in `vendor/licenses/oneko.txt`. The sprite sheet is bundled locally, with no runtime upstream requests. No upstream script is executed. Original Neko lineage: https://en.wikipedia.org/wiki/Neko_(software).
