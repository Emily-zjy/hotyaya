import { it, expect } from "vitest";
import { EventDecoder } from "../src/plugin/stream";
it("preserves split SSE frames and multiple events per chunk", () => {
  const seen: unknown[] = [];
  const decoder = new EventDecoder((e) => seen.push(e));
  decoder.feed('data: {"type":"token","text":"你');
  decoder.feed('好"}\r\n\r\ndata: {"type":"done"}\n\n');
  expect(seen).toEqual([{ type: "token", text: "你好" }, { type: "done" }]);
});
it("surfaces malformed events instead of quietly reporting success", () => {
  const decoder = new EventDecoder(() => {});
  expect(() => decoder.feed("data: invalid\n\n")).toThrow();
});
