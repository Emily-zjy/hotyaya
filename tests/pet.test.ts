import { describe, expect, it } from "vitest";
import { normalizePet, interact, activityForAction } from "../src/ui/pet-model";
describe("pet memories", () => {
  it("preserves a completed focus deadline until the UI records it", () => {
    expect(normalizePet({ focusUntil: 1000 }, 2000).focusUntil).toBe(1000);
    expect(
      normalizePet({ focusUntil: Infinity }, 2000).focusUntil,
    ).toBeUndefined();
  });
  it("migrates old settings and rejects malformed saved data", () => {
    expect(normalizePet(undefined, 1000).name).toBe("hotyaya");
    const pet = normalizePet(
      {
        name: "  团子  ",
        size: 999,
        bond: -10,
        skin: "unknown",
        position: { x: NaN, y: 2 },
        diary: "oops",
      },
      1000,
    );
    expect(pet.name).toBe("团子");
    expect(pet.size).toBe(96);
    expect(pet.skin).toBe("cat");
    expect(pet.position).toBeUndefined();
    expect(pet.diary).toEqual([]);
    expect(pet.bond).toBe(0);
  });
  it("keeps bounded memories and never punishes absence", () => {
    let pet = normalizePet(undefined, 1000);
    for (let i = 0; i < 25; i++) pet = interact(pet, "feed", 2000 + i * 60000);
    expect(pet.diary).toHaveLength(20);
    expect(pet.bond).toBeLessThanOrEqual(100);
    expect(normalizePet(pet, 999999999).bond).toBe(pet.bond);
    expect(interact(pet, "feed", 2000 + 24 * 60000).bond).toBe(pet.bond);
  });
  it("maps every existing workflow to an explicit activity", () => {
    for (const action of [
      "chat",
      "comment",
      "explain",
      "polish",
      "translate",
      "table",
      "research",
      "image",
      "pptx",
      "slides",
      "html",
    ] as const) {
      expect(activityForAction(action).label.length).toBeGreaterThan(0);
      expect(activityForAction(action).prop.length).toBeGreaterThan(0);
    }
    expect(activityForAction("image").prop).not.toBe(
      activityForAction("research").prop,
    );
  });
});
