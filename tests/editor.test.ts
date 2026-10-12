import { describe, it, expect } from "vitest";
import { makeEdit, canUndo, validateSnapshot } from "../src/plugin/edits";

describe("editor snapshots", () => {
  const snapshot = {
    path: "Notes/a.md",
    content: "# Note\nhello world",
    from: 7,
    to: 12,
  };
  it("replaces only the captured range and preserves surrounding markdown", () => {
    expect(makeEdit(snapshot, snapshot.path, snapshot.content, "你好")).toEqual(
      { from: 7, to: 12, text: "你好" },
    );
  });
  it("still replaces the selection after unrelated typing elsewhere in the note", () => {
    expect(
      makeEdit(snapshot, snapshot.path, "# Note title\nhello world!", "你好"),
    ).toEqual({ from: 13, to: 18, text: "你好" });
  });
  it("rejects an edit when the selected text itself was changed", () => {
    expect(() =>
      makeEdit(snapshot, snapshot.path, "# Note\nhowdy world", "你好"),
    ).toThrow(/已被修改/);
  });
  it("rejects an edit when the original text became ambiguous", () => {
    expect(() =>
      makeEdit(snapshot, snapshot.path, "hello # Note\nhello there", "你好"),
    ).toThrow(/多次/);
  });
  it("still refuses to replace a whole note that changed meanwhile", () => {
    const whole = { ...snapshot, from: 0, to: snapshot.content.length };
    expect(() => makeEdit(whole, whole.path, snapshot.content + "!", "x")).toThrow(
      /已变化/,
    );
  });
  it("rejects an edit after switching to a different note with identical content", () => {
    expect(() =>
      validateSnapshot(snapshot, "Notes/b.md", snapshot.content),
    ).toThrow(/切换/);
  });
  it("rejects invalid selection offsets instead of corrupting the note", () => {
    expect(() =>
      makeEdit({ ...snapshot, to: 900 }, snapshot.path, snapshot.content, "x"),
    ).toThrow();
  });
  it("only offers one-step undo while the applied document is unchanged", () => {
    expect(canUndo({ path: "a.md", after: "new" }, "a.md", "new")).toBe(true);
    expect(canUndo({ path: "a.md", after: "new" }, "a.md", "new typing")).toBe(
      false,
    );
    expect(canUndo({ path: "a.md", after: "new" }, "b.md", "new")).toBe(false);
  });
});
