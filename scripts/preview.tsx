import React from "react";
import { createRoot } from "react-dom/client";
import { Companion } from "../src/ui/Companion";
import type { CompanionHost } from "../src/ui/types";
const host: CompanionHost = {
  capture: () => ({
    path: "阅读笔记.md",
    content: "把阅读变成日常：先记下疑问，再寻找联系。",
    from: 0,
    to: 24,
  }),
  async run(_a, _i, _s, _h, emit, signal) {
    for (const [id, label, detail] of [
      ["read", "读取当前笔记", "阅读笔记.md · 当前选区"],
      ["model", "整理阅读建议", "界面测试数据 · 未连接模型"],
    ]) {
      emit({ type: "step", id, label, detail, status: "running" });
      await new Promise((r) => setTimeout(r, 400));
      signal.throwIfAborted();
      emit({ type: "step", id, label, detail, status: "done", elapsedMs: 400 });
    }
    const text =
      "这段笔记强调了两个动作：**提出疑问**与**建立联系**。\n\n可以补充一个具体例子，让下一次阅读更容易开始。\n\n> 以上是界面验收用的模拟回答。";
    for (const token of text.split("")) {
      signal.throwIfAborted();
      emit({ type: "token", text: token });
      await new Promise((r) => setTimeout(r, 6));
    }
    emit({ type: "result", text, editable: false });
    if (location.hash === "#image")
      emit({ type: "artifact", artifact: { id: "sample", name: "illustration.png", mime: "image/png", size: 1843200 } });
    emit({ type: "done" });
  },
  apply() {},
  undo() {},
  saveArtifact: async () => "",
  previewArtifact: async () => {},
  downloadArtifact: async () => {},
  openFile: async () => {},
  artifactUrl: async () => "/sample.png",
  openSettings() {},
  setQuiet() {},
  isQuiet: () => false,
  petUrl: () => "/assets/pet/yellow_idle_8fps.gif",
  disable() {},
};
createRoot(document.getElementById("root")!).render(
  <Companion host={host} initialOpen />,
);
