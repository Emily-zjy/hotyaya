/** Frame coordinates from adryd325/oneko.js; duck clips from VS Code Pets.
 * Choreography here is local to hotyaya. All durations are milliseconds. */
export type Skin = "cat" | "duck";
export type DuckClip =
  "idle" | "walk" | "walk_fast" | "run" | "swipe" | "with_ball";
export type PetAsset = "oneko.gif" | "icon.png" | `yellow_${DuckClip}_8fps.gif`;
type Cell = readonly [number, number];
type Stage = {
  duration: number;
  cells?: readonly Cell[];
  clip?: DuckClip;
  flip?: boolean;
  pose?: string;
  fps?: number;
};
export const CAT_FRAMES = {
  idle: [[3, 3]],
  alert: [[7, 3]],
  sleep: [
    [2, 0],
    [2, 1],
  ],
  groom: [
    [5, 0],
    [6, 0],
    [7, 0],
  ],
  walk: [
    [3, 0],
    [3, 1],
  ],
  run: [
    [4, 2],
    [4, 3],
  ],
  yawn: [[3, 2]],
  stretch: [
    [0, 0],
    [0, 1],
  ],
  scratch: [
    [2, 2],
    [2, 3],
  ],
  northwest: [
    [1, 0],
    [1, 1],
  ],
  southeast: [
    [5, 1],
    [5, 2],
  ],
} satisfies Record<string, readonly Cell[]>;
const cat = (
  duration: number,
  kind: keyof typeof CAT_FRAMES,
  pose = "",
  fps = 6.25,
): Stage => ({ duration, cells: CAT_FRAMES[kind], pose, fps });
const duck = (
  duration: number,
  clip: DuckClip,
  pose = "",
  flip = false,
): Stage => ({ duration, clip, pose, flip });
const CAT: Record<string, readonly Stage[]> = {
  "cat-yawn": [
    cat(1600, "yawn", "drowsy", 2),
    cat(1600, "sleep", "curl", 2),
    cat(800, "idle"),
  ],
  "cat-stretch": [
    cat(800, "yawn", "crouch", 2),
    cat(1600, "stretch", "reach", 4),
    cat(800, "idle"),
  ],
  "cat-scratch": [
    cat(640, "alert"),
    cat(2400, "scratch", "scratch", 8),
    cat(800, "groom", "", 5),
  ],
  "cat-pounce": [
    cat(640, "alert", "crouch"),
    cat(960, "northwest"),
    cat(640, "scratch", "catch"),
    cat(960, "southeast"),
    cat(640, "idle"),
  ],
  "cat-wash": [cat(2400, "groom", "wash", 5), cat(800, "idle")],
  chase: [
    cat(640, "alert", "crouch"),
    cat(960, "run"),
    cat(640, "scratch", "catch"),
    cat(960, "walk"),
  ],
  sleep: [cat(1600, "yawn", "drowsy", 2), cat(6400, "sleep", "curl", 1.6)],
  nibble: [
    cat(800, "yawn", "crouch", 2),
    cat(2400, "groom", "nibble", 5),
    cat(800, "idle"),
  ],
  love: [
    cat(1600, "groom", "wash", 4),
    cat(800, "yawn", "drowsy", 2),
    cat(800, "idle"),
  ],
};
const DUCK: Record<string, readonly Stage[]> = {
  "duck-flap": [duck(1600, "swipe", "flap"), duck(800, "idle")],
  "duck-preen": [
    duck(800, "idle", "bow"),
    duck(1600, "swipe", "preen"),
    duck(800, "idle"),
  ],
  "duck-waddle": [
    duck(1600, "walk"),
    duck(800, "walk_fast"),
    duck(1600, "walk", "", true),
    duck(800, "idle"),
  ],
  "duck-dance": [
    duck(1000, "swipe", "dance"),
    duck(800, "run", "dance"),
    duck(1000, "swipe", "dance", true),
    duck(800, "walk_fast", "dance", true),
  ],
  "duck-swim": [
    duck(1600, "walk", "swim"),
    duck(1600, "walk", "swim", true),
    duck(800, "idle", "swim"),
  ],
  chase: [duck(1280, "run"), duck(1920, "with_ball")],
  nibble: [
    duck(800, "idle", "bow"),
    duck(1600, "swipe", "nibble"),
    duck(800, "idle"),
  ],
  love: [duck(1600, "swipe", "preen"), duck(800, "idle")],
  wander: [duck(1600, "walk"), duck(1600, "walk", "", true)],
  stretch: [duck(1600, "swipe", "flap"), duck(800, "idle")],
  celebrate: [duck(1200, "swipe", "flap"), duck(1200, "with_ball")],
  sleep: [duck(1600, "idle", "bow"), duck(6400, "idle", "rest")],
};
function timeline(
  skin: Skin,
  motion: string,
  sprite = "idle",
): readonly Stage[] {
  if (skin === "cat")
    return (
      CAT[motion] ?? [
        cat(
          1600,
          (sprite in CAT_FRAMES ? sprite : "idle") as keyof typeof CAT_FRAMES,
        ),
      ]
    );
  return (
    DUCK[motion] ?? [
      duck(
        1600,
        sprite === "run"
          ? "run"
          : sprite === "walk"
            ? "walk"
            : sprite === "groom"
              ? "swipe"
              : "idle",
      ),
    ]
  );
}
export function animationDuration(skin: Skin, motion: string, sprite = "idle") {
  return timeline(skin, motion, sprite).reduce((sum, s) => sum + s.duration, 0);
}
export function animationFrame(
  skin: Skin,
  motion: string,
  elapsed: number,
  sprite = "idle",
) {
  const stages = timeline(skin, motion, sprite);
  const duration = animationDuration(skin, motion, sprite);
  let offset = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) % duration;
  let stage = stages[stages.length - 1];
  for (const next of stages) {
    if (offset < next.duration) {
      stage = next;
      break;
    }
    offset -= next.duration;
  }
  const cells = stage.cells ?? CAT_FRAMES.idle;
  return {
    cell: cells[
      Math.floor((offset * (stage.fps ?? 6.25)) / 1000) % cells.length
    ],
    file: `yellow_${stage.clip ?? "idle"}_8fps.gif` as PetAsset,
    flip: stage.flip ?? false,
    pose: stage.pose ?? "",
  };
}
const IDLE = {
  cat: [
    "walk",
    "groom",
    "stretch",
    "scratch",
    "yawn",
    "pounce",
    "break",
    "sleep",
  ],
  duck: ["walk", "flap", "preen", "waddle", "dance", "swim", "break", "sleep"],
} as const;
export const idleActions = (skin: Skin) => IDLE[skin];
