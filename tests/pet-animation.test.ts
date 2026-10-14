import { expect, it } from "vitest";
import {
  animationFrame,
  animationDuration,
  idleActions,
} from "../src/ui/pet-animation";
it("uses yawning then sleeping poses instead of sliding the idle cat", () => {
  expect(animationFrame("cat", "cat-yawn", 0).cell).toEqual([3, 2]);
  expect(animationFrame("cat", "cat-yawn", 1800).cell).toEqual([2, 0]);
});
it("duck actions use different upstream clips and ordered stages", () => {
  expect(animationFrame("duck", "duck-flap", 0).file).toBe(
    "yellow_swipe_8fps.gif",
  );
  expect(animationFrame("duck", "duck-waddle", 0).file).toBe(
    "yellow_walk_8fps.gif",
  );
  expect(animationFrame("duck", "duck-dance", 1200).file).toBe(
    "yellow_run_8fps.gif",
  );
  expect(animationFrame("duck", "chase", 2000).file).toBe(
    "yellow_with_ball_8fps.gif",
  );
});
it("cat pounces out and returns with matching direction and loops safely", () => {
  expect(animationFrame("cat", "cat-pounce", 0).cell).toEqual([7, 3]);
  expect(animationFrame("cat", "cat-pounce", 1000).cell).toEqual([1, 0]);
  expect(animationFrame("cat", "cat-pounce", 2600).cell).toEqual([5, 1]);
  expect(
    animationFrame("cat", "cat-pounce", animationDuration("cat", "cat-pounce")),
  ).toEqual(animationFrame("cat", "cat-pounce", 0));
});
it("idle pools suit each species and every action has a finite timeline", () => {
  expect(idleActions("cat")).toContain("yawn");
  expect(idleActions("duck")).toContain("preen");
  expect(idleActions("cat")).not.toContain("swim");
  for (const skin of ["cat", "duck"] as const)
    for (const motion of [
      "cat-yawn",
      "cat-stretch",
      "cat-scratch",
      "cat-pounce",
      "duck-flap",
      "duck-preen",
      "duck-waddle",
      "duck-dance",
      "duck-swim",
      "nibble",
      "sleep",
      "breathe",
    ]) {
      expect(animationDuration(skin, motion)).toBeGreaterThan(0);
      expect(animationFrame(skin, motion, 0)).toBeTruthy();
    }
});
