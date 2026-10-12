import {
  Plugin,
  MarkdownView,
  FileSystemAdapter,
  Notice,
  Modal,
  normalizePath,
  type Editor,
  TFolder,
} from "obsidian";
import { createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import path from "node:path";
import { Companion } from "./ui/Companion";
import type { ChatSession, CompanionHost, CompanionHandle } from "./ui/types";
import { WorkerClient } from "./plugin/worker-client";
import {
  DEFAULT_SETTINGS,
  CompanionSettingsTab,
  CompanionSettingsModal,
  type CompanionSettings,
} from "./plugin/settings";
import {
  makeEdit,
  validateSnapshot,
  canUndo,
  type Snapshot,
} from "./plugin/edits";
import {
  ACTION_LABELS,
  type Action,
  type Artifact,
  type ModelConfig,
  type RunEvent,
} from "./shared/protocol";

export default class CompanionPlugin extends Plugin {
  settings: CompanionSettings = { ...DEFAULT_SETTINGS };
  worker!: WorkerClient;
  private enabled = new Set<string>();
  private buttons = new Map<MarkdownView, HTMLElement>();
  private root?: Root;
  private container?: HTMLElement;
  private ui = createRef<CompanionHandle>();
  private mountedPath?: string;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private active = new Set<AbortController>();
  private lastComment = new Map<string, { time: number; content: string }>();
  private lastEdit?: { path: string; after: string };
  /** Chat per note for this Obsidian session; survives switching notes, not reloads. */
  private sessions = new Map<string, ChatSession>();
  /** Object URLs of generated images, kept with the chat sessions they belong to. */
  private imageUrls = new Map<string, Promise<string>>();
  private background?: AbortController;
  private stopped = false;

  async onload() {
    const saved = (await this.loadData()) ?? {};
    // 0.2.0: the old default export folder becomes "next to the source note"; Python is no longer used.
    if (saved.outputFolder === "MD Companion") saved.outputFolder = "";
    delete saved.python;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter))
      throw new Error("hotyaya需要桌面文件系统。");
    const directory = path.join(
      adapter.getBasePath(),
      this.manifest.dir ??
        `${this.app.vault.configDir}/plugins/${this.manifest.id}`,
    );
    this.worker = new WorkerClient(directory);
    this.addSettingTab(new CompanionSettingsTab(this.app, this));
    this.addCommand({
      id: "toggle",
      name: "开启或关闭当前笔记辅助器",
      editorCallback: () => this.toggle(),
    });
    this.addCommand({
      id: "chat",
      name: "打开hotyaya",
      editorCallback: () => {
        this.enableCurrent();
        this.ui.current?.open();
      },
    });
    this.addCommand({
      id: "undo",
      name: "撤销辅助器修改",
      editorCallback: () => {
        try {
          this.undo();
        } catch (error) {
          new Notice((error as Error).message);
        }
      },
    });
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.sync()),
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.sync()),
    );
    this.registerEvent(this.app.workspace.on("file-open", () => this.sync()));
    this.registerEvent(
      this.app.workspace.on("editor-change", () => this.scheduleComment()),
    );
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, info) => {
        if (
          !info.file ||
          info.file.extension !== "md" ||
          !editor.getSelection()
        )
          return;
        const snapshot = this.snapshot(editor, info.file.path);
        for (const action of ["translate", "image", "table"] as const)
          menu.addItem((item) =>
            item
              .setTitle(`hotyaya：${ACTION_LABELS[action]}`)
              .setIcon(
                action === "translate"
                  ? "languages"
                  : action === "image"
                    ? "image"
                    : "table",
              )
              .onClick(() => {
                if (info instanceof MarkdownView)
                  this.app.workspace.setActiveLeaf(info.leaf, { focus: true });
                this.enableCurrent();
                this.ui.current?.open(action, snapshot);
              }),
          );
      }),
    );
    this.app.workspace.onLayoutReady(() => {
      if (!this.stopped) this.sync();
    });
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  openSettings() {
    new CompanionSettingsModal(this.app, this).open();
  }
  private view() {
    return this.app.workspace.getActiveViewOfType(MarkdownView);
  }
  private snapshot(editor: Editor, file: string): Snapshot {
    const content = editor.getValue();
    const hasSelection = !!editor.getSelection();
    return {
      path: file,
      content,
      from: hasSelection ? editor.posToOffset(editor.getCursor("from")) : 0,
      to: hasSelection
        ? editor.posToOffset(editor.getCursor("to"))
        : content.length,
    };
  }
  capture(): Snapshot {
    const view = this.view();
    if (!view?.file || view.file.extension !== "md")
      throw new Error("请先打开一篇 Markdown 笔记。");
    return this.snapshot(view.editor, view.file.path);
  }
  private enableCurrent() {
    const view = this.view();
    if (!view?.file) return;
    this.enabled.add(view.file.path);
    this.sync();
  }
  private toggle() {
    const view = this.view();
    if (!view?.file) return;
    const file = view.file.path;
    if (this.enabled.has(file)) this.enabled.delete(file);
    else this.enabled.add(file);
    this.sync();
  }
  private sync() {
    if (this.stopped) return;
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const views = new Set(
      leaves
        .map((l) => l.view)
        .filter((v): v is MarkdownView => v instanceof MarkdownView),
    );
    for (const [view, button] of this.buttons)
      if (!views.has(view)) {
        button.remove();
        this.buttons.delete(view);
      }
    for (const view of views) {
      if (!this.buttons.has(view)) {
        const button = view.addAction("sparkles", "开启 .md 辅助器", () => {
          if (!view.file) return;
          this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
          const file = view.file.path;
          if (this.enabled.has(file)) this.enabled.delete(file);
          else this.enabled.add(file);
          this.sync();
        });
        this.buttons.set(view, button);
      }
      const on = !!view.file && this.enabled.has(view.file.path);
      this.buttons
        .get(view)!
        .setAttribute("aria-label", on ? "关闭 .md 辅助器" : "开启 .md 辅助器");
      this.buttons.get(view)!.classList.toggle("is-active", on);
    }
    const view = this.view();
    const current = view?.file?.path;
    if (!current || !this.enabled.has(current)) {
      this.unmount();
      return;
    }
    if (
      this.mountedPath === current &&
      this.container?.ownerDocument === view!.containerEl.ownerDocument
    )
      return;
    this.unmount();
    this.mountedPath = current;
    this.container = view!.containerEl.ownerDocument.createElement("div");
    this.container.className = "mdc-root";
    view!.containerEl.ownerDocument.body.appendChild(this.container);
    const host: CompanionHost = {
      capture: () => this.capture(),
      run: (...args) => this.run(...args),
      apply: (snapshot, text) => this.apply(snapshot, text),
      undo: () => this.undo(),
      saveArtifact: (artifact, snapshot) =>
        this.saveArtifact(artifact, snapshot),
      downloadArtifact: (artifact) => this.downloadArtifact(artifact),
      openFile: (file) => this.openFile(file),
      previewArtifact: (artifact) => this.previewArtifact(artifact),
      artifactUrl: (artifact) => this.artifactUrl(artifact),
      insertArtifact: (artifact, snapshot) =>
        this.insertArtifact(artifact, snapshot),
      openSettings: () => this.openSettings(),
      setQuiet: (quiet) => {
        this.settings.autoComments = !quiet;
        void this.saveSettings();
      },
      isQuiet: () => !this.settings.autoComments,
      petUrl: (state) =>
        this.app.vault.adapter.getResourcePath(
          normalizePath(
            `${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`}/assets/pet/${view!.containerEl.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches ? "icon.png" : state === "busy" ? "yellow_run_8fps.gif" : state === "reading" ? "yellow_walk_8fps.gif" : state === "success" ? "yellow_with_ball_8fps.gif" : state === "error" ? "yellow_swipe_8fps.gif" : "yellow_idle_8fps.gif"}`,
          ),
        ),
      disable: () => {
        this.enabled.delete(current);
        this.sync();
      },
      session: {
        load: () => this.sessions.get(current),
        save: (state) => this.sessions.set(current, state),
      },
    };
    this.root = createRoot(this.container);
    flushSync(() =>
      this.root!.render(createElement(Companion, { host, ref: this.ui })),
    );
    this.scheduleComment();
  }
  private unmount() {
    clearTimeout(this.idleTimer);
    this.cancelAll();
    this.root?.unmount();
    this.root = undefined;
    this.container?.remove();
    this.container = undefined;
    this.mountedPath = undefined;
  }
  cancelAll() {
    for (const controller of this.active) controller.abort();
    this.active.clear();
  }
  private config(): ModelConfig {
    return {
      baseUrl: this.settings.baseUrl,
      model: this.settings.model,
      apiKey: this.settings.keyRef
        ? (this.app.secretStorage.getSecret(this.settings.keyRef) ?? undefined)
        : undefined,
      imageBaseUrl: this.settings.imageBaseUrl || undefined,
      imageModel: this.settings.imageModel || undefined,
      imageApiKey: this.settings.imageKeyRef
        ? (this.app.secretStorage.getSecret(this.settings.imageKeyRef) ??
          undefined)
        : undefined,
      fastModel: this.settings.fastModel || undefined,
    };
  }
  private async run(
    action: Action,
    instruction: string,
    snapshot: Snapshot,
    history: { role: "user" | "assistant"; content: string }[],
    emit: (event: RunEvent) => void,
    signal: AbortSignal,
  ) {
    if (action !== "comment") this.background?.abort();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) controller.abort();
    this.active.add(controller);
    try {
      await this.worker.run(
        {
          action,
          instruction,
          document: {
            path: snapshot.path,
            content: snapshot.content,
            selection:
              snapshot.from === 0 && snapshot.to === snapshot.content.length
                ? undefined
                : snapshot.content.slice(snapshot.from, snapshot.to),
          },
          config: this.config(),
          history,
          searchUrl: this.settings.searchUrl || undefined,
          crawlUrl: this.settings.crawlUrl || undefined,
          browserMcpUrl: this.settings.browserMcpUrl || undefined,
          localChrome: this.settings.localChrome || undefined,
        },
        emit,
        controller.signal,
      );
    } finally {
      signal.removeEventListener("abort", abort);
      this.active.delete(controller);
    }
  }
  private apply(snapshot: Snapshot, text: string) {
    const view = this.view();
    if (!view?.file) throw new Error("请回到原笔记后应用。");
    const edit = makeEdit(
      snapshot,
      view.file.path,
      view.editor.getValue(),
      text,
    );
    view.editor.transaction(
      {
        changes: [
          {
            from: view.editor.offsetToPos(edit.from),
            to: view.editor.offsetToPos(edit.to),
            text: edit.text,
          },
        ],
      },
      "md-companion",
    );
    this.lastEdit = { path: view.file.path, after: view.editor.getValue() };
  }
  private undo() {
    const view = this.view();
    if (
      !view?.file ||
      !canUndo(this.lastEdit, view.file.path, view.editor.getValue())
    )
      throw new Error(
        "没有可安全撤销的辅助器修改；继续编辑后请使用 Obsidian 的撤销。",
      );
    view.editor.undo();
    this.lastEdit = undefined;
  }
  private scheduleComment() {
    clearTimeout(this.idleTimer);
    if (!this.settings.autoComments || !this.mountedPath) return;
    this.idleTimer = setTimeout(() => void this.comment(), 12_000);
  }
  private async comment() {
    if (this.stopped || !this.settings.autoComments || this.active.size) return;
    let snapshot: Snapshot;
    try {
      snapshot = this.capture();
    } catch {
      return;
    }
    if (
      !this.enabled.has(snapshot.path) ||
      snapshot.path !== this.mountedPath ||
      snapshot.content.trim().length < 30
    )
      return;
    const previous = this.lastComment.get(snapshot.path);
    if (
      previous &&
      (Date.now() - previous.time < 60_000 ||
        previous.content === snapshot.content)
    )
      return;
    this.lastComment.set(snapshot.path, {
      time: Date.now(),
      content: snapshot.content,
    });
    snapshot = { ...snapshot, from: 0, to: snapshot.content.length };
    this.ui.current?.busy(true);
    const background = new AbortController();
    this.background = background;
    try {
      await this.run(
        "comment",
        "给一句具体、友好、简短的阅读建议。",
        snapshot,
        [],
        (event) => {
          if (this.mountedPath !== snapshot.path) return;
          if (event.type === "result") this.ui.current?.comment(event.text);
          if (event.type === "error")
            this.ui.current?.comment(
              "还没能读懂这篇笔记，点开设置检查模型连接。",
              "error",
            );
        },
        background.signal,
      );
    } catch {
      if (!background.signal.aborted)
        this.ui.current?.comment(
          "点开设置，连接模型后我就能陪你阅读。",
          "error",
        );
    } finally {
      if (this.background === background) {
        this.background = undefined;
        this.ui.current?.busy(false);
      }
    }
  }
  async testConnection() {
    let response = false,
      failed = "";
    const controller = new AbortController();
    this.active.add(controller);
    try {
      await this.worker.run(
        {
          action: "chat",
          instruction: "Reply with OK.",
          document: { path: "connection-test", content: "" },
          config: this.config(),
        },
        (event) => {
          if (event.type === "result") response = true;
          if (event.type === "error") failed = event.message;
        },
        controller.signal,
      );
      if (failed) throw new Error(failed);
      if (!response) throw new Error("模型没有返回有效结果。");
    } finally {
      this.active.delete(controller);
    }
  }
  /** Saves next to the source note (or the configured vault folder) under a unique name. */
  private async saveArtifact(artifact: Artifact, snapshot?: Snapshot) {
    const configured = this.settings.outputFolder.trim();
    const source = snapshot?.path ?? this.view()?.file?.path ?? "";
    const folder = configured
      ? normalizePath(configured)
      : source.includes("/")
        ? source.slice(0, source.lastIndexOf("/"))
        : "";
    if (
      folder.startsWith("/") ||
      folder.split("/").some((p) => p === "..") ||
      /^[a-z]:/i.test(folder)
    )
      throw new Error("导出目录必须位于当前库中。");
    let accumulated = "";
    for (const part of folder ? folder.split("/") : []) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(accumulated);
      if (!existing) await this.app.vault.createFolder(accumulated);
      else if (!(existing instanceof TFolder))
        throw new Error("导出目录被同名文件占用。");
    }
    const base = source
      .split("/")
      .pop()!
      .replace(/\.md$/i, "")
      .replace(/[\\/:*?"<>|#^[\]]/g, "_")
      .trim();
    const ext = artifact.name.includes(".")
      ? artifact.name.slice(artifact.name.lastIndexOf("."))
      : "";
    const stem = base || artifact.name.replace(/\.[^.]+$/, "");
    const join = (name: string) => normalizePath(folder ? `${folder}/${name}` : name);
    let filename = join(`${stem}${ext}`);
    for (let n = 2; this.app.vault.getAbstractFileByPath(filename); n++)
      filename = join(`${stem} (${n})${ext}`);
    const data = await this.worker.artifact(artifact);
    await this.app.vault.createBinary(filename, Uint8Array.from(data).buffer);
    return filename;
  }
  /** Native "Save as" dialog, like a browser download. */
  private async downloadArtifact(artifact: Artifact) {
    const data = await this.worker.artifact(artifact);
    const view = this.view();
    const doc = view?.containerEl.ownerDocument ?? document;
    const stem =
      view?.file?.basename.replace(/[\\/:*?"<>|]/g, "_") ||
      artifact.name.replace(/\.[^.]+$/, "");
    const ext = artifact.name.slice(artifact.name.lastIndexOf("."));
    const url = URL.createObjectURL(
      new Blob([Uint8Array.from(data)], { type: artifact.mime }),
    );
    try {
      const link = doc.createElement("a");
      link.href = url;
      link.download = `${stem}${ext}`;
      doc.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }
  private async openFile(file: string) {
    const target = this.app.vault.getAbstractFileByPath(file);
    if (!target) throw new Error("文件已不存在。");
    // Non-Markdown files open in the system's default app (PowerPoint, browser...).
    if (/\.md$/i.test(file)) await this.app.workspace.openLinkText(file, "", true);
    else
      await (
        this.app as unknown as { openWithDefaultApp(path: string): Promise<void> }
      ).openWithDefaultApp(file);
  }
  private artifactUrl(artifact: Artifact) {
    let url = this.imageUrls.get(artifact.id);
    if (!url) {
      url = this.worker.artifact(artifact).then((data) =>
        URL.createObjectURL(new Blob([Uint8Array.from(data)], { type: artifact.mime })),
      );
      // A failed fetch (e.g. worker restarted) may be retried later.
      url.catch(() => this.imageUrls.delete(artifact.id));
      this.imageUrls.set(artifact.id, url);
    }
    return url;
  }
  private async previewArtifact(artifact: Artifact) {
    if (artifact.mime.startsWith("image/")) {
      const src = await this.artifactUrl(artifact);
      const modal = new Modal(this.app);
      modal.titleEl.setText(artifact.name);
      modal.modalEl.addClass("mdc-image-modal");
      const img = modal.contentEl.createEl("img", { cls: "mdc-image-full" });
      img.src = src;
      img.alt = artifact.name;
      modal.open();
      return;
    }
    const data = await this.worker.artifact(artifact);
    const modal = new Modal(this.app);
    modal.titleEl.setText(artifact.name);
    modal.modalEl.addClass("mdc-preview-modal");
    const frame = modal.contentEl.createEl("iframe", {
      cls: "mdc-preview-frame",
    });
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'">${data.toString("utf8")}`;
    modal.open();
  }
  private async insertArtifact(artifact: Artifact, snapshot: Snapshot) {
    let view = this.view();
    if (!view?.file) throw new Error("请回到原笔记。");
    validateSnapshot(snapshot, view.file.path, view.editor.getValue());
    const file = await this.saveArtifact(artifact, snapshot);
    view = this.view();
    if (!view?.file)
      throw new Error(`图片已保存至 ${file}；请回到原笔记后插入。`);
    validateSnapshot(snapshot, view.file.path, view.editor.getValue());
    this.apply(
      { ...snapshot, from: snapshot.to, to: snapshot.to },
      `\n\n![[${file}]]\n`,
    );
  }
  onunload() {
    this.stopped = true;
    this.unmount();
    this.worker?.stop();
    for (const url of this.imageUrls.values())
      void url.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    this.imageUrls.clear();
    for (const button of this.buttons.values()) button.remove();
    this.buttons.clear();
  }
}
