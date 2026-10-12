# Pet Companion Implementation Plan

**Goal:** 将已安装版本升级为具有完整状态、互动及持久记忆的陪伴宠物。
**Architecture:** 独立模型、React 宠物组件和插件配置适配器；AI 工作流只提供状态。
**Tech Stack:** TypeScript、React、Vitest、Obsidian、本地 GIF sprite sheet。
**Spec:** ../specs/2026-10-12-pet-companion.md

## Global Constraints
保留原有 AI 功能和旧配置；素材离线加载并保留许可；工作优先；安静及减少动态效果可用。

## 1. 模型与素材
- [x] 新建 tests/pet.test.ts：旧配置默认值、非法配置、每个 Action 的映射、互动日记上限、无离线扣分。
- [x] 运行 `npx vitest run tests/pet.test.ts` 确认缺失模块失败。
- [x] 新建 src/ui/pet-model.ts，实现 normalizePet、interact、activityForAction。
- [x] 引入 oneko.gif 及许可，验证来源与素材实际内容。

## 2. 宠物 UI
- [x] 新建 src/ui/PetCompanion.tsx，消费 CompanionHost、running、action、reading、outcome、comment、quiet、onChat。
- [x] 加入 hover、拖动、喂食、抚摸、玩球、睡觉、摸鱼、专注与名字/形象/大小设置。
- [x] 接入 Companion.tsx；tests/pet-ui.test.tsx 验证持久化、动作优先级、安静模式和计时器清理。
- [x] styles.css 添加透明舞台、道具、动画、面板及 reduced-motion。

## 3. 配置与交付
- [x] settings.ts 添加 pet 字段；main.ts 提供 pet.load/save 与本地素材 URL。
- [x] 更新许可、README、版本 0.3.0。
- [x] 运行 `npm run typecheck`、`npm test`、`npm run build`、`npm run package`。
- [x] 浏览器预览，复核差异与打包内容，交付安装包和验证结果。
