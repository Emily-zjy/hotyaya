import { expect, test, vi } from "vitest";
import {
  readPlaywrightPage,
  ServiceLane,
} from "../src/worker/research-services";
test("MCP reader uses its own tab and returns only the requested page snapshot", async () => {
  const calls: any[] = [];
  const close = vi.fn(async () => {});
  const factory = async () => ({
    close,
    call: async (name: string, args: any) => {
      calls.push([name, args]);
      return {
        content: [
          {
            type: "text",
            text:
              name === "browser_tabs" && args.action === "new"
                ? "- 3: (current) [blank](about:blank)"
                : name === "browser_snapshot"
                  ? '### Open tabs\nPRIVATE_OTHER_TAB\n### Snapshot\n```yaml\n- heading "Public page"\n- paragraph: Content\n```'
                  : "OK",
          },
        ],
      };
    },
  });
  const text = await readPlaywrightPage(
    "http://localhost:8933/mcp",
    "https://example.org",
    new AbortController().signal,
    factory,
  );
  expect(text).toContain("Public page");
  expect(text).not.toContain("PRIVATE_OTHER_TAB");
  expect(calls.at(-1)).toEqual(["browser_tabs", { action: "close", index: 3 }]);
  expect(close).toHaveBeenCalledOnce();
});
test("missing server browser produces an actionable error instead of fabricated page content", async () => {
  const close = vi.fn(async () => {});
  const factory = async () => ({
    close,
    call: async () => ({
      isError: true,
      content: [
        {
          type: "text",
          text: "Browser chrome is not installed; expected executable at /server/chrome",
        },
      ],
    }),
  });
  await expect(
    readPlaywrightPage(
      "http://localhost:8933/mcp",
      "https://example.org",
      new AbortController().signal,
      factory,
    ),
  ).rejects.toThrow("找不到浏览器");
  expect(close).toHaveBeenCalledOnce();
});
test("shared service lane serializes requests and waits at least three seconds after completion", async () => {
  vi.useFakeTimers();
  try {
    const lane = new ServiceLane(3000);
    const calls: number[] = [];
    const signal = new AbortController().signal;
    const a = lane.run(signal, async () => {
      calls.push(Date.now());
    });
    const b = lane.run(signal, async () => {
      calls.push(Date.now());
    });
    await a;
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await b;
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(3000);
  } finally {
    vi.useRealTimers();
  }
});
