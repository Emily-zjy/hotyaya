import { createServer, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { runWorkflow } from "../src/worker/workflow";
import { DEFAULT_POLICY } from "../src/worker/model";
import type { RunEvent, RunRequest } from "../src/shared/protocol";
// Generous enough that a loaded machine never mistakes a healthy local reply for a stall.
const policy = { ...DEFAULT_POLICY, firstChunkMs: 1500, idleMs: 1500, attemptMs: 15000, backoffMs: 10 };
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((done) => s.close(() => done()));
  }
});
const chunk = (res: ServerResponse, content: string) =>
  res.write(
    "data: " +
      JSON.stringify({ id: "f", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content }, finish_reason: null }] }) +
      "\n\n",
  );
/** Each behaviour handles one request in order: "hang" | "partial-hang" | "500" | "ok". */
async function gateway(behaviours: string[]) {
  const models: string[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    models.push(JSON.parse(raw).model);
    const b = behaviours[models.length - 1] ?? "ok";
    if (b === "500") {
      res.writeHead(500);
      res.end("{}");
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (b === "hang") return;
    if (b === "partial-hang") {
      chunk(res, "半截");
      return;
    }
    chunk(res, "完整回答");
    res.end("data: [DONE]\n\n");
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { base: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, models };
}
async function run(base: string, config: Partial<RunRequest["config"]> = {}) {
  const events: RunEvent[] = [];
  let error = "";
  const started = Date.now();
  try {
    await runWorkflow(
      {
        action: "explain",
        instruction: "",
        document: { path: "a.md", content: "内容" },
        config: { baseUrl: base, model: "primary", apiKey: "k", ...config },
      },
      { skillRoot: resolve("vendor/skills"), env: {}, signal: new AbortController().signal, emit: (e) => events.push(e), artifact: () => { throw new Error("no"); }, policy },
    );
  } catch (e) {
    error = (e as Error).message;
  }
  return { events, error, ms: Date.now() - started };
}
test("a silent upstream is abandoned and retried instead of hanging", async () => {
  const g = await gateway(["hang", "ok"]);
  const r = await run(g.base);
  expect(r.error).toBe("");
  expect(g.models).toEqual(["primary", "primary"]);
  expect(r.events.some((e) => e.type === "step" && e.id === "retry-1")).toBe(true);
  expect(r.events.some((e) => e.type === "result" && e.text === "完整回答")).toBe(true);
  expect(r.ms).toBeLessThan(8000);
});
test("partial output from a stalled attempt is reset before the retry streams", async () => {
  const g = await gateway(["partial-hang", "ok"]);
  const r = await run(g.base);
  const kinds = r.events.filter((e) => e.type === "token" || e.type === "reset").map((e) => (e.type === "token" ? e.text : "RESET"));
  expect(kinds).toEqual(["半截", "RESET", "完整回答"]);
});
test("server errors are retried and the configured fast model serves the last attempt", async () => {
  const g = await gateway(["500", "hang", "ok"]);
  const r = await run(g.base, { fastModel: "fast" });
  expect(r.error).toBe("");
  expect(g.models).toEqual(["primary", "primary", "fast"]);
});
test("attempts are bounded and the final error explains the stall", async () => {
  const g = await gateway(["hang", "hang", "hang", "ok"]);
  const r = await run(g.base);
  expect(g.models).toHaveLength(3);
  expect(r.error).toContain("连续 3 次没有响应");
  expect(r.events.some((e) => e.type === "result")).toBe(false);
});
test("client errors such as a bad key are not retried", async () => {
  const server = createServer((req, res) => {
    req.resume();
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "invalid key" } }));
  });
  servers.push(server);
  let hits = 0;
  server.on("request", () => hits++);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const r = await run(`http://127.0.0.1:${(server.address() as { port: number }).port}/v1`);
  expect(hits).toBe(1);
  expect(r.error).not.toBe("");
});
