import { createServer } from "node:http";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { WorkerClient } from "../src/plugin/worker-client";
import type { RunEvent } from "../src/shared/protocol";
const fixture = createServer((req, res) => {
  req.resume();
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.end(
    "data: " +
      JSON.stringify({
        id: "smoke",
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: { content: "Packaged worker OK" },
            finish_reason: null,
          },
        ],
      }) +
      "\n\ndata: [DONE]\n\n",
  );
});
await new Promise<void>((done) => fixture.listen(0, "127.0.0.1", done));
if (process.env.MD_COMPANION_TEST_HOST)
  Object.defineProperty(process, "execPath", {
    value: process.env.MD_COMPANION_TEST_HOST,
  });
const client = new WorkerClient(
  resolve(process.argv[2] || "dist/md-companion"),
  () =>
    resolve(
      process.platform === "win32"
        ? ".venv/Scripts/python.exe"
        : ".venv/bin/python",
    ),
);
try {
  const health = await client.health();
  assert.equal(health.version, "0.1.3");
  assert.ok(health.capabilities.skills.length);
  const events: RunEvent[] = [];
  await client.run(
    {
      action: "explain",
      instruction: "Explain",
      document: { path: "smoke.md", content: "Fixture content" },
      config: {
        baseUrl: `http://127.0.0.1:${(fixture.address() as { port: number }).port}/v1`,
        model: "fixture",
        apiKey: "local-fixture",
      },
    },
    (event) => events.push(event),
    new AbortController().signal,
  );
  assert.ok(
    events.some((e) => e.type === "result" && e.text === "Packaged worker OK"),
  );
  assert.ok(events.some((e) => e.type === "done"));
  assert.ok(!events.some((e) => e.type === "error"));
  console.log(
    "Packaged worker: startup, health, vendored skills, streamed model fixture, result and shutdown PASS",
  );
} finally {
  client.stop();
  fixture.closeAllConnections();
  await new Promise<void>((done) => fixture.close(() => done()));
}

