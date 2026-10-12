import { spawn, type ChildProcess } from "node:child_process";
import { request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type {
  RunRequest,
  RunEvent,
  Health,
  Artifact,
} from "../shared/protocol";
import { EventDecoder } from "./stream";
import { resolveNodeExecutable } from "./runtime";

/** Desktop-only transport; Node HTTP avoids renderer CORS and supports cancellation. */
export class WorkerClient {
  private child?: ChildProcess;
  private port?: number;
  private token = randomBytes(32).toString("hex");
  private starting?: Promise<void>;
  constructor(private directory: string) {}
  async start(): Promise<void> {
    if (this.port) return;
    if (this.starting) return this.starting;
    this.starting = new Promise<void>((resolve, reject) => {
      const child = spawn(
        resolveNodeExecutable(),
        [path.join(this.directory, "worker.cjs")],
        {
          cwd: this.directory,
          windowsHide: true,
          env: {
            ...process.env,
            MD_COMPANION_TOKEN: this.token,
            MD_COMPANION_PORT: "0",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      this.child = child;
      let buffer = "",
        settled = false;
      const timer = setTimeout(() => {
        child.kill();
        fail(new Error("本地执行器启动超时。"));
      }, 30_000);
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      };
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          try {
            const message = JSON.parse(line);
            if (
              message.type === "ready" &&
              Number.isInteger(message.port) &&
              message.port > 0
            ) {
              this.port = message.port;
              settled = true;
              clearTimeout(timer);
              resolve();
            }
          } catch {
            /* Ignore non-protocol diagnostics; never echo environment or keys. */
          }
        }
      });
      child.stderr?.resume();
      child.on("error", (error: NodeJS.ErrnoException) =>
        fail(
          new Error(
            error.code === "ENOENT"
              ? "未找到 Node.js。请安装 Node.js 22 或更新版本并重启 Obsidian；自定义位置可设置 MD_COMPANION_NODE。"
              : `无法启动 Node.js 执行器（${error.code || "未知错误"}）。请检查安装目录和权限。`,
          ),
        ),
      );
      child.on("exit", (code) => {
        if (this.child === child) {
          this.port = undefined;
          this.starting = undefined;
        }
        fail(
          new Error(
            `Node.js 执行器已退出（退出码 ${code ?? "被终止"}）。请使用 Node.js 22 或更新版本，并检查 worker.cjs 是否完整。`,
          ),
        );
      });
    }).catch((error) => {
      this.starting = undefined;
      throw error;
    });
    return this.starting;
  }
  async health(): Promise<Health> {
    return JSON.parse(
      (await this.request("/health")).toString("utf8"),
    ) as Health;
  }
  async artifact(artifact: Artifact): Promise<Buffer> {
    return this.request(`/artifacts/${encodeURIComponent(artifact.id)}`);
  }
  private async request(route: string): Promise<Buffer> {
    await this.start();
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port: this.port,
          path: route,
          headers: { Authorization: `Bearer ${this.token}` },
          timeout: 30_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (c: Buffer) => {
            size += c.length;
            if (size > 100_000_000) req.destroy(new Error("文件超过 100 MB。"));
            else chunks.push(c);
          });
          res.on("end", () => {
            if (res.statusCode !== 200)
              reject(new Error(`执行器请求失败 (${res.statusCode})`));
            else resolve(Buffer.concat(chunks));
          });
          res.on("error", reject);
        },
      );
      req.on("timeout", () => req.destroy(new Error("执行器请求超时。")));
      req.on("error", reject);
      req.end();
    });
  }
  async run(
    input: RunRequest,
    emit: (event: RunEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    await this.start();
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      let done = false;
      const decoder = new EventDecoder((event) => {
        if (event.type === "done") done = true;
        emit(event);
      });
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port: this.port,
          path: "/run",
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          signal,
          timeout: 600_000,
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(
              new Error(`任务请求失败 (${res.statusCode})，请检查模型设置。`),
            );
            return;
          }
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            try {
              decoder.feed(chunk);
            } catch (error) {
              req.destroy(error as Error);
            }
          });
          res.on("end", () =>
            done
              ? resolve()
              : reject(new Error("连接提前断开，可重试此任务。")),
          );
          res.on("error", reject);
        },
      );
      req.on("timeout", () =>
        req.destroy(new Error("任务超时，请缩小选区后重试。")),
      );
      req.on("error", reject);
      req.end(JSON.stringify(input));
    });
  }
  stop(): void {
    this.child?.kill();
    this.child = undefined;
    this.port = undefined;
    this.starting = undefined;
  }
}
