import React, {
  forwardRef,
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
} from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  BookOpen,
  Sparkles,
  Languages,
  Table2,
  Globe,
  Image,
  Presentation,
  Code2,
  FileText,
  X,
  Settings2,
  ArrowUp,
  Square,
  Check,
  LoaderCircle,
  ChevronRight,
  Copy,
  RotateCcw,
  VolumeX,
  Volume2,
  Download,
  Eye,
  Power,
  Plus,
  Replace,
  FolderDown,
  ExternalLink,
  ArrowDown,
} from "lucide-react";
import { diffLines } from "diff";
import {
  ACTION_LABELS,
  type Action,
  type Artifact,
  type RunEvent,
} from "../shared/protocol";
import type { Snapshot } from "../plugin/edits";
import type { ChatSession, CompanionHandle, CompanionHost } from "./types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: Extract<RunEvent, { type: "step" }>[];
  artifacts?: Artifact[];
  snapshot?: Snapshot;
  editable?: boolean;
  error?: string;
  request?: { action: Action; instruction: string };
  stopped?: boolean;
  /** Vault paths of artifacts already saved, keyed by artifact id. */
  saved?: Record<string, string>;
}
/** A run interrupted by leaving the note cannot resume; show it as stopped. */
function restore(session: ChatSession | undefined): Message[] {
  return ((session?.messages ?? []) as Message[]).map((m) =>
    m.steps?.some((s) => s.status === "running")
      ? {
          ...m,
          stopped: true,
          editable: false,
          steps: m.steps.map((s) =>
            s.status === "running" ? { ...s, status: "stopped" as const } : s,
          ),
        }
      : m,
  );
}
/** Inline thumbnail of a generated image; click to view it full size. */
function ImagePreview({
  artifact,
  host,
}: {
  artifact: Artifact;
  host: CompanionHost;
}) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    host
      .artifactUrl?.(artifact)
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [artifact.id]);
  if (!host.artifactUrl) return null;
  if (failed)
    return <p className="mdc-thumb-missing">预览已失效（执行器重启过）。已保存的图片不受影响。</p>;
  return (
    <button
      className="mdc-thumb"
      aria-label={`放大查看 ${artifact.name}`}
      title="点击放大"
      onClick={() => void host.previewArtifact(artifact)}
    >
      {src ? <img src={src} alt={artifact.name} /> : <LoaderCircle className="mdc-spin" size={18} />}
    </button>
  );
}
const fileSize = (n?: number) =>
  n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
/** Text worth inserting: a fenced code block's body or a table, else the whole answer. */
function insertable(content: string): string {
  const fenced = content.match(/```(?:markdown|md)?\n([\s\S]*?)```/);
  if (fenced && fenced[1].trim().length > content.trim().length * 0.5)
    return fenced[1].trim();
  return content.trim();
}
const ACTIONS = [
  ["explain", BookOpen],
  ["polish", Sparkles],
  ["translate", Languages],
  ["table", Table2],
  ["research", Globe],
  ["image", Image],
  ["pptx", Presentation],
  ["slides", Code2],
  ["html", FileText],
] as const;
const friendly = (error: unknown) =>
  error instanceof Error ? error.message : "任务失败，请重试。";

export const Companion = forwardRef<
  CompanionHandle,
  { host: CompanionHost; initialOpen?: boolean }
>(function Companion({ host, initialOpen = false }, ref) {
  const [open, setOpen] = useState(
    () => initialOpen || Boolean(host.session?.load()?.open),
  );
  const [toolsOpen, setToolsOpen] = useState(false);
  const [petPosition, setPetPosition] = useState<{ x: number; y: number }>();
  const [panelPosition, setPanelPosition] = useState<{
    x: number;
    y: number;
  }>();
  const panelElement = useRef<HTMLElement>(null);
  const panelDrag = useRef<
    | {
        id: number;
        x: number;
        y: number;
        left: number;
        top: number;
        width: number;
        height: number;
      }
    | undefined
  >(undefined);
  const petElement = useRef<HTMLButtonElement>(null);
  const drag = useRef<
    | {
        id: number;
        x: number;
        y: number;
        left: number;
        top: number;
        moved: boolean;
      }
    | undefined
  >(undefined);
  const suppressClick = useRef(false);
  useEffect(() => {
    const win = petElement.current?.ownerDocument.defaultView;
    if (!win) return;
    const resize = () => {
      setPetPosition(
        (p) =>
          p && {
            x: Math.max(8, Math.min(p.x, win.innerWidth - 74)),
            y: Math.max(8, Math.min(p.y, win.innerHeight - 74)),
          },
      );
      const rect = panelElement.current?.getBoundingClientRect();
      if (rect)
        setPanelPosition(
          (p) =>
            p && {
              x: Math.max(8, Math.min(p.x, win.innerWidth - rect.width - 8)),
              y: Math.max(8, Math.min(p.y, win.innerHeight - rect.height - 8)),
            },
        );
    };
    win.addEventListener("resize", resize);
    return () => win.removeEventListener("resize", resize);
  }, []);
  const [messages, setMessages] = useState<Message[]>(() =>
    restore(host.session?.load()),
  );
  useEffect(() => {
    host.session?.save({ messages, open });
  }, [messages, open]);
  const [runningAction, setRunningAction] = useState<Action>("chat");
  const [running, setRunning] = useState(false);
  const [petBusy, setPetBusy] = useState(false);
  const [outcome, setOutcome] = useState<"idle" | "success" | "error">("idle");
  const [comment, setComment] = useState("我在这里，陪你读，也陪你写。");
  const [quiet, setQuiet] = useState(host.isQuiet());
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<Message>();
  const controller = useRef<AbortController | null>(null);
  /** Incremented per run; events carrying an older id are ignored. */
  const runId = useRef(0);
  const runMessage = useRef<string | undefined>(undefined);
  const viewport = useRef<HTMLDivElement>(null);
  /** Follow new output only while the reader is at the bottom. */
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const latest = useRef(messages);
  latest.current = messages;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    const el = viewport.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, open]);
  const onScroll = () => {
    const el = viewport.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    pinned.current = atBottom;
    setShowJump(!atBottom);
  };
  const jumpToBottom = () => {
    const el = viewport.current;
    if (!el) return;
    pinned.current = true;
    setShowJump(false);
    el.scrollTop = el.scrollHeight;
  };

  /** Ends the current run in the UI immediately; late events from it are ignored. */
  function stop() {
    const abort = controller.current;
    if (!abort) return;
    abort.abort();
    controller.current = null;
    runId.current++;
    setRunning(false);
    setOutcome("idle");
    setComment("先歇一会儿，想继续就叫我。");
    const id = runMessage.current;
    // Do not wait for the transport to settle: a hung upstream may never answer.
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              stopped: true,
              editable: false,
              error: undefined,
              steps: (m.steps ?? []).map((s) =>
                s.status === "running"
                  ? { ...s, status: "stopped" as const }
                  : s,
              ),
            }
          : m,
      ),
    );
  }
  async function execute(
    action: Action,
    instruction: string,
    fixedSnapshot?: Snapshot,
  ) {
    if (controller.current) return;
    let snapshot: Snapshot;
    try {
      snapshot = fixedSnapshot ?? host.capture();
    } catch (error) {
      setNotice(friendly(error));
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    const run = ++runId.current;
    const live = () => run === runId.current && mounted.current;
    setRunning(true);
    setRunningAction(action);
    setNotice("");
    setReview(undefined);
    setOpen(true);
    setToolsOpen(false);
    pinned.current = true;
    setShowJump(false);
    const id = crypto.randomUUID();
    runMessage.current = id;
    const history = latest.current
      .filter((m) => !m.error && !m.stopped && m.content)
      .slice(-10)
      .map(({ role, content }) => ({ role, content: content.slice(0, 12000) }));
    let failed = false;
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: instruction || ACTION_LABELS[action],
      },
      {
        id,
        role: "assistant",
        content: "",
        steps: [],
        artifacts: [],
        snapshot,
        request: { action, instruction },
      },
    ]);
    // Always addressed by this run's message id, so output can never land in another answer.
    const update = (fn: (message: Message) => Message) => {
      if (mounted.current)
        setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
    };
    // Tokens arrive far faster than the screen refreshes; batch them per animation frame.
    let pending = "";
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (!pending) return;
      const text = pending;
      pending = "";
      update((m) => ({ ...m, content: m.content + text }));
    };
    const win = viewport.current?.ownerDocument.defaultView ?? window;
    try {
      await host.run(
        action,
        instruction,
        snapshot,
        history,
        (event) => {
          if (abort.signal.aborted || !live()) return;
          if (event.type === "token") {
            pending += event.text;
            frame ||= win.requestAnimationFrame(flush);
            return;
          }
          flush();
          if (event.type === "reset") update((m) => ({ ...m, content: "" }));
          if (event.type === "step")
            update((m) => {
              const steps = m.steps ?? [];
              const index = steps.findIndex((s) => s.id === event.id);
              return {
                ...m,
                steps:
                  index < 0
                    ? [...steps, event]
                    : steps.map((s, i) => (i === index ? event : s)),
              };
            });
          if (event.type === "result")
            update((m) => ({
              ...m,
              content: event.text,
              editable: event.editable,
            }));
          if (event.type === "artifact")
            update((m) => ({
              ...m,
              artifacts: [...(m.artifacts ?? []), event.artifact],
            }));
          if (event.type === "error") {
            failed = true;
            update((m) => ({ ...m, error: event.message, editable: false }));
          }
        },
        abort.signal,
      );
    } catch (error) {
      failed = true;
      if (!abort.signal.aborted)
        update((m) => ({ ...m, error: friendly(error), editable: false }));
    } finally {
      if (frame) win.cancelAnimationFrame(frame);
      if (!abort.signal.aborted) flush();
      if (controller.current === abort) controller.current = null;
      // A stopped run already updated the UI in stop().
      if (mounted.current && !abort.signal.aborted) {
        if (run === runId.current) setRunning(false);
        setOutcome(failed ? "error" : "success");
        setComment(
          failed ? "这次没能完成，点开查看原因。" : "整理好了，点开看看吧。",
        );
      }
    }
  }
  useImperativeHandle(ref, () => ({
    open(action, snapshot) {
      setOpen(true);
      if (action && action !== "chat") void execute(action, "", snapshot);
    },
    comment(text, tone = "ok") {
      setComment(text);
      // A new reading comment replaces the previous task's success/error mood.
      setOutcome(tone === "error" ? "error" : "idle");
    },
    busy(value) {
      setPetBusy(value);
    },
  }));
  const runtime = useExternalStoreRuntime({
    isRunning: running,
    messages,
    convertMessage: (m: Message): ThreadMessageLike => ({
      id: m.id,
      role: m.role,
      content: [{ type: "text", text: m.content }],
    }),
    onNew: async (message: AppendMessage) => {
      const input = message.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      if (input.trim()) await execute("chat", input);
    },
    onCancel: async () => stop(),
  });
  const act = async (operation: () => void | Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      setNotice(friendly(error));
    }
  };
  return (
    <div className="mdc-shell">
      {!open && !quiet && (
        <div
          className="mdc-pet-bubble"
          role="status"
          style={
            petPosition
              ? {
                  position: "fixed",
                  left: Math.max(8, petPosition.x - 220),
                  top: Math.max(8, petPosition.y - 65),
                  right: "auto",
                  bottom: "auto",
                  maxWidth: 220,
                }
              : undefined
          }
        >
          {running
            ? runningAction === "chat"
              ? "正在想你的问题，稍等我一下…"
              : `正在${ACTION_LABELS[runningAction]}，稍等我一下…`
            : petBusy
              ? "我在读这篇笔记，马上给你建议…"
              : comment}
        </div>
      )}
      <button
        ref={petElement}
        className={`mdc-pet ${running || petBusy ? "is-busy" : ""}`}
        style={
          petPosition
            ? {
                position: "fixed",
                left: petPosition.x,
                top: petPosition.y,
                right: "auto",
                bottom: "auto",
              }
            : undefined
        }
        aria-label="打开hotyaya"
        title="点击聊天 · 拖动移动"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          suppressClick.current = false;
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: rect.left,
            top: rect.top,
            moved: false,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          const win = event.currentTarget.ownerDocument.defaultView;
          if (!start || start.id !== event.pointerId || !win) return;
          const dx = event.clientX - start.x,
            dy = event.clientY - start.y;
          if (!start.moved && Math.hypot(dx, dy) < 5) return;
          start.moved = true;
          suppressClick.current = true;
          setPetPosition({
            x: Math.max(8, Math.min(start.left + dx, win.innerWidth - 74)),
            y: Math.max(8, Math.min(start.top + dy, win.innerHeight - 74)),
          });
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          drag.current = undefined;
          if (event.currentTarget.hasPointerCapture?.(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = undefined;
          suppressClick.current = true;
        }}
        onClick={(event) => {
          if (suppressClick.current && event.detail !== 0) {
            suppressClick.current = false;
            return;
          }
          setOpen((v) => !v);
        }}
      >
        <img
          src={host.petUrl(running ? "busy" : petBusy ? "reading" : outcome)}
          alt="小黄鸭hotyaya"
          draggable={false}
        />
        <span className={`mdc-pet-dot mdc-pet-${outcome}`} />
      </button>
      {open && (
        <section
          ref={panelElement}
          className="mdc-panel"
          role="dialog"
          aria-label="hotyaya"
          style={
            panelPosition
              ? {
                  position: "fixed",
                  left: panelPosition.x,
                  top: panelPosition.y,
                  right: "auto",
                  bottom: "auto",
                }
              : undefined
          }
        >
          <header
            className="mdc-header"
            title="拖动标题栏移动聊天框"
            onPointerDown={(event) => {
              if (
                event.button !== 0 ||
                (event.target as HTMLElement).closest("button")
              )
                return;
              const rect = panelElement.current?.getBoundingClientRect();
              if (!rect) return;
              panelDrag.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = panelDrag.current,
                win = event.currentTarget.ownerDocument.defaultView;
              if (!start || start.id !== event.pointerId || !win) return;
              const dx = event.clientX - start.x,
                dy = event.clientY - start.y;
              if (Math.hypot(dx, dy) < 5) return;
              setPanelPosition({
                x: Math.max(
                  8,
                  Math.min(start.left + dx, win.innerWidth - start.width - 8),
                ),
                y: Math.max(
                  8,
                  Math.min(start.top + dy, win.innerHeight - start.height - 8),
                ),
              });
            }}
            onPointerUp={(event) => {
              if (panelDrag.current?.id !== event.pointerId) return;
              panelDrag.current = undefined;
              if (event.currentTarget.hasPointerCapture?.(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              panelDrag.current = undefined;
            }}
          >
            <div className="mdc-brand">
              <strong>hotyaya</strong>
              {running && <span className="mdc-header-status">正在整理…</span>}
            </div>
            <div className="mdc-header-actions">
              <button
                aria-label={quiet ? "开启自动评论" : "安静模式"}
                title={quiet ? "开启自动评论" : "安静模式"}
                onClick={() => {
                  setQuiet(!quiet);
                  host.setQuiet(!quiet);
                }}
              >
                {quiet ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button aria-label="设置" onClick={() => host.openSettings()}>
                <Settings2 size={16} />
              </button>
              <button
                aria-label="关闭此笔记辅助器"
                onClick={() => host.disable()}
              >
                <Power size={16} />
              </button>
              <button aria-label="收起聊天" onClick={() => setOpen(false)}>
                <X size={17} />
              </button>
            </div>
          </header>
          <AssistantRuntimeProvider runtime={runtime}>
            <div
              ref={viewport}
              className="mdc-messages"
              aria-live="polite"
              aria-busy={running}
              onScroll={onScroll}
            >
              {messages.length === 0 && (
                <div className="mdc-welcome">
                  <h3>把想法慢慢写下来</h3>
                  <p>
                    我可以帮你解读、润色，
                    <br />
                    也可以把这篇笔记变成新的表达。
                  </p>
                  <div className="mdc-hint">试着说「把这段整理成表格」</div>
                </div>
              )}
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`mdc-message mdc-${message.role}`}
                >
                  {message.role === "assistant" && (
                    <div className="mdc-assistant-label">hotyaya</div>
                  )}
                  {!!message.steps?.length && (
                    <div className="mdc-steps">
                      {message.steps.map((step) => (
                        <Collapsible.Root key={step.id} className="mdc-step">
                          <Collapsible.Trigger className="mdc-step-trigger">
                            <ChevronRight size={12} className="mdc-chevron" />
                            {step.status === "running" ? (
                              <LoaderCircle className="mdc-spin" size={14} />
                            ) : step.status === "done" ? (
                              <Check size={14} />
                            ) : step.status === "stopped" ? (
                              <Square size={11} />
                            ) : (
                              <X size={14} />
                            )}
                            <span>{step.label}</span>
                            <small>
                              {step.status === "stopped"
                                ? "已停止"
                                : step.elapsedMs == null
                                  ? step.status === "running"
                                    ? "进行中"
                                    : ""
                                  : `${(step.elapsedMs / 1000).toFixed(2)}s`}
                            </small>
                          </Collapsible.Trigger>
                          <Collapsible.Content className="mdc-step-detail">
                            {step.detail || "此步骤没有附加信息。"}
                          </Collapsible.Content>
                        </Collapsible.Root>
                      ))}
                    </div>
                  )}
                  <div className="mdc-markdown">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        img: ({ src, alt }) => (
                          <a
                            href={typeof src === "string" ? src : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {alt || "图片"}（点击查看）
                          </a>
                        ),
                        a: ({ children, ...props }) => (
                          <a
                            {...props}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {message.content}
                    </Markdown>
                  </div>
                  {message.error && (
                    <p className="mdc-error" role="alert">
                      {message.error}
                    </p>
                  )}
                  {message.stopped && (
                    <p className="mdc-stopped">
                      已停止{message.content ? "，保留了已生成的部分。" : "。"}
                    </p>
                  )}
                  {!!message.artifacts?.length && (
                    <div className="mdc-artifacts">
                      {message.artifacts.map((artifact) => {
                        const saved = message.saved?.[artifact.id];
                        const save = async () => {
                          const file = await host.saveArtifact(
                            artifact,
                            message.snapshot,
                          );
                          setMessages((prev) =>
                            prev.map((m) =>
                              m.id === message.id
                                ? {
                                    ...m,
                                    saved: { ...m.saved, [artifact.id]: file },
                                  }
                                : m,
                            ),
                          );
                          return file;
                        };
                        return (
                          <React.Fragment key={artifact.id}>
                          {artifact.mime.startsWith("image/") && (
                            <ImagePreview artifact={artifact} host={host} />
                          )}
                          <div className="mdc-file">
                            <span className="mdc-file-icon">
                              {artifact.mime.startsWith("image/") ? (
                                <Image size={18} />
                              ) : artifact.mime === "text/html" ? (
                                <Code2 size={18} />
                              ) : (
                                <Presentation size={18} />
                              )}
                            </span>
                            <span className="mdc-file-meta">
                              <strong>{artifact.name}</strong>
                              <small>
                                {saved
                                  ? `已保存到 ${saved}`
                                  : [
                                      artifact.name
                                        .split(".")
                                        .pop()
                                        ?.toUpperCase(),
                                      fileSize(artifact.size),
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                              </small>
                            </span>
                            <span className="mdc-file-actions">
                              {(artifact.mime === "text/html" ||
                                artifact.mime.startsWith("image/")) && (
                                <button
                                  aria-label={`预览 ${artifact.name}`}
                                  title="预览"
                                  onClick={() =>
                                    void act(() =>
                                      host.previewArtifact(artifact),
                                    )
                                  }
                                >
                                  <Eye size={15} />
                                </button>
                              )}
                              {saved ? (
                                <button
                                  aria-label={`打开 ${artifact.name}`}
                                  title="打开"
                                  onClick={() =>
                                    void act(() => host.openFile(saved))
                                  }
                                >
                                  <ExternalLink size={15} />
                                </button>
                              ) : (
                                <button
                                  aria-label={`保存 ${artifact.name}`}
                                  title="保存到原笔记同目录"
                                  onClick={() =>
                                    void act(async () =>
                                      setNotice(`已保存：${await save()}`),
                                    )
                                  }
                                >
                                  <FolderDown size={15} />
                                </button>
                              )}
                              <button
                                aria-label={`下载 ${artifact.name}`}
                                title="另存为…"
                                onClick={() =>
                                  void act(() =>
                                    host.downloadArtifact(artifact),
                                  )
                                }
                              >
                                <Download size={15} />
                              </button>
                              {artifact.mime.startsWith("image/") &&
                                message.snapshot &&
                                host.insertArtifact && (
                                  <button
                                    title="插入到选区后"
                                    onClick={() =>
                                      void act(async () => {
                                        await host.insertArtifact!(
                                          artifact,
                                          message.snapshot!,
                                        );
                                        setNotice(
                                          "配图已插入选区后，可撤销。",
                                        );
                                      })
                                    }
                                  >
                                    插入
                                  </button>
                                )}
                            </span>
                          </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                  {message.role === "assistant" &&
                    !(running && message.id === messages.at(-1)?.id) && (
                      <div className="mdc-message-actions">
                        {message.snapshot &&
                          !!message.content &&
                          !message.error &&
                          !message.artifacts?.length &&
                          message.request?.action !== "research" && (
                            <>
                              <button
                                title="先预览差异，再替换原文"
                                onClick={() =>
                                  setReview({
                                    ...message,
                                    content: message.editable
                                      ? message.content
                                      : insertable(message.content),
                                  })
                                }
                              >
                                <Replace size={13} />
                                {message.snapshot.from === 0 &&
                                message.snapshot.to ===
                                  message.snapshot.content.length
                                  ? "替换全文"
                                  : "替换选区"}
                              </button>
                              <button
                                title="插入到原选区之后，不修改原文"
                                onClick={() =>
                                  void act(() => {
                                    // Rewrite the original range as itself plus the result, so the
                                    // position is still found after unrelated edits to the note.
                                    const snap = message.snapshot!;
                                    host.apply(
                                      snap,
                                      `${snap.content.slice(snap.from, snap.to)}\n\n${
                                        message.editable
                                          ? message.content
                                          : insertable(message.content)
                                      }\n`,
                                    );
                                    setNotice("已插入到选区后，可撤销。");
                                  })
                                }
                              >
                                <ArrowDown size={13} />
                                插入下方
                              </button>
                            </>
                          )}
                        {!!message.content && (
                          <button
                            aria-label="复制结果"
                            onClick={() =>
                              void act(async () => {
                                await navigator.clipboard.writeText(
                                  message.content,
                                );
                                setNotice("已复制。");
                              })
                            }
                          >
                            <Copy size={13} />
                            复制
                          </button>
                        )}
                        {(message.error || message.stopped) &&
                          message.request &&
                          !running && (
                            <button
                              onClick={() =>
                                void execute(
                                  message.request!.action,
                                  message.request!.instruction,
                                )
                              }
                            >
                              <RotateCcw size={13} />
                              重试
                            </button>
                          )}
                      </div>
                    )}
                </article>
              ))}
            </div>
            {showJump && (
              <button
                className="mdc-jump"
                aria-label="回到最新"
                onClick={jumpToBottom}
              >
                <ArrowDown size={14} />
                {running ? "正在生成，回到最新" : "回到最新"}
              </button>
            )}
            {review?.snapshot && (
              <div className="mdc-review" role="region" aria-label="修改预览">
                <div>
                  <strong>
                    {review.snapshot.from === 0 &&
                    review.snapshot.to === review.snapshot.content.length
                      ? "替换全文预览"
                      : "替换选区预览"}
                  </strong>
                  <button
                    aria-label="关闭预览"
                    onClick={() => setReview(undefined)}
                  >
                    <X size={15} />
                  </button>
                </div>
                <pre>
                  {diffLines(
                    review.snapshot.content.slice(
                      review.snapshot.from,
                      review.snapshot.to,
                    ),
                    review.content,
                  ).map((part, index) => (
                    <span
                      key={index}
                      className={
                        part.added
                          ? "mdc-added"
                          : part.removed
                            ? "mdc-removed"
                            : ""
                      }
                    >
                      {part.value}
                    </span>
                  ))}
                </pre>
                <button
                  className="mdc-primary"
                  onClick={() =>
                    void act(() => {
                      host.apply(review.snapshot!, review.content);
                      setReview(undefined);
                      setNotice("已应用，可以撤销本次修改。");
                    })
                  }
                >
                  应用修改
                </button>
              </div>
            )}
            {notice && (
              <div className="mdc-notice" role="status">
                {notice}
                <button aria-label="关闭提示" onClick={() => setNotice("")}>
                  <X size={12} />
                </button>
              </div>
            )}
            <footer className="mdc-footer">
              {toolsOpen && (
                <div
                  className="mdc-quick-actions"
                  id="mdc-tools"
                  role="group"
                  aria-label="笔记功能"
                >
                  {ACTIONS.map(([action, Icon]) => (
                    <button
                      key={action}
                      disabled={running}
                      onClick={() => void execute(action, "")}
                    >
                      <Icon size={14} />
                      {ACTION_LABELS[action]}
                    </button>
                  ))}
                </div>
              )}
              <ComposerPrimitive.Root className="mdc-composer">
                <button
                  type="button"
                  className="mdc-tools-toggle"
                  aria-label="选择功能"
                  aria-expanded={toolsOpen}
                  aria-controls="mdc-tools"
                  onClick={() => setToolsOpen((v) => !v)}
                >
                  <Plus size={18} />
                </button>
                <ComposerPrimitive.Input
                  aria-label="输入想用的功能"
                  placeholder="聊聊这篇笔记，或输入想用的功能…"
                  rows={2}
                />
                {running ? (
                  <button
                    className="mdc-send"
                    aria-label="停止生成"
                    onClick={stop}
                  >
                    <Square size={14} />
                  </button>
                ) : (
                  <ComposerPrimitive.Send
                    className="mdc-send"
                    aria-label="发送"
                  >
                    <ArrowUp size={18} />
                  </ComposerPrimitive.Send>
                )}
              </ComposerPrimitive.Root>
              <div className="mdc-footnote">
                <span>只处理当前笔记或选区</span>
                <button
                  onClick={() =>
                    void act(() => {
                      host.undo();
                      setNotice("已撤销。");
                    })
                  }
                >
                  <RotateCcw size={11} />
                  撤销修改
                </button>
              </div>
            </footer>
          </AssistantRuntimeProvider>
        </section>
      )}
    </div>
  );
});
