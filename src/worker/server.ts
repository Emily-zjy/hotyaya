import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import type { Artifact, RunEvent, Health } from "../shared/protocol";
import { requestSchema } from "./schema";
import { installedSkills } from "./skills";
import { runWorkflow } from "./workflow";
export interface WorkerOptions {
  token: string;
  port?: number;
  host?: "127.0.0.1";
  skillRoot?: string;
  env?: NodeJS.ProcessEnv;
}
async function body(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function sanitized(
  message: string,
  env: NodeJS.ProcessEnv,
  keys: string[] = [],
) {
  for (const key of [
    ...keys,
    env.OPENAI_API_KEY,
    env.LITELLM_API_KEY,
    env.OPENAI_IMAGE_API_KEY,
  ].filter(Boolean) as string[])
    message = message.split(key).join("[redacted]");
  return message.slice(0, 1800);
}
function publicURL(value?: string) {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    u.username = "";
    u.password = "";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return undefined;
  }
}
export async function createWorkerServer(options: WorkerOptions) {
  if (!options.token) throw new Error("MD_COMPANION_TOKEN is required");
  if (options.host && options.host !== "127.0.0.1")
    throw new Error("Worker binds loopback only");
  const env = options.env ?? process.env;
  const skillRoot =
    options.skillRoot ??
    join(
      typeof __dirname === "string" &&
        !/[/\\\\]src[/\\\\]worker$/.test(__dirname)
        ? __dirname
        : process.cwd(),
      "vendor",
      "skills",
    );
  const artifacts = new Map<
    string,
    { meta: Artifact; data: Buffer; created: number }
  >();
  let totalBytes = 0;
  const active = new Set<AbortController>();
  const token = Buffer.from("Bearer " + options.token);
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    const authorization = Buffer.from(req.headers.authorization ?? "");
    if (
      authorization.length !== token.length ||
      !timingSafeEqual(authorization, token)
    ) {
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }
    // Browser origins are never authorized to operate this local service.
    if (req.headers.origin) {
      res.writeHead(403);
      res.end("Browser-origin requests are not allowed");
      return;
    }
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    if (req.method === "GET" && path === "/health") {
      const detected: Health["detected"] = [];
      if (env.OPENAI_API_KEY || env.OPENAI_BASE_URL || env.OPENAI_MODEL)
        detected.push({
          provider: "OpenAI compatible",
          model: env.OPENAI_MODEL,
          baseUrl: publicURL(env.OPENAI_BASE_URL),
          hasKey: Boolean(env.OPENAI_API_KEY),
        });
      if (env.LITELLM_BASE_URL || env.LITELLM_API_KEY)
        detected.push({
          provider: "LiteLLM",
          baseUrl: publicURL(env.LITELLM_BASE_URL),
          hasKey: Boolean(env.LITELLM_API_KEY),
        });
      const health: Health = {
        version: "0.2.0",
        capabilities: { skills: await installedSkills(skillRoot) },
        detected,
      };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(health));
      return;
    }
    if (req.method === "GET" && path.startsWith("/artifacts/")) {
      const item = artifacts.get(path.slice("/artifacts/".length));
      if (!item) {
        res.writeHead(404);
        res.end("Artifact not found");
        return;
      }
      res.setHeader("Content-Type", item.meta.mime);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(item.meta.name)}`,
      );
      res.end(item.data);
      return;
    }
    if (req.method !== "POST" || path !== "/run") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let parsed;
    try {
      parsed = requestSchema.parse(await body(req));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or oversized run request" }));
      return;
    }
    if (active.size >= 4) {
      res.writeHead(429);
      res.end("Too many active runs");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    const controller = new AbortController();
    active.add(controller);
    const timeout = setTimeout(
      () => controller.abort(new Error("Run exceeded 10 minute limit")),
      600_000,
    );
    const disconnect = () => controller.abort();
    res.on("close", disconnect);
    const emit = (event: RunEvent) => {
      if (!res.destroyed && !res.writableEnded)
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const artifact = (name: string, mime: string, data: Buffer) => {
      if (data.length > 50_000_000)
        throw new Error("Artifact exceeds 50 MB limit");
      for (const [id, item] of artifacts) {
        if (
          Date.now() - item.created > 3_600_000 ||
          totalBytes + data.length > 100_000_000
        ) {
          artifacts.delete(id);
          totalBytes -= item.data.length;
        }
      }
      const meta = { id: randomUUID(), name, mime, size: data.length };
      artifacts.set(meta.id, { meta, data, created: Date.now() });
      totalBytes += data.length;
      return meta;
    };
    try {
      await runWorkflow(parsed, {
        skillRoot,
        env,
        signal: controller.signal,
        emit,
        artifact,
      });
    } catch (error) {
      if (!res.destroyed)
        emit({
          type: "error",
          message: sanitized(
            error instanceof Error ? error.message : "Worker operation failed",
            env,
            [parsed.config.apiKey ?? "", parsed.config.imageApiKey ?? ""],
          ),
        });
    } finally {
      clearTimeout(timeout);
      active.delete(controller);
      res.off("close", disconnect);
      emit({ type: "done" });
      res.end();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", accept);
  });
  const port = (server.address() as { port: number }).port;
  return {
    server,
    port,
    close: async () => {
      for (const controller of active) controller.abort();
      artifacts.clear();
      await new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      });
    },
  };
}
const launched =
  process.argv[1] &&
  (/[/\\]worker\.cjs$/.test(process.argv[1]) ||
    /[/\\]src[/\\]worker[/\\]server\.ts$/.test(resolve(process.argv[1])));
if (launched) {
  createWorkerServer({
    token: process.env.MD_COMPANION_TOKEN ?? "",
    port: Number(process.env.MD_COMPANION_PORT ?? 0),
  })
    .then((worker) => {
      process.stdout.write(
        JSON.stringify({ type: "ready", port: worker.port }) + "\n",
      );
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.on(
          signal,
          () => void worker.close().then(() => process.exit(0)),
        );
    })
    .catch((error) => {
      process.stderr.write(String(error.message) + "\n");
      process.exitCode = 1;
    });
}


