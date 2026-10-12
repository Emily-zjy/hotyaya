# Execution ledger — 2026-10-09-md-companion

Ruling: new repository in md-companion is already isolated from existing langchain checkout; a linked worktree is unnecessary. Development branch codex/md-companion.
Ruling: user approved proposed design and requested work to begin; no second design approval needed. Scope remains all approved features.
Ruling: use one implementer subagent for worker while parent owns plugin/UI/vendor/build; no overlapping writes.

| Boundary | Producer | Consumer | Review |
|---|---|---|---|
| RunRequest/RunEvent | shared/protocol.ts | worker and plugin/UI | One shared definition |
| vendor skill paths | vendor/manifest.json | worker | Parent will publish stable paths before skill integration |
| lifecycle | plugin manager | worker ready stdout | Auth token only in environment; no keys in health |
| editor snapshot | plugin host | apply/diff UI | Reject stale document or selection |

Status: implementation and local validation complete. Installation into a real Obsidian vault and live provider acceptance remain unperformed.

Delivered: public Obsidian integration, SecretStorage settings and environment discovery, animated duck/chat, LangGraph worker with SSE operations, translation/polish/table previews and stale-edit rejection, cancellation/retry, research citations, image artifacts, HTML preview and native editable PPTX export. Upstream commits and license notices are vendored.

Validation on 2026-10-09: 29 tests passed across five files; TypeScript check passed; production build passed; packaged worker startup, health, vendored skill loading, local model fixture streaming and shutdown passed. The PPT integration test ran the upstream exporter and verified native DrawingML text. Browser inspection of the production React component with explicitly simulated data confirmed streaming controls, finished state and expandable step details; screenshot in ui-preview.png.

Independent review findings fixed with regression tests: automatic remote Markdown image requests, inaccurate success pet message after error, oversized conversation history, LiteLLM trailing-slash credential selection. Static re-review found no remaining blocking issues in those fixes.

Limitations: no real Obsidian/Electron runtime test or paid model request; external SearXNG/Crawl4AI and image provider need user configuration; Python dependencies are not shipped. PPT currently uses a fixed white business text layout, not every upstream template feature. No third-party private plugin credential scanning.

User visual revision: compact 42px single-line header, removed subtitle/context rows, actions moved into composer + menu, default width reduced to 520px. Six UI regression tests and typecheck passed; browser menu/open/run/collapse verified with fixture data.

User follow-ups: renamed visible UI and manifest to hotyaya; removed brand icon; independent pet and header chat dragging with viewport bounds and control exclusion. Added file-open synchronization and active-leaf selection for note-specific entry. User elected to perform Obsidian host verification later; no vault installation or host setting changes were made.

Final verification: 31 tests passed across five files; typecheck/build passed. Browser confirmed both pet dragging and header dragging. ZIP integrity, unique normalized entries, hotyaya manifest and latest bundled-file equality passed. The archive is dist/md-companion-0.1.0.zip. Obsidian host validation intentionally left to user per their instruction.

0.1.1 installed-runtime repair: reproduced Obsidian.exe treating worker.cjs as an opened file and exiting; same worker starts with system Node. Replaced Electron-as-Node launch with PATH/standard-install Node discovery. 34 tests, typecheck/build, simulated Obsidian-host launch and installed-directory fixture streaming passed. Updated only program files at user's specified plugin directory; data.json hash unchanged; previous program files backed up in test-results. Optional endpoint settings now folded with acquisition guidance. User must disable/re-enable plugin to load repaired main.js; live provider request not performed.

0.1.2 compatibility repair: real screenshot established empty assistant content after successful worker startup; underlying private gateway response remains unverified. Added bounded one-time non-stream response fallback on empty streamed body, text-only answer extraction excluding reasoning, finish-reason diagnostics, refusal bypass protection and explicit fallback events. Three local HTTP regression cases and all 37 tests pass; typecheck/build/archive validation pass. Updated installed program files with data.json hash preserved. Live gateway confirmation awaits user reload/retry.

0.1.3: added official MCP TypeScript SDK client, Playwright isolated-tab reader, serialized 3.1-second browser interval and 10-second search interval per worker/service. Added explicit snippet-only fallback with source status when browser service fails. All 41 tests, typecheck, build, installed worker fixture and ZIP checks pass. User-provided an internal SearXNG returned HTTP 200 with 18 results for one generic query. an internal MCP initialization and tool discovery succeeded, but one real page attempt failed because chrome-for-testing was absent on the service host. No server software changes or group messages were made. Installed plugin and configured only searchUrl/browserMcpUrl, preserving other settings. Full browser fetching requires the service maintainer to install its browser.

0.2.0 (2026-10-10): Measured the real gateway: healthy the internal reasoning model streams send a first delta within ~1.5 s but reason 15–70 s before answer text; no retry existed for silent stalls. Added stall watchdog (30 s first-delta/idle), bounded exponential retries with fast-model final attempt and client reset event. Replaced Python PPT export (python on PATH lacked python-pptx, the screenshot failure was a prose answer parsed as JSON) with pptxgenjs, JSON mode and tolerant extraction; rendered slides checked in PowerPoint. Fixed stop (UI ends immediately, run-scoped events), cross-run output leakage, scroll follow, apply/insert for all text answers, artifact cards saving beside the source note with open/download, image /v1 normalization. Research: typed query planning, multi-query search, redirect resolution, topic ranking, local Chrome via pinned @playwright/mcp stdio. Real runs: PPT 12 slides OK; research 177 s -> 51 s with relevant results. 53 tests, typecheck, build, package pass. Installed 0.2.0 into a test vault; previous program files and data.json backed up under test-results; set fastModel=a fast model, localChrome=true, outputFolder="" (same folder as note). Not verified: live Obsidian host interaction, scroll feel, real image generation (key lives in SecretStorage).
