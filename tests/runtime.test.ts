import { expect, test } from "vitest";
import { resolveNodeExecutable } from "../src/plugin/runtime";
test("Obsidian executable is never used as a Node worker runtime", () => {
  expect(
    resolveNodeExecutable(
      "D:/obsidian/Obsidian.exe",
      { ProgramFiles: "C:/Program Files" },
      "win32",
      (p) => p === "C:/Program Files/nodejs/node.exe",
    ),
  ).toBe("C:/Program Files/nodejs/node.exe");
});
test("resolves Node from PATH even when the GUI was launched outside a terminal", () => {
  expect(
    resolveNodeExecutable(
      "D:/obsidian/Obsidian.exe",
      { PATH: "D:/tools;D:/node" },
      "win32",
      (p) => p === "D:/node/node.exe",
    ),
  ).toBe("D:/node/node.exe");
});
test("preserves an explicit Node override and falls back to node for missing installations", () => {
  expect(
    resolveNodeExecutable(
      "Obsidian.exe",
      { MD_COMPANION_NODE: "D:/custom/node.exe" },
      "win32",
      () => false,
    ),
  ).toBe("D:/custom/node.exe");
  expect(resolveNodeExecutable("Obsidian.exe", {}, "win32", () => false)).toBe(
    "node",
  );
});
