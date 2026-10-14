import React, { useEffect, useState } from "react";
import type { Activity } from "./pet-model";
import type { CompanionHost } from "./types";
import { animationFrame, type Skin } from "./pet-animation";

/** Owns its frame clock so animation never rerenders the home form or diary. */
export function PetSprite({
  skin,
  size,
  name,
  activity,
  host,
  reduced,
  visible,
  fallback,
}: {
  skin: Skin;
  size: number;
  name: string;
  activity: Activity;
  host: CompanionHost;
  reduced: boolean;
  visible: boolean;
  fallback: Parameters<CompanionHost["petUrl"]>[0];
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (reduced || !visible) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 80);
    return () => clearInterval(timer);
  }, [skin, activity.motion, activity.sprite, reduced, visible]);
  const frame = animationFrame(
    skin,
    activity.motion,
    reduced ? 0 : elapsed,
    activity.sprite,
  );
  const label = `${name}：${activity.label}`;
  return (
    <span className={`mdc-pet-body pose-${frame.pose}`} data-pose={frame.pose}>
      {skin === "cat" && host.petAsset ? (
        <span
          className="mdc-neko"
          role="img"
          aria-label={label}
          style={{
            width: size,
            height: size,
            backgroundImage: `url("${host.petAsset("oneko.gif")}")`,
            backgroundSize: `${size * 8}px ${size * 4}px`,
            backgroundPosition: `${-frame.cell[0] * size}px ${-frame.cell[1] * size}px`,
          }}
        />
      ) : (
        <img
          key={frame.file}
          src={
            reduced
              ? (host.petAsset?.("icon.png") ?? host.petUrl("idle"))
              : (host.petAsset?.(frame.file) ?? host.petUrl(fallback))
          }
          style={{ transform: frame.flip ? "scaleX(-1)" : undefined }}
          alt={label}
          draggable={false}
        />
      )}
    </span>
  );
}
