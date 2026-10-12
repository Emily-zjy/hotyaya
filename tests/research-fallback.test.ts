import { createServer } from "node:http";
import { resolve } from "node:path";
import { expect, test, vi } from "vitest";
vi.mock("../src/worker/research-services", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/worker/research-services")>();
  return {
    ...original,
    openSession: vi.fn(async () => {
      throw new Error("MCP 服务无法连接");
    }),
    readPage: vi.fn(),
  };
});
import { runWorkflow } from "../src/worker/workflow";
import { openSession, readPage } from "../src/worker/research-services";
import type { RunEvent } from "../src/shared/protocol";
test("browser outage keeps verified search sources, stops repeated crawling and discloses snippet fallback", async () => {
  let retrieved: any[] = [];
  let query = "";
  const server = createServer(async (req, res) => {
    if (req.url?.startsWith("/search")) {
      query = new URL(req.url, "http://x").searchParams.get("q") ?? "";
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          results: [1, 2, 3].map((n) => ({
            title: "Source " + n,
            url: "https://example.org/" + n,
            content: "Actual search snippet about the test topic",
          })),
        }),
      );
      return;
    }
    let raw = "";
    for await (const part of req) raw += part;
    const input = JSON.parse(raw);
    const last = JSON.parse(input.messages.at(-1).content);
    const answer =
      last.sources === undefined
        ? JSON.stringify({ kind: "学习笔记", queries: ["test topic 教程"], keywords: ["test topic"] })
        : "Summary from retrieved snippets";
    if (last.sources !== undefined) retrieved = JSON.parse(last.sources);
    res.setHeader("content-type", "text/event-stream");
    res.end(
      "data: " +
        JSON.stringify({
          id: "fixture",
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta: { content: answer },
              finish_reason: "stop",
            },
          ],
        }) +
        "\n\ndata: [DONE]\n\n",
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const events: RunEvent[] = [];
  try {
    await runWorkflow(
      {
        action: "research",
        instruction: "Test topic",
        document: { path: "fixture.md", content: "Test" },
        config: { baseUrl: base, model: "fixture", apiKey: "fixture" },
        searchUrl: base,
        browserMcpUrl: "http://localhost:8933/mcp",
      },
      {
        skillRoot: resolve("vendor/skills"),
        env: {},
        signal: new AbortController().signal,
        emit: (e) => events.push(e),
        artifact: () => {
          throw new Error("Unexpected artifact");
        },
      },
    );
    expect(openSession).toHaveBeenCalledOnce();
    expect(readPage).not.toHaveBeenCalled();
    expect(query).toBe("test topic 教程");
    expect(retrieved).toHaveLength(3);
    expect(retrieved.every((s) => s.retrieval === "search-snippet")).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === "result" &&
          e.text.includes("未完成正文核验") &&
          e.text.includes("https://example.org/1"),
      ),
    ).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
