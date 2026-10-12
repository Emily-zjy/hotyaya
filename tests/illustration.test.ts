import { createServer } from "node:http";
import { resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { buildPrompt, compatible, planSchema, requestImage } from "../src/worker/illustration";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((done) => s.close(() => done()));
  }
});
const plan = planSchema.parse({
  type: "framework",
  style: "blueprint",
  title: "路由决策",
  idea: "A decision tree routes each request to Workflow, RAG or Agent.",
  layout: "Top-down tree, root at top, three leaves at the bottom.",
  elements: [
    { label: "Workflow", visual: "a conveyor belt icon on the left leaf" },
    { label: "RAG", visual: "a magnifier over documents on the middle leaf" },
    { label: "Agent", visual: "a robot with tool icons on the right leaf" },
  ],
  people: false,
});
test("the image prompt always carries the chosen style spec, composition rules and exact labels", async () => {
  const { prompt, style } = await buildPrompt(plan, resolve("vendor/skills"), "Simplified Chinese");
  expect(style).toBe("blueprint");
  expect(prompt).toContain("STYLE SPECIFICATION (blueprint)");
  expect(prompt).toMatch(/Design Aesthetic/);
  expect(prompt).toContain("generous white space");
  expect(prompt).toContain("do NOT display color names, hex codes");
  expect(prompt).toContain('"Workflow", "RAG", "Agent"');
  expect(prompt).toContain("ASPECT: 3:2 landscape");
});
test("incompatible type × style pairs fall back to a compatible style from the skill matrix", () => {
  expect(compatible("scene", "blueprint")).toBe("warm");
  expect(compatible("flowchart", "watercolor")).toBe("sketch-notes");
  expect(compatible("comparison", "elegant")).toBe("elegant");
});
test("a sloppy plan is normalized instead of failing", () => {
  const p = planSchema.parse({ type: "poster", style: "oil", idea: "x", elements: [{ visual: "a" }, { visual: "b" }, { visual: "c" }, { visual: "d" }, { visual: "e" }, { visual: "f" }] });
  expect(p.type).toBe("infographic");
  expect(p.style).toBe("vector-illustration");
  expect(p.elements).toHaveLength(5);
});
async function provider(handler: (body: any, n: number) => [number, unknown]) {
  const bodies: any[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    bodies.push(JSON.parse(raw));
    const [status, json] = handler(bodies.at(-1), bodies.length);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(json));
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { url: `http://127.0.0.1:${(server.address() as any).port}/v1/images/generations`, bodies };
}
test("requests a high-quality landscape image and downgrades parameters a gateway rejects", async () => {
  const p = await provider((body) =>
    body.quality ? [400, { error: { message: "Invalid value for quality" } }] : [200, { data: [{ b64_json: "AA==" }] }],
  );
  const notes: string[] = [];
  const out = await requestImage({ url: p.url, key: "k", model: "gpt-image-2" }, "prompt", new AbortController().signal, (d) => notes.push(d));
  expect(out.data[0].b64_json).toBe("AA==");
  expect(p.bodies[0]).toMatchObject({ model: "gpt-image-2", size: "1536x1024", quality: "high" });
  expect(p.bodies[1]).toMatchObject({ size: "1536x1024" });
  expect(p.bodies[1].quality).toBeUndefined();
  expect(notes).toHaveLength(1);
});
test("server errors retry at most twice and then report the provider message", async () => {
  const p = await provider(() => [503, { error: { message: "upstream busy" } }]);
  await expect(
    requestImage({ url: p.url, key: "k", model: "m" }, "prompt", new AbortController().signal),
  ).rejects.toThrow(/HTTP 503：upstream busy/);
  expect(p.bodies).toHaveLength(3);
}, 20000);
test("authentication errors are not retried", async () => {
  const p = await provider(() => [401, { error: { message: "bad key" } }]);
  await expect(
    requestImage({ url: p.url, key: "k", model: "m" }, "prompt", new AbortController().signal),
  ).rejects.toThrow(/401/);
  expect(p.bodies).toHaveLength(1);
});
