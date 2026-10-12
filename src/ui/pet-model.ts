import type { Action } from "../shared/protocol";

export type Interaction = "pet" | "feed" | "play" | "sleep" | "break" | "focus";
export interface PetMemory {
  name: string;
  skin: "cat" | "duck";
  size: number;
  bond: number;
  born: number;
  position?: { x: number; y: number };
  diary: { at: number; text: string }[];
  lastInteraction: number;
  focusUntil?: number;
}
export type Activity = {
  label: string;
  prop: string;
  motion: string;
  sprite: "idle" | "alert" | "sleep" | "groom" | "walk" | "run";
};
export const ACTIVITIES = {
  idle: { label: "陪在你身边", prop: "", motion: "breathe", sprite: "idle" },
  walk: {
    label: "散散步，灵感会来的",
    prop: "✦",
    motion: "wander",
    sprite: "walk",
  },
  groom: {
    label: "伸个懒腰，再继续",
    prop: "✧",
    motion: "stretch",
    sprite: "groom",
  },
  pet: {
    label: "被你摸摸，今天都变软了",
    prop: "♥",
    motion: "love",
    sprite: "groom",
  },
  feed: {
    label: "啊呜！这口幸福收到啦",
    prop: "🍪",
    motion: "nibble",
    sprite: "groom",
  },
  play: {
    label: "接住啦！再陪我玩一会",
    prop: "●",
    motion: "chase",
    sprite: "run",
  },
  sleep: {
    label: "眯一小会，你需要时我就在",
    prop: "z Z",
    motion: "sleep",
    sprite: "sleep",
  },
  break: {
    label: "批准摸鱼！陪你放空一下",
    prop: "☕",
    motion: "rock",
    sprite: "idle",
  },
  focus: {
    label: "一起专注，我安静陪着你",
    prop: "◷",
    motion: "breathe",
    sprite: "idle",
  },
  success: {
    label: "完成啦！又一起做好了一件事",
    prop: "✦",
    motion: "celebrate",
    sprite: "alert",
  },
  error: {
    label: "这次没成功，我们慢慢来",
    prop: "♡",
    motion: "rock",
    sprite: "idle",
  },
  hover: {
    label: "我在呢，摸摸还是吃点心？",
    prop: "♡",
    motion: "breathe",
    sprite: "alert",
  },
  drag: { label: "搭个顺风车～", prop: "✧", motion: "lift", sprite: "alert" },
} satisfies Record<string, Activity>;

const WORK: Record<Action, Activity> = {
  chat: {
    label: "认真想想你的问题",
    prop: "💭",
    motion: "think",
    sprite: "idle",
  },
  comment: {
    label: "陪你读这一页",
    prop: "📖",
    motion: "read",
    sprite: "idle",
  },
  explain: {
    label: "翻翻书，帮你讲明白",
    prop: "📖",
    motion: "read",
    sprite: "idle",
  },
  polish: {
    label: "一句一句，打磨你的文字",
    prop: "✎",
    motion: "write",
    sprite: "groom",
  },
  translate: {
    label: "把心意翻译成另一种语言",
    prop: "A / 文",
    motion: "translate",
    sprite: "groom",
  },
  table: {
    label: "把信息整理得整整齐齐",
    prop: "▦",
    motion: "sort",
    sprite: "groom",
  },
  research: {
    label: "带上放大镜，去找找线索",
    prop: "🔎",
    motion: "search",
    sprite: "walk",
  },
  image: {
    label: "调好颜色，画出你的想法",
    prop: "🖌",
    motion: "paint",
    sprite: "groom",
  },
  pptx: {
    label: "把你的想法装进幻灯片",
    prop: "▣",
    motion: "pack",
    sprite: "groom",
  },
  slides: {
    label: "排练一场小小的演示",
    prop: "▶",
    motion: "present",
    sprite: "alert",
  },
  html: {
    label: "给文章排个漂亮版式",
    prop: "</>",
    motion: "write",
    sprite: "groom",
  },
};
export const activityForAction = (action: Action): Activity => WORK[action];
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export function normalizePet(value?: unknown, now = Date.now()): PetMemory {
  const v =
    value && typeof value === "object" ? (value as Partial<PetMemory>) : {};
  return {
    name:
      typeof v.name === "string" && v.name.trim()
        ? Array.from(v.name.trim()).slice(0, 20).join("")
        : "hotyaya",
    skin: v.skin === "duck" ? "duck" : "cat",
    size: finite(v.size) ? Math.max(64, Math.min(96, v.size)) : 80,
    bond: finite(v.bond) ? Math.max(0, Math.min(100, v.bond)) : 0,
    born: finite(v.born) && v.born > 0 && v.born <= now ? v.born : now,
    position:
      v.position && finite(v.position.x) && finite(v.position.y)
        ? { x: Math.max(8, v.position.x), y: Math.max(8, v.position.y) }
        : undefined,
    diary: Array.isArray(v.diary)
      ? v.diary
          .filter((e) => e && finite(e.at) && typeof e.text === "string")
          .slice(0, 20)
          .map((e) => ({ at: e.at, text: e.text.slice(0, 100) }))
      : [],
    lastInteraction: finite(v.lastInteraction) ? v.lastInteraction : 0,
    focusUntil:
      finite(v.focusUntil) &&
      v.focusUntil > 0 &&
      v.focusUntil <= now + 25 * 60000
        ? v.focusUntil
        : undefined,
  };
}
const MEMORIES: Record<Interaction, string> = {
  pet: "收到了温柔的摸摸",
  feed: "一起分享了一块点心",
  play: "一起玩了抛球",
  sleep: "安心地打了个盹",
  break: "一起享受了摸鱼时光",
  focus: "开始了 25 分钟的并肩专注",
};
export function interact(
  pet: PetMemory,
  action: Interaction,
  now = Date.now(),
): PetMemory {
  if (now - pet.lastInteraction < 1500)
    return action === "focus" ? { ...pet, focusUntil: now + 25 * 60000 } : pet;
  return {
    ...pet,
    bond: Math.min(100, pet.bond + 2),
    lastInteraction: now,
    focusUntil: action === "focus" ? now + 25 * 60000 : pet.focusUntil,
    diary: [{ at: now, text: MEMORIES[action] }, ...pet.diary].slice(0, 20),
  };
}
