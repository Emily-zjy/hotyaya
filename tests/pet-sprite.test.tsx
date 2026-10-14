// @vitest-environment jsdom
import React from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PetSprite } from "../src/ui/PetSprite";
import { ACTIVITIES } from "../src/ui/pet-model";
import type { CompanionHost } from "../src/ui/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("keeps the Obsidian resource URL stable while the cat changes frames", () => {
  vi.useFakeTimers();
  const petAsset = vi.fn((file: string) => `app://local/${file}?${Date.now()}`);
  const host = {
    petAsset,
    petUrl: () => "/duck.gif",
  } as unknown as CompanionHost;
  render(
    <PetSprite
      skin="cat"
      size={80}
      name="团子"
      activity={ACTIVITIES.groom}
      host={host}
      reduced={false}
      visible
      fallback="idle"
    />,
  );
  const sprite = screen.getByRole("img");
  const url = sprite.style.backgroundImage;
  const position = sprite.style.backgroundPosition;
  act(() => vi.advanceTimersByTime(240));
  expect(sprite.style.backgroundPosition).not.toBe(position);
  expect(sprite.style.backgroundImage).toBe(url);
  expect(petAsset).toHaveBeenCalledTimes(1);
});
it("does not restart the duck GIF on each animation clock tick", () => {
  vi.useFakeTimers();
  const petAsset = vi.fn((file: string) => `app://local/${file}?${Date.now()}`);
  const host = {
    petAsset,
    petUrl: () => "/duck.gif",
  } as unknown as CompanionHost;
  render(
    <PetSprite
      skin="duck"
      size={80}
      name="团子"
      activity={ACTIVITIES.idle}
      host={host}
      reduced={false}
      visible
      fallback="idle"
    />,
  );
  const url = screen.getByRole("img").getAttribute("src");
  act(() => vi.advanceTimersByTime(640));
  expect(screen.getByRole("img").getAttribute("src")).toBe(url);
  expect(petAsset).toHaveBeenCalledTimes(1);
});
