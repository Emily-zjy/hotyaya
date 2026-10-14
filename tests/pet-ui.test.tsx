// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { PetCompanion } from "../src/ui/PetCompanion";
import type { CompanionHost } from "../src/ui/types";
import { normalizePet } from "../src/ui/pet-model";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("offers separate cat and duck actions and immediately reveals each animation", () => {
  const { props, getSaved } = setup();
  render(<PetCompanion {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
  fireEvent.click(screen.getByRole("button", { name: "扑蝴蝶" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("button", { name: "打开hotyaya" }).dataset.activity,
  ).toBe("cat-pounce");
  expect(getSaved().diary[0].text).toContain("蝴蝶");
  fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
  fireEvent.change(screen.getByLabelText("形象"), {
    target: { value: "duck" },
  });
  expect(screen.queryByRole("button", { name: "扑蝴蝶" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "拍拍翅膀" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("img", { name: /hotyaya：/ }).getAttribute("src"),
  ).toBe("/assets/yellow_swipe_8fps.gif");
});

it("restarting a manual action replays its opening pose", () => {
  vi.useFakeTimers();
  const { props } = setup();
  render(<PetCompanion {...props} />);
  const pounce = () => {
    fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
    fireEvent.click(screen.getByRole("button", { name: "扑蝴蝶" }));
  };
  pounce();
  const first = screen
    .getByRole("img", { name: /hotyaya：/ })
    .getAttribute("style");
  act(() => vi.advanceTimersByTime(1100));
  expect(
    screen.getByRole("img", { name: /hotyaya：/ }).getAttribute("style"),
  ).not.toBe(first);
  pounce();
  expect(
    screen.getByRole("img", { name: /hotyaya：/ }).getAttribute("style"),
  ).toBe(first);
});
function setup(overrides = {}) {
  let saved = normalizePet();
  const save = vi.fn((next) => {
    saved = next;
  });
  const host = {
    pet: { load: () => saved, save },
    petAsset: (file: string) => `/assets/${file}`,
    petUrl: () => "/duck.gif",
  } as unknown as CompanionHost;
  const props = {
    host,
    running: false,
    action: "chat" as const,
    reading: false,
    outcome: "idle" as const,
    comment: "陪你读书",
    quiet: false,
    onChat: vi.fn(),
    open: false,
    ...overrides,
  };
  return { props, save, getSaved: () => saved };
}
it("renames, feeds and restores memories after remount", () => {
  const { props, getSaved } = setup();
  const view = render(<PetCompanion {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
  fireEvent.change(screen.getByLabelText("给伙伴取个名字"), {
    target: { value: "团子" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByRole("button", { name: "打开团子" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "喂点心" }));
  expect(screen.queryByRole("dialog", { name: "宠物小窝" })).toBeNull();
  expect(getSaved().diary[0].text).toContain("点心");
  expect(
    screen.getByRole("button", { name: "打开团子" }).dataset.activity,
  ).toBe("nibble");
  view.unmount();
  render(<PetCompanion {...props} />);
  expect(screen.getByRole("button", { name: "打开团子" })).toBeTruthy();
});
it("prioritizes AI work over idle or manual actions and returns to idle", () => {
  const { props } = setup();
  const view = render(<PetCompanion {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
  fireEvent.click(screen.getByRole("button", { name: "打个盹" }));
  expect(
    screen.getByRole("button", { name: "打开hotyaya" }).dataset.activity,
  ).toBe("sleep");
  view.rerender(<PetCompanion {...props} running action="image" />);
  expect(
    screen.getByRole("button", { name: "打开hotyaya" }).dataset.activity,
  ).toBe("paint");
  fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
  expect(
    (screen.getByRole("button", { name: "喂点心" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  view.rerender(<PetCompanion {...props} />);
  expect(
    screen.getByRole("button", { name: "打开hotyaya" }).dataset.activity,
  ).toBe("breathe");
});
it("quiet mode suppresses unsolicited bubbles and Escape dismisses the home", () => {
  const { props } = setup({ quiet: true });
  render(<PetCompanion {...props} />);
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "宠物互动" }),
  );
});
it("finishes focus once and cleans up every animation and activity timer", () => {
  vi.useFakeTimers();
  const { props, getSaved } = setup();
  const view = render(<PetCompanion {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
  fireEvent.click(screen.getByRole("button", { name: "一起专注" }));
  expect(getSaved().focusUntil).toBeTruthy();
  act(() => vi.advanceTimersByTime(25 * 60000));
  expect(getSaved().focusUntil).toBeUndefined();
  expect(
    getSaved().diary.filter((e) => e.text.includes("完成了一段")),
  ).toHaveLength(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("a deliberate interaction replaces a recent celebration", () => {
  const { props } = setup();
  render(<PetCompanion {...props} outcome="success" />);
  fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
  fireEvent.click(screen.getByRole("button", { name: "摸摸" }));
  expect(
    screen.getByRole("button", { name: "打开hotyaya" }).dataset.activity,
  ).toBe("love");
});

it("the home's chat action does not close an already open conversation", () => {
  const { props } = setup({ open: true });
  render(<PetCompanion {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
  fireEvent.click(screen.getByRole("button", { name: "和hotyaya聊聊天" }));
  expect(props.onChat).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("reduced-motion uses a static sprite even during play", () => {
  vi.useFakeTimers();
  const original = window.matchMedia;
  window.matchMedia = vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  try {
    const { props } = setup();
    render(<PetCompanion {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "宠物互动" }));
    fireEvent.click(screen.getByRole("button", { name: "抛球" }));
    const sprite = screen.getByRole("img", { name: /hotyaya：/ });
    const before = sprite.getAttribute("style");
    act(() => vi.advanceTimersByTime(1000));
    expect(sprite.getAttribute("style")).toBe(before);
    expect(
      screen.getByRole("button", { name: "打开hotyaya" }).className,
    ).toContain("is-still");
  } finally {
    window.matchMedia = original;
  }
});
