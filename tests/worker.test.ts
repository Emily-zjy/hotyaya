import { afterEach, expect, test } from "vitest";
import { createServer } from "node:http";
import { createWorkerServer } from "../src/worker/server";
const cleanups: (() => Promise<void>)[] = [];
test("selecting a normalized LiteLLM root URL retains its own environment key", async () => {
  let authorization = "";
  const model = createServer((req, res) => {
    authorization = req.headers.authorization ?? "";
    req.resume();
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(
      "data: " +
        JSON.stringify({
          id: "fixture",
          object: "chat.completion.chunk",
          choices: [
            { index: 0, delta: { content: "OK" }, finish_reason: null },
          ],
        }) +
        "\n\ndata: [DONE]\n\n",
    );
  });
  await new Promise<void>((done) => model.listen(0, "127.0.0.1", done));
  cleanups.push(
    () =>
      new Promise((done) => {
        model.closeAllConnections();
        model.close(() => done());
      }),
  );
  const base = `http://127.0.0.1:${(model.address() as { port: number }).port}`;
  const worker = await createWorkerServer({
    token: "normalized",
    env: {
      LITELLM_BASE_URL: base,
      LITELLM_API_KEY: "litellm-fixture",
      OPENAI_API_KEY: "different-key",
    },
  });
  cleanups.push(worker.close);
  const response = await fetch(`http://127.0.0.1:${worker.port}/run`, {
    method: "POST",
    headers: {
      Authorization: "Bearer normalized",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "explain",
      instruction: "",
      document: { path: "a.md", content: "Hello" },
      config: { baseUrl: base + "/", model: "fixture" },
    }),
  });
  const output = await response.text();
  expect(output).toContain('"type":"result"');
  expect(authorization).toBe("Bearer litellm-fixture");
});
test("streamed steps expose meaningful source and model details", async () => {
  const s = await setup();
  const response = await fetch(s.base + "/run", {
    method: "POST",
    headers: s.headers,
    body: JSON.stringify(s.body),
  });
  const events = (await response.text())
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)));
  expect(
    events.some((e) => e.type === "step" && e.detail?.includes("note.md")),
  ).toBe(true);
  expect(
    events.some((e) => e.type === "step" && e.detail?.includes("fixture")),
  ).toBe(true);
});
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
async function setup(output = "Hello from fixture", slow = false) {
  const model = createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "content-type": "text/event-stream" });
    let index = 0;
    const parts = slow ? ["first", ...Array(200).fill(" later")] : [output];
    const timer = setInterval(
      () => {
        if (index === parts.length) {
          clearInterval(timer);
          res.end("data: [DONE]\n\n");
          return;
        }
        res.write(
          `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: parts[index++] }, finish_reason: null }] })}\n\n`,
        );
      },
      slow ? 30 : 5,
    );
    res.on("close", () => clearInterval(timer));
  });
  await new Promise<void>((resolve) => model.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise((resolve) => {
        model.closeAllConnections();
        model.close(() => resolve());
      }),
  );
  const worker = await createWorkerServer({ token: "test-token", port: 0 });
  cleanups.push(worker.close);
  const base = `http://127.0.0.1:${worker.port}`;
  const body = {
    action: "explain",
    instruction: "Explain",
    document: { path: "note.md", content: "test" },
    config: {
      model: "fixture",
      apiKey: "fixture-key",
      baseUrl: `http://127.0.0.1:${(model.address() as any).port}/v1`,
    },
  };
  return {
    base,
    body,
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
  };
}
test("rejects unauthenticated requests and invalid payloads", async () => {
  const s = await setup();
  expect((await fetch(s.base + "/health")).status).toBe(401);
  expect(
    (
      await fetch(s.base + "/run", {
        method: "POST",
        headers: s.headers,
        body: "{}",
      })
    ).status,
  ).toBe(400);
});
test("streams actual HTTP model output with completed steps", async () => {
  const s = await setup();
  const response = await fetch(s.base + "/run", {
    method: "POST",
    headers: s.headers,
    body: JSON.stringify(s.body),
  });
  const stream = await response.text();
  expect(stream).toContain("Hello from fixture");
  expect(stream).toContain('"type":"result"');
  expect(stream).toContain('"elapsedMs":');
  expect(stream).toContain('"type":"done"');
});
test("rejects invalid table schema without successful result", async () => {
  const s = await setup('{"columns":[],"rows":"bad"}');
  s.body.action = "table";
  const stream = await (
    await fetch(s.base + "/run", {
      method: "POST",
      headers: s.headers,
      body: JSON.stringify(s.body),
    })
  ).text();
  expect(stream).toContain('"type":"error"');
  expect(stream).not.toContain('"type":"result"');
});
test("disconnect aborts model streaming and server remains usable", async () => {
  const s = await setup("ignored", true);
  const controller = new AbortController();
  const response = await fetch(s.base + "/run", {
    method: "POST",
    headers: s.headers,
    body: JSON.stringify(s.body),
    signal: controller.signal,
  });
  const reader = response.body!.getReader();
  let data = "";
  while (!data.includes("first"))
    data += new TextDecoder().decode((await reader.read()).value);
  controller.abort();
  await expect(reader.read()).rejects.toThrow();
  expect((await fetch(s.base + "/health", { headers: s.headers })).status).toBe(
    200,
  );
});
test("health never discloses environment secrets", async () => {
  const worker = await createWorkerServer({
    token: "abc",
    env: { OPENAI_API_KEY: "top-secret", OPENAI_MODEL: "test" },
  });
  cleanups.push(worker.close);
  const text = await (
    await fetch(`http://127.0.0.1:${worker.port}/health`, {
      headers: { Authorization: "Bearer abc" },
    })
  ).text();
  expect(text).not.toContain("top-secret");
  expect(text).toContain("hasKey");
});
test("exports HTML through an authenticated artifact registry", async () => {
  const s = await setup('{"theme":"ocean-depths","summary":"Fixture summary"}');
  s.body.action = "html";
  s.body.document = { path: "note.md", content: "# Real HTML\n\n## Part\n\nBody <script>alert(1)</script> text" };
  const stream = await (
    await fetch(s.base + "/run", {
      method: "POST",
      headers: s.headers,
      body: JSON.stringify(s.body),
    })
  ).text();
  const events = stream
    .split("\n")
    .filter((v) => v.startsWith("data: "))
    .map((v) => JSON.parse(v.slice(6)));
  const artifact = events.find((v) => v.type === "artifact")?.artifact;
  expect(artifact?.name).toBe("article.html");
  expect((await fetch(s.base + "/artifacts/" + artifact.id)).status).toBe(401);
  const html = await (
    await fetch(s.base + "/artifacts/" + artifact.id, { headers: s.headers })
  ).text();
  expect(html).toMatch(/^<!DOCTYPE html>/);
  expect(html).toContain("<h1>Real HTML</h1>");
  expect(html).toContain("Fixture summary");
  expect(html).toContain("--dark:#1a2332");
  expect(html).not.toContain("<script>alert");
});
test("renders validated table with escaped cells", async () => {
  const s = await setup('{"columns":["A","B"],"rows":[["x|y","z"]]}');
  s.body.action = "table";
  const stream = await (
    await fetch(s.base + "/run", {
      method: "POST",
      headers: s.headers,
      body: JSON.stringify(s.body),
    })
  ).text();
  expect(stream).toContain("x\\\\|y");
  expect(stream).toContain('"editable":true');
});
test("missing research service emits explicit failure", async () => {
  const s = await setup();
  s.body.action = "research";
  const stream = await (
    await fetch(s.base + "/run", {
      method: "POST",
      headers: s.headers,
      body: JSON.stringify(s.body),
    })
  ).text();
  expect(stream).toContain("SearXNG");
  expect(stream).not.toContain('"type":"result"');
});
test("health strips credentials from environment base URLs", async () => {
  const worker = await createWorkerServer({
    token: "abc",
    env: {
      OPENAI_BASE_URL: "https://user:secret@example.com/v1?api_key=hidden",
      OPENAI_API_KEY: "secret",
    },
  });
  cleanups.push(worker.close);
  const health = await (
    await fetch(`http://127.0.0.1:${worker.port}/health`, {
      headers: { Authorization: "Bearer abc" },
    })
  ).text();
  expect(health).not.toContain("secret");
  expect(health).not.toContain("hidden");
});
test("research uses actual SearXNG result URLs", async () => {
  const service = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        results: [
          {
            title: "Fixture source about the test note",
            url: "https://example.org/real-source",
            content: "Verified fixture fact",
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise((resolve) => {
        service.closeAllConnections();
        service.close(() => resolve());
      }),
  );
  const s = await setup("Finding [source](https://example.org/real-source)");
  s.body.action = "research";
  const input = {
    ...s.body,
    searchUrl: `http://127.0.0.1:${(service.address() as any).port}`,
  };
  const stream = await (
    await fetch(s.base + "/run", {
      method: "POST",
      headers: s.headers,
      body: JSON.stringify(input),
    })
  ).text();
  expect(stream).toContain("https://example.org/real-source");
  expect(stream).toContain('"type":"result"');
});
test("image provider data becomes downloadable artifact", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6JmQAAAAASUVORK5CYII=",
    "base64",
  );
  const service = createServer((req, res) => {
    req.resume();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }));
  });
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise((resolve) => {
        service.closeAllConnections();
        service.close(() => resolve());
      }),
  );
  const s = await setup('{"type":"flowchart","style":"blueprint","idea":"A request flows through routing","elements":[{"label":"路由","visual":"a junction box"}]}');
  s.body.action = "image";
  const input = {
    ...s.body,
    config: {
      ...s.body.config,
      imageModel: "fixture-image",
      imageBaseUrl: `http://127.0.0.1:${(service.address() as any).port}/v1`,
    },
  };
  const stream = await (
    await fetch(s.base + "/run", {
      method: "POST",
      headers: s.headers,
      body: JSON.stringify(input),
    })
  ).text();
  const events = stream
    .split("\n")
    .filter((v) => v.startsWith("data: "))
    .map((v) => JSON.parse(v.slice(6)));
  const artifact = events.find((v) => v.type === "artifact")?.artifact;
  expect(artifact?.mime).toBe("image/png");
  const data = Buffer.from(
    await (
      await fetch(s.base + "/artifacts/" + artifact.id, { headers: s.headers })
    ).arrayBuffer(),
  );
  expect(data.equals(png)).toBe(true);
});
test("research refuses model citations absent from retrieved sources", async () => {
  const service = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        results: [
          {
            title: "Actual test note source",
            url: "https://example.org/actual",
            content: "Fact",
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise((resolve) => {
        service.closeAllConnections();
        service.close(() => resolve());
      }),
  );
  const s = await setup("Claim [fake](https://invented.example/fake)");
  s.body.action = "research";
  const input = {
    ...s.body,
    searchUrl: `http://127.0.0.1:${(service.address() as any).port}`,
  };
  const stream = await (
    await fetch(s.base + "/run", {
      method: "POST",
      headers: s.headers,
      body: JSON.stringify(input),
    })
  ).text();
  expect(stream).toContain('"type":"error"');
  expect(stream).not.toContain('"type":"result"');
});
test("invalid image bytes cannot be presented as successful image generation", async () => {
  const service = createServer((req, res) => {
    req.resume();
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        data: [{ b64_json: Buffer.from("not an image").toString("base64") }],
      }),
    );
  });
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise((resolve) => {
        service.closeAllConnections();
        service.close(() => resolve());
      }),
  );
  const s = await setup('{"type":"flowchart","style":"blueprint","idea":"A request flows through routing","elements":[{"label":"路由","visual":"a junction box"}]}');
  s.body.action = "image";
  const input = {
    ...s.body,
    config: {
      ...s.body.config,
      imageModel: "fixture-image",
      imageBaseUrl: `http://127.0.0.1:${(service.address() as any).port}/v1`,
    },
  };
  const stream = await (
    await fetch(s.base + "/run", {
      method: "POST",
      headers: s.headers,
      body: JSON.stringify(input),
    })
  ).text();
  expect(stream).toContain('"type":"error"');
  expect(stream).not.toContain('"type":"artifact"');
});
