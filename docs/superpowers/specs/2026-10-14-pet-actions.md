# 两种宠物的动作扩展

用户在已有 0.3.0 方案上要求继续联网调研，为猫和小黄鸭增加动作，保留互动后自动收起小窝的体验。

## 调研依据

- https://github.com/adryd325/oneko.js/blob/main/oneko.js：tired、scratchWallN/E、NW/SE 等此前未启用的猫咪姿态坐标。保留已有 MIT 许可。
- https://github.com/tonybaloney/vscode-pets/blob/main/src/panel/pets/rubberduck.ts：闲坐、左右走/跑、追球、带球等行为转换。使用已打包的 Marc Duiker 原始素材及许可。

## 实现

猫新增洗脸、伸懒腰、抓抓板、扑蝴蝶、打哈欠；鸭新增拍翅、梳羽毛、摇摆散步、开心踏步、游一圈。猫使用不同原始帧，鸭使用原始 GIF 片段搭配翻转、位移及波纹等效果编排，不宣称这些衍生编排是上游原画的新动作。

pet-animation.ts 提供纯数据时间线和按时间取帧；PetSprite.tsx 独立驱动帧更新；PetCompanion 保留工作优先级、动作重播、种类切换清理、互动后收起面板和减少动态效果。随机空闲动作按宠物种类选择。

新增测试覆盖动作片段切换、方向、循环边界、种类按钮、收起面板、重播起始姿态。版本 0.3.1，不改依赖。
