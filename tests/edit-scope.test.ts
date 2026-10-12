import { createServer } from "node:http";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { runWorkflow } from "../src/worker/workflow";
async function capture(request: any) {
  let body: any;
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    body = JSON.parse(raw);
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(
      `data: ${JSON.stringify({ id: "f", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "改好的文字" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    await runWorkflow(
      {
        ...request,
        config: {
          baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
          model: "m",
          apiKey: "k",
        },
      },
      {
        skillRoot: resolve("vendor/skills"),
        env: {},
        signal: new AbortController().signal,
        emit: () => {},
        artifact: () => {
          throw new Error("no");
        },
      },
    ).catch(() => {});
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
  return body.messages as { role: string; content: string }[];
}
const previous = [
  { role: "user", content: "中英互译" },
  {
    role: "assistant",
    content: "Smarter isn't better — what fits the task is better.",
  },
];
test("polishing Chinese right after an English translation stays Chinese and ignores that history", async () => {
  const messages = await capture({
    action: "polish",
    instruction: "",
    document: { path: "a.md", content: "全文", selection: "这是一段需要润色的中文。" },
    history: previous,
  });
  expect(messages).toHaveLength(2);
  expect(JSON.stringify(messages)).not.toContain("Smarter isn't better");
  expect(messages[0].content).toContain("Target language: zh");
});
test("polish switches language only when explicitly asked", async () => {
  const messages = await capture({
    action: "polish",
    instruction: "润色成英文",
    document: { path: "a.md", content: "中文内容" },
  });
  expect(messages[0].content).toContain("Target language: en");
});
test("tool actions such as HTML slides never see the previous answers", async () => {
  for (const action of ["slides", "html", "pptx", "table", "translate", "explain"]) {
    const messages = await capture({
      action,
      instruction: "",
      document: { path: "a.md", content: "# 第 8 周\n内容" },
      history: previous,
    });
    expect(messages, action).toHaveLength(2);
    expect(JSON.stringify(messages), action).not.toContain("Smarter isn't better");
  }
});
test("free chat keeps conversation history", async () => {
  const messages = await capture({
    action: "chat",
    instruction: "接着说",
    document: { path: "a.md", content: "内容" },
    history: previous,
  });
  expect(JSON.stringify(messages)).toContain("Smarter isn't better");
});
