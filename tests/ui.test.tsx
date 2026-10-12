// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { Companion } from "../src/ui/Companion";
import type { CompanionHost } from "../src/ui/types";
afterEach(cleanup);
it("drags the chat by its header, bounds it and leaves header controls clickable", () => {
  const original=window.PointerEvent;
  window.PointerEvent=MouseEvent as typeof PointerEvent;
  try {
    const host=makeHost();
    render(<Companion host={host} initialOpen />);
    const panel=screen.getByRole("dialog",{name:"hotyaya"});
    const header=screen.getByTitle("拖动标题栏移动聊天框");
    vi.spyOn(panel,"getBoundingClientRect").mockReturnValue({left:100,top:100,width:520,height:400,right:620,bottom:500,x:100,y:100,toJSON(){}});
    fireEvent.pointerDown(header,{button:0,clientX:120,clientY:120});
    fireEvent.pointerMove(header,{clientX:170,clientY:180});
    fireEvent.pointerUp(header);
    expect(panel.style.left).toBe("150px");
    expect(panel.style.top).toBe("160px");
    const settings=screen.getByRole("button",{name:"设置"});
    fireEvent.pointerDown(settings,{button:0,clientX:120,clientY:120});
    fireEvent.pointerMove(header,{clientX:500,clientY:500});
    fireEvent.click(settings);
    expect(host.openSettings).toHaveBeenCalledOnce();
    expect(panel.style.left).toBe("150px");
    fireEvent.pointerDown(header,{button:0,clientX:120,clientY:120});
    fireEvent.pointerMove(header,{clientX:-1000,clientY:-1000});
    fireEvent.pointerUp(header);
    expect(panel.style.left).toBe("8px");
    expect(panel.style.top).toBe("8px");
  } finally {window.PointerEvent=original;}
});
it("drags hotyaya within the viewport without opening chat and still supports clicking", () => {
  const original = window.PointerEvent;
  window.PointerEvent = MouseEvent as typeof PointerEvent;
  try {
    render(<Companion host={makeHost()} />);
    const pet = screen.getByRole("button", { name: "打开hotyaya" });
    vi.spyOn(pet, "getBoundingClientRect").mockReturnValue({
      left: 200,
      top: 200,
      width: 66,
      height: 66,
      right: 266,
      bottom: 266,
      x: 200,
      y: 200,
      toJSON() {},
    });
    fireEvent.pointerDown(pet, { button: 0, clientX: 210, clientY: 210 });
    fireEvent.pointerMove(pet, { clientX: 100, clientY: 120 });
    fireEvent.pointerUp(pet, { clientX: 100, clientY: 120 });
    fireEvent.click(pet, { detail: 1 });
    expect(pet.style.left).toBe("90px");
    expect(pet.style.top).toBe("110px");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.pointerDown(pet, { button: 0, clientX: 100, clientY: 120 });
    fireEvent.pointerMove(pet, { clientX: -1000, clientY: -1000 });
    fireEvent.pointerUp(pet);
    expect(pet.style.left).toBe("8px");
    expect(pet.style.top).toBe("8px");
    fireEvent.click(pet, { detail: 0 });
    expect(screen.getByRole("dialog", { name: "hotyaya" })).toBeTruthy();
  } finally {
    window.PointerEvent = original;
  }
});
it("never auto-loads a remote Markdown image returned by a model", async () => {
  const host = makeHost();
  host.run = async (_a, _i, _s, _h, emit) => {
    emit({
      type: "result",
      text: "![tracking](https://example.org/pixel?private=note)",
      editable: false,
    });
    emit({ type: "done" });
  };
  const { container } = render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  await waitFor(() =>
    expect(
      container.querySelector(
        'a[href="https://example.org/pixel?private=note"]',
      ),
    ).not.toBeNull(),
  );
  expect(container.querySelector('img[src^="https://example.org"]')).toBeNull();
});
it("a failed task leaves an error pet message rather than a success message", async () => {
  const host = makeHost();
  host.run = async (_a, _i, _s, _h, emit) => {
    emit({ type: "error", message: "缺少模型" });
    emit({ type: "done" });
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  await screen.findByText("缺少模型");
  fireEvent.click(screen.getByRole("button", { name: "收起聊天" }));
  expect(screen.getByRole("status").textContent).toMatch(/没能完成/);
});
it("large previous output cannot poison the next request history", async () => {
  const host = makeHost();
  const histories: { role: "user" | "assistant"; content: string }[][] = [];
  host.run = async (_a, _i, _s, history, emit) => {
    histories.push(history);
    emit({ type: "result", text: "x".repeat(51000), editable: false });
    emit({ type: "done" });
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "停止生成" })).toBeNull(),
  );
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "生成表格" }));
  await waitFor(() => expect(histories).toHaveLength(2));
  expect(histories[1].every((m) => m.content.length <= 50000)).toBe(true);
});
function makeHost(): CompanionHost {
  return {
    capture: () => ({ path: "test.md", content: "原文", from: 0, to: 2 }),
    run: async (_a, _i, _s, _h, emit) => {
      emit({
        type: "step",
        id: "read",
        label: "读取笔记",
        status: "done",
        elapsedMs: 8,
      });
      emit({ type: "token", text: "新内容" });
      emit({ type: "result", text: "新内容", editable: true });
      emit({ type: "done" });
    },
    apply: vi.fn(),
    undo: vi.fn(),
    saveArtifact: async () => "a.png",
    downloadArtifact: vi.fn(async () => {}),
    openFile: vi.fn(async () => {}),
    previewArtifact: async () => {},
    openSettings: vi.fn(),
    setQuiet: vi.fn(),
    isQuiet: () => false,
    petUrl: () => "/duck.gif",
    disable: vi.fn(),
  };
}
it("streams output and requires reviewing changes before applying", async () => {
  const host = makeHost();
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "自然润色" }));
  await screen.findByText("新内容");
  expect(host.apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /替换/ }));
  expect(screen.getByText("原文")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "应用修改" }));
  expect(host.apply).toHaveBeenCalledWith(
    { path: "test.md", content: "原文", from: 0, to: 2 },
    "新内容",
  );
});
it("shows failed runs and makes retry available", async () => {
  const host = makeHost();
  host.run = async () => {
    throw new Error("模型连接失败");
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  await screen.findByText("模型连接失败");
  expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
});
it("cancel aborts the host request and leaves partial output visible", async () => {
  const host = makeHost();
  let aborted = false;
  host.run = async (_a, _i, _s, _h, emit, signal) =>
    new Promise((_resolve, reject) => {
      emit({ type: "token", text: "部分回答" });
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      });
    });
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  await screen.findByText("部分回答");
  fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
  await waitFor(() => expect(aborted).toBe(true));
  expect(screen.getByText("部分回答")).toBeTruthy();
});
it("stop ends the run in the UI at once even if the host never settles", async () => {
  const host = makeHost();
  host.run = async (_a, _i, _s, _h, emit) => {
    emit({ type: "step", id: "generate", label: "模型生成", status: "running" });
    emit({ type: "token", text: "部分" });
    return new Promise(() => {});
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  await screen.findByText("部分");
  fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "停止生成" })).toBeNull(),
  );
  expect(screen.getByText(/已停止，保留了已生成的部分/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
});
it("late events from a stopped run never reach the next answer", async () => {
  const host = makeHost();
  const emits: ((e: any) => void)[] = [];
  host.run = async (_a, _i, _s, _h, emit) => {
    emits.push(emit);
    if (emits.length === 1) return new Promise(() => {});
    emit({ type: "result", text: "第二个回答", editable: false });
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "导出 HTML" }));
  await waitFor(() => expect(emits).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "相关资讯" }));
  await screen.findByText("第二个回答");
  emits[0]({ type: "token", text: "<!DOCTYPE html>迟到的HTML" });
  emits[0]({ type: "result", text: "<!DOCTYPE html>迟到的HTML", editable: false });
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText(/迟到的HTML/)).toBeNull();
  expect(screen.getByText("第二个回答")).toBeTruthy();
});
it("a retry reset discards the abandoned attempt's partial text", async () => {
  const host = makeHost();
  host.run = async (_a, _i, _s, _h, emit) => {
    emit({ type: "token", text: "半截" });
    emit({ type: "reset" });
    emit({ type: "token", text: "完整回答" });
    emit({ type: "result", text: "完整回答", editable: false });
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  await screen.findByText("完整回答");
  expect(screen.queryByText(/半截/)).toBeNull();
});
it("chat answers such as a generated table can replace the selection after review", async () => {
  const host = makeHost();
  host.run = async (_a, _i, _s, _h, emit) => {
    emit({
      type: "result",
      text: "整理如下：\n\n```markdown\n| A | B |\n| - | - |\n| 1 | 2 |\n```",
      editable: false,
    });
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  fireEvent.click(await screen.findByRole("button", { name: /替换/ }));
  fireEvent.click(screen.getByRole("button", { name: "应用修改" }));
  expect(host.apply).toHaveBeenCalledWith(
    { path: "test.md", content: "原文", from: 0, to: 2 },
    "| A | B |\n| - | - |\n| 1 | 2 |",
  );
});
it("files can be saved beside the note, then opened, or downloaded", async () => {
  const host = makeHost();
  host.saveArtifact = vi.fn(async () => "notes/第 8 周.pptx");
  host.run = async (_a, _i, _s, _h, emit) => {
    emit({
      type: "artifact",
      artifact: { id: "a1", name: "presentation.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", size: 40960 },
    });
    emit({ type: "result", text: "可编辑 PPTX 已生成", editable: false });
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "导出 PPT" }));
  expect(await screen.findByText("PPTX · 40 KB")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "下载 presentation.pptx" }));
  expect(host.downloadArtifact).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "保存 presentation.pptx" }));
  fireEvent.click(await screen.findByRole("button", { name: "打开 presentation.pptx" }));
  expect(host.openFile).toHaveBeenCalledWith("notes/第 8 周.pptx");
});
it("the pet bubble reflects the current work, not the previous result", async () => {
  const host = makeHost();
  let finish!: () => void;
  host.run = async (_a, _i, _s, _h, emit) => {
    await new Promise<void>((r) => (finish = r));
    emit({ type: "result", text: "完成", editable: false });
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "导出 PPT" }));
  fireEvent.click(screen.getByRole("button", { name: "收起聊天" }));
  expect(screen.getByRole("status").textContent).toContain("把你的想法装进幻灯片");
  finish();
  await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/整理好了/));
});
it("a reading comment resets the mood left by an earlier failure", async () => {
  const ref = React.createRef<any>();
  const host = makeHost();
  host.petUrl = (state) => `/${state}.gif`;
  host.run = async (_a, _i, _s, _h, emit) => emit({ type: "error", message: "失败" });
  render(<Companion host={host} ref={ref} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  await screen.findByText("失败");
  await waitFor(() => expect(screen.getByRole("img", {name: /^hotyaya：/}).getAttribute("src")).toBe("/error.gif"));
  React.act(() => ref.current.comment("这段论证很清楚。"));
  expect(screen.getByRole("img", {name: /^hotyaya：/}).getAttribute("src")).toBe("/idle.gif");
});
it("switching to another note and back restores the conversation", async () => {
  const store = new Map<string, any>();
  const hostFor = (path: string) => ({
    ...makeHost(),
    session: { load: () => store.get(path), save: (s: any) => store.set(path, s) },
  });
  const first = render(<Companion host={hostFor("a.md")} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  await screen.findByText("新内容");
  first.unmount();
  const other = render(<Companion host={hostFor("b.md")} />);
  expect(screen.queryByText("新内容")).toBeNull();
  other.unmount();
  render(<Companion host={hostFor("a.md")} />);
  expect(screen.getByRole("dialog", { name: "hotyaya" })).toBeTruthy();
  expect(screen.getByText("新内容")).toBeTruthy();
});
it("a run cut off by leaving the note comes back as stopped, not spinning", async () => {
  const store = new Map<string, any>();
  const host = { ...makeHost(), session: { load: () => store.get("a.md"), save: (s: any) => store.set("a.md", s) } };
  host.run = async (_a, _i, _s, _h, emit) => {
    emit({ type: "step", id: "generate", label: "模型生成", status: "running" });
    return new Promise(() => {});
  };
  const view = render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "一键解读" }));
  await screen.findByText("进行中");
  view.unmount();
  render(<Companion host={{ ...makeHost(), session: host.session }} />);
  expect(screen.getByText("已停止")).toBeTruthy();
  expect(screen.queryByText("进行中")).toBeNull();
  expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
});
it("a generated image shows an inline preview that opens full size", async () => {
  const host = makeHost();
  host.artifactUrl = vi.fn(async () => "blob:fixture-image");
  host.previewArtifact = vi.fn(async () => {});
  host.run = async (_a, _i, _s, _h, emit) => {
    emit({ type: "artifact", artifact: { id: "img1", name: "illustration.png", mime: "image/png", size: 2048 } });
    emit({ type: "result", text: "配图已生成", editable: false });
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "企业配图" }));
  const img = await screen.findByAltText("illustration.png");
  expect(img.getAttribute("src")).toBe("blob:fixture-image");
  fireEvent.click(screen.getByRole("button", { name: "放大查看 illustration.png" }));
  expect(host.previewArtifact).toHaveBeenCalledWith(expect.objectContaining({ id: "img1" }));
});
it("an expired image preview says so instead of spinning forever", async () => {
  const host = makeHost();
  host.artifactUrl = vi.fn(async () => {
    throw new Error("执行器请求失败 (404)");
  });
  host.run = async (_a, _i, _s, _h, emit) => {
    emit({ type: "artifact", artifact: { id: "img2", name: "illustration.png", mime: "image/png" } });
  };
  render(<Companion host={host} initialOpen />);
  fireEvent.click(screen.getByRole("button", { name: "选择功能" }));
  fireEvent.click(screen.getByRole("button", { name: "企业配图" }));
  expect(await screen.findByText(/预览已失效/)).toBeTruthy();
});
