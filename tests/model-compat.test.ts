import { createServer } from "node:http";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { runWorkflow } from "../src/worker/workflow";
import type { RunEvent } from "../src/shared/protocol";
async function exercise(emptyFinal = false, normalStream = false) {
  const requests: boolean[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    requests.push(body.stream === true);
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(
        "data: " +
          JSON.stringify({
            id: "fixture",
            object: "chat.completion.chunk",
            choices: [
              {
                index: 0,
                delta: normalStream
                  ? { content: "Final answer" }
                  : {
                      content: null,
                      reasoning_content: "PRIVATE_REASONING_FIXTURE",
                    },
                finish_reason: normalStream ? "stop" : "length",
              },
            ],
          }) +
          "\n\ndata: [DONE]\n\n",
      );
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "fixture",
          object: "chat.completion",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: emptyFinal ? "" : "Final answer",
              },
              finish_reason: emptyFinal ? "length" : "stop",
            },
          ],
        }),
      );
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const events: RunEvent[] = [];
  let error = "";
  try {
    await runWorkflow(
      {
        action: "explain",
        instruction: "Explain",
        document: { path: "fixture.md", content: "Test" },
        config: {
          baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
          model: "reasoning-fixture",
          apiKey: "fixture",
        },
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
  } catch (e) {
    error = (e as Error).message;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
  return { requests, events, error };
}
test("empty reasoning stream retries once without exposing reasoning as the final answer", async () => {
  const r = await exercise();
  expect(r.error).toBe("");
  expect(r.requests).toEqual([true, false]);
  expect(
    r.events.some(
      (e) =>
        e.type === "step" &&
        e.id === "response-fallback" &&
        e.status === "done",
    ),
  ).toBe(true);
  expect(
    r.events.some((e) => e.type === "result" && e.text === "Final answer"),
  ).toBe(true);
  expect(JSON.stringify(r.events)).not.toContain("PRIVATE_REASONING_FIXTURE");
});
test("both empty responses stop after one fallback and explain the length failure", async () => {
  const r = await exercise(true);
  expect(r.requests).toEqual([true, false]);
  expect(r.error).toContain("length");
  expect(r.error).toContain("正文");
  expect(r.events.some((e) => e.type === "result")).toBe(false);
});
test("a normal streamed answer makes only one model request", async () => {
  const r = await exercise(false, true);
  expect(r.requests).toEqual([true]);
  expect(r.error).toBe("");
});
