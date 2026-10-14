import { PetSprite } from "./PetSprite";
import { idleActions, animationDuration } from "./pet-animation";
import React, { useEffect, useRef, useState } from "react";
import {
  PawPrint,
  X,
  MessageCircle,
  Heart,
  Cookie,
  CircleDot,
  Moon,
  Coffee,
  Timer,
  BookHeart,
} from "lucide-react";
import type { Action } from "../shared/protocol";
import type { CompanionHost } from "./types";
import {
  ACTIVITIES,
  activityForAction,
  interact,
  normalizePet,
  type Interaction,
  type PetMemory,
} from "./pet-model";

const CHOICES = [
  ["pet", Heart, "摸摸"],
  ["feed", Cookie, "喂点心"],
  ["play", CircleDot, "抛球"],
  ["sleep", Moon, "打个盹"],
  ["break", Coffee, "一起摸鱼"],
  ["focus", Timer, "一起专注"],
] as const;
const SPECIAL = {
  cat: [
    ["groom", "洗洗脸"],
    ["stretch", "伸懒腰"],
    ["scratch", "抓抓板"],
    ["pounce", "扑蝴蝶"],
    ["yawn", "打哈欠"],
  ],
  duck: [
    ["flap", "拍拍翅膀"],
    ["preen", "梳理羽毛"],
    ["waddle", "摇摆散步"],
    ["dance", "开心踏步"],
    ["swim", "游一圈"],
  ],
} as const;
const WELCOME = [
  "你来啦，给你留了一个软软的位置。",
  "今天也一起慢慢来。",
  "写一点、歇一会，都很好。",
  "不用一直很厉害，我陪你。",
];
type Props = {
  host: CompanionHost;
  running: boolean;
  action: Action;
  reading: boolean;
  outcome: "idle" | "success" | "error";
  comment: string;
  quiet: boolean;
  onChat(): void;
  onNameChange?(name: string): void;
  open: boolean;
};
export function PetCompanion({
  host,
  running,
  action,
  reading,
  outcome,
  comment,
  quiet,
  onChat,
  onNameChange,
  open,
}: Props) {
  const [memory, setMemory] = useState(() => normalizePet(host.pet?.load()));
  const memoryRef = useRef(memory);
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState(memory.name);
  const [local, setLocal] = useState<keyof typeof ACTIVITIES>("idle");
  const [hover, setHover] = useState(false);
  const [lifted, setLifted] = useState(false);
  const [replay, setReplay] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [toast, setToast] = useState(
    WELCOME[Math.floor(Math.random() * WELCOME.length)],
  );
  const [showComment, setShowComment] = useState(false);
  const previousComment = useRef(comment);
  const [recentOutcome, setRecentOutcome] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  const button = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
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
  const suppress = useRef(false);
  const [saveError, setSaveError] = useState("");
  const persist = (next: PetMemory) => {
    memoryRef.current = next;
    setMemory(next);
    Promise.resolve(host.pet?.save(next)).catch(() =>
      setSaveError("这次记忆没保存成功，请稍后再试。"),
    );
  };
  const bound = (x: number, y: number) => {
    const win = button.current?.ownerDocument.defaultView;
    return {
      x: Math.max(
        8,
        Math.min(x, (win?.innerWidth ?? 1024) - memoryRef.current.size - 16),
      ),
      y: Math.max(
        8,
        Math.min(y, (win?.innerHeight ?? 768) - memoryRef.current.size - 40),
      ),
    };
  };
  useEffect(() => {
    const doc = button.current?.ownerDocument,
      win = doc?.defaultView;
    const query = win?.matchMedia?.("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(Boolean(query?.matches));
    const visibility = () => setVisible(!doc?.hidden);
    const resize = () => {
      const p = memoryRef.current.position ?? {
        x: (win?.innerWidth ?? 1024) - 32 - memoryRef.current.size,
        y: (win?.innerHeight ?? 768) - 38 - memoryRef.current.size,
      };
      persist({ ...memoryRef.current, position: bound(p.x, p.y) });
    };
    motion();
    visibility();
    resize();
    query?.addEventListener?.("change", motion);
    doc?.addEventListener("visibilitychange", visibility);
    win?.addEventListener("resize", resize);
    return () => {
      query?.removeEventListener?.("change", motion);
      doc?.removeEventListener("visibilitychange", visibility);
      win?.removeEventListener("resize", resize);
      clearTimeout(actionTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (previousComment.current !== comment) setToast("");
    previousComment.current = comment;
    setShowComment(true);
    const timer = setTimeout(() => setShowComment(false), 10000);
    return () => clearTimeout(timer);
  }, [comment]);
  useEffect(() => {
    setRecentOutcome(outcome);
    const timer = setTimeout(() => setRecentOutcome("idle"), 6500);
    return () => clearTimeout(timer);
  }, [outcome]);
  useEffect(() => {
    if (running || reading) {
      clearTimeout(actionTimer.current);
      setLocal("idle");
    }
  }, [running, reading]);
  useEffect(() => {
    clearTimeout(actionTimer.current);
    setLocal("idle");
  }, [memory.skin]);
  useEffect(() => {
    if (
      running ||
      reading ||
      menu ||
      hover ||
      lifted ||
      !visible ||
      memory.focusUntil
    )
      return;
    const timer = setInterval(
      () =>
        setLocal((s) =>
          s === "idle"
            ? idleActions(memory.skin)[
                Math.floor(Math.random() * idleActions(memory.skin).length)
              ]
            : "idle",
        ),
      14000,
    );
    return () => clearInterval(timer);
  }, [
    running,
    reading,
    menu,
    hover,
    lifted,
    visible,
    memory.focusUntil,
    memory.skin,
  ]);
  useEffect(() => {
    if (!memory.focusUntil) return;
    const tick = () => {
      const now = Date.now();
      setClock(now);
      if (memoryRef.current.focusUntil && now >= memoryRef.current.focusUntil) {
        persist({
          ...memoryRef.current,
          focusUntil: undefined,
          diary: [
            { at: now, text: "完成了一段并肩专注，休息一下吧" },
            ...memoryRef.current.diary,
          ].slice(0, 20),
        });
        setToast("这段专注完成啦，喝口水、看看远处吧。");
        setLocal("success");
        clearTimeout(actionTimer.current);
        actionTimer.current = setTimeout(() => setLocal("idle"), 6000);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [memory.focusUntil]);
  useEffect(() => {
    if (!menu) return;
    const doc = panel.current?.ownerDocument;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    const outside = (e: PointerEvent) => {
      if (
        !panel.current?.contains(e.target as Node) &&
        !menuButton.current?.contains(e.target as Node) &&
        !button.current?.contains(e.target as Node)
      )
        setMenu(false);
    };
    doc?.addEventListener("keydown", close);
    doc?.addEventListener("pointerdown", outside);
    return () => {
      doc?.removeEventListener("keydown", close);
      doc?.removeEventListener("pointerdown", outside);
    };
  }, [menu]);
  const busy = running || reading;
  const activity = running
    ? activityForAction(action)
    : reading
      ? activityForAction("comment")
      : lifted
        ? ACTIVITIES.drag
        : recentOutcome !== "idle"
          ? ACTIVITIES[recentOutcome]
          : memory.focusUntil
            ? ACTIVITIES.focus
            : local !== "idle"
              ? ACTIVITIES[local]
              : hover
                ? ACTIVITIES.hover
                : ACTIVITIES.idle;
  const doAction = (kind: Interaction) => {
    if (busy) return;
    setMenu(false);
    menuButton.current?.focus();
    setReplay((value) => value + 1);
    setRecentOutcome("idle");
    const next = interact(memoryRef.current, kind);
    persist(next);
    setLocal(kind);
    setToast(ACTIVITIES[kind].label);
    clearTimeout(actionTimer.current);
    actionTimer.current = setTimeout(
      () => setLocal("idle"),
      kind === "sleep" || kind === "break"
        ? 30000
        : Math.max(
            4000,
            animationDuration(memory.skin, ACTIVITIES[kind].motion) * 2,
          ),
    );
  };
  const position = memory.position;
  const viewport = button.current?.ownerDocument.defaultView;
  const left =
    position?.x ??
    Math.max(8, (viewport?.innerWidth ?? 1024) - 32 - memory.size);
  const top =
    position?.y ??
    Math.max(8, (viewport?.innerHeight ?? 768) - 38 - memory.size);
  const floating: React.CSSProperties = position
    ? {
        position: "fixed",
        left: position.x,
        top: position.y,
        right: "auto",
        bottom: "auto",
      }
    : {};
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.max(
      8,
      Math.min(
        left >= 338 ? left - 330 : left + memory.size + 12,
        (viewport?.innerWidth ?? 1024) - 322,
      ),
    ),
    top: Math.max(8, Math.min(top - 450, (viewport?.innerHeight ?? 768) - 480)),
  };
  const bubble = busy
    ? activity.label
    : recentOutcome !== "idle"
      ? showComment
        ? comment
        : activity.label
      : toast || (showComment ? comment : "");
  const duckState =
    recentOutcome !== "idle" && !busy
      ? recentOutcome
      : activity.sprite === "run"
        ? "success"
        : busy
          ? "busy"
          : activity.sprite === "walk"
            ? "reading"
            : local === "pet" || local === "feed"
              ? "error"
              : "idle";
  const remaining = Math.max(
    0,
    Math.ceil(((memory.focusUntil ?? clock) - clock) / 1000),
  );
  return (
    <>
      {!open && !quiet && !menu && bubble && (
        <div
          className="mdc-pet-bubble mdc-pet-speech"
          role="status"
          style={{
            position: "fixed",
            left: Math.max(
              8,
              Math.min(left - 220, (viewport?.innerWidth ?? 1024) - 260),
            ),
            top: Math.max(8, top - 70),
            right: "auto",
            bottom: "auto",
          }}
        >
          <strong>{memory.name}</strong>
          <span>{bubble}</span>
        </div>
      )}
      <button
        ref={button}
        className={`mdc-pet mdc-creature ${busy ? "is-busy" : ""} ${reduced ? "is-still" : ""}`}
        data-activity={activity.motion}
        style={{ ...floating, width: memory.size, height: memory.size }}
        aria-label={`打开${memory.name}`}
        title="点击聊天 · 拖动移动 · 右键互动"
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu((v) => !v);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const r = e.currentTarget.getBoundingClientRect();
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            left: r.left,
            top: r.top,
            moved: false,
          };
          suppress.current = false;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 5) return;
          d.moved = true;
          suppress.current = true;
          setLifted(true);
          const next = {
            ...memoryRef.current,
            position: bound(d.left + dx, d.top + dy),
          };
          memoryRef.current = next;
          setMemory(next);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          drag.current = undefined;
          setLifted(false);
          if (d.moved) persist(memoryRef.current);
          if (e.currentTarget.hasPointerCapture?.(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = undefined;
          setLifted(false);
          suppress.current = true;
          persist(memoryRef.current);
        }}
        onClick={(e) => {
          if (suppress.current && e.detail !== 0) {
            suppress.current = false;
            return;
          }
          onChat();
        }}
      >
        <span className="mdc-pet-shadow" />
        <span
          key={`${activity.motion}-${replay}`}
          className={`mdc-pet-actor motion-${activity.motion}`}
        >
          <PetSprite
            skin={memory.skin}
            size={memory.size}
            name={memory.name}
            activity={activity}
            host={host}
            reduced={reduced}
            visible={visible}
            fallback={duckState}
          />
          <span className="mdc-pet-prop" aria-hidden="true">
            {activity.prop}
          </span>
        </span>
        <span className="mdc-pet-name">
          {memory.name}
          {memory.focusUntil
            ? ` · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
            : ""}
        </span>
      </button>
      <button
        ref={menuButton}
        className="mdc-pet-menu-toggle"
        style={{
          position: "fixed",
          left: left + memory.size - 18,
          top: top + memory.size - 6,
        }}
        aria-label="宠物互动"
        aria-expanded={menu}
        onClick={() => setMenu((v) => !v)}
      >
        <PawPrint size={15} />
      </button>
      {menu && (
        <section
          ref={panel}
          className="mdc-pet-home"
          role="dialog"
          aria-label="宠物小窝"
          style={panelStyle}
        >
          <header>
            <div>
              <small>OUR LITTLE CORNER</small>
              <h3>{memory.name}的小窝</h3>
            </div>
            <button
              aria-label="关闭宠物小窝"
              onClick={() => {
                setMenu(false);
                menuButton.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          </header>
          <p className="mdc-pet-caption">
            相伴第{" "}
            {Math.max(1, Math.floor((Date.now() - memory.born) / 86400000) + 1)}{" "}
            天 ·{" "}
            {memory.bond < 20
              ? "初次相识"
              : memory.bond < 60
                ? "越来越亲近"
                : "最安心的搭档"}
          </p>
          <div
            className="mdc-pet-bond"
            role="progressbar"
            aria-label="亲密度"
            aria-valuenow={memory.bond}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${memory.bond}%` }} />
          </div>
          <p className="mdc-pet-current" role="status">
            {activity.label}
            {memory.focusUntil
              ? ` · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
              : ""}
          </p>
          {busy && <p className="mdc-pet-caption">忙完这件事，再来一起玩。</p>}
          <div className="mdc-pet-actions">
            {CHOICES.map(([key, Icon, label]) => (
              <button
                key={key}
                disabled={busy || Boolean(memory.focusUntil)}
                onClick={() => doAction(key)}
              >
                <Icon size={19} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="mdc-pet-special">
            <p>{memory.skin === "cat" ? "猫咪的小习惯" : "小鸭的拿手好戏"}</p>
            <div className="mdc-pet-extra-actions">
              {SPECIAL[memory.skin].map(([key, label]) => (
                <button
                  key={key}
                  disabled={busy || Boolean(memory.focusUntil)}
                  onClick={() => doAction(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {memory.focusUntil && (
            <button
              className="mdc-pet-wide"
              onClick={() => {
                persist({ ...memoryRef.current, focusUntil: undefined });
                setLocal("break");
                setToast("随时可以休息，陪伴不用打卡。");
              }}
            >
              结束专注，休息一下
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const next = normalizePet({ ...memoryRef.current, name });
              persist(next);
              setName(next.name);
              onNameChange?.(next.name);
              setToast(`好呀，以后就叫我${next.name}。`);
            }}
          >
            <label htmlFor="mdc-pet-name-input">给伙伴取个名字</label>
            <div className="mdc-pet-name-row">
              <input
                id="mdc-pet-name-input"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="最多 20 个字"
              />
              <button type="submit">保存</button>
            </div>
          </form>
          <div className="mdc-pet-options">
            <label>
              形象
              <select
                value={memory.skin}
                onChange={(e) =>
                  persist({
                    ...memoryRef.current,
                    skin: e.target.value as PetMemory["skin"],
                  })
                }
              >
                <option value="cat">云朵猫 · oneko</option>
                <option value="duck">小黄鸭</option>
              </select>
            </label>
            <label>
              大小
              <select
                value={memory.size}
                onChange={(e) => {
                  const next = {
                    ...memoryRef.current,
                    size: Number(e.target.value),
                  };
                  memoryRef.current = next;
                  persist({
                    ...next,
                    position: next.position
                      ? bound(next.position.x, next.position.y)
                      : undefined,
                  });
                }}
              >
                <option value={64}>小巧</option>
                <option value={80}>标准</option>
                <option value={96}>大只</option>
              </select>
            </label>
          </div>
          <details className="mdc-pet-diary">
            <summary>
              <BookHeart size={14} /> 我们的小日记 · {memory.diary.length}
            </summary>
            {memory.diary.length ? (
              <ul>
                {memory.diary.map((entry, i) => (
                  <li key={`${entry.at}-${i}`}>
                    <time>{new Date(entry.at).toLocaleDateString()}</time>
                    {entry.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p>第一次摸摸，就会成为我们的第一段记忆。</p>
            )}
          </details>
          {saveError && <p role="alert">{saveError}</p>}
          <button
            className="mdc-pet-wide"
            onClick={() => {
              setMenu(false);
              if (!open) onChat();
            }}
          >
            <MessageCircle size={15} /> 和{memory.name}聊聊天
          </button>
          <footer>离开也没关系，回来就能继续陪伴。</footer>
        </section>
      )}
    </>
  );
}
