import React, { useEffect, useMemo, useState } from "react";
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
  const file =
    skin === "cat" && host.petAsset
      ? "oneko.gif"
      : reduced
        ? "icon.png"
        : frame.file;
  const fallbackState = reduced ? "idle" : fallback;
  // Obsidian may append Date.now() for files inside .obsidian/plugins. Resolve
  // once per asset, otherwise each frame reloads the atlas or restarts the GIF.
  const assetUrl = useMemo(
    () => host.petAsset?.(file) ?? host.petUrl(fallbackState),
    [host.petAsset, host.petUrl, file, fallbackState],
  );
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
            backgroundImage: `url("${assetUrl}")`,
            backgroundSize: `${size * 8}px ${size * 4}px`,
            backgroundPosition: `${-frame.cell[0] * size}px ${-frame.cell[1] * size}px`,
          }}
        />
      ) : (
        <img
          key={frame.file}
          src={assetUrl}
          style={{ transform: frame.flip ? "scaleX(-1)" : undefined }}
          alt={label}
          draggable={false}
        />
      )}
    </span>
  );
}
