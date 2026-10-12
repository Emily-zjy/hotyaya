import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class ServiceLane {
  private tail: Promise<unknown> = Promise.resolve();
  private next = 0;
  constructor(private interval: number) {}
  run<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    const task = this.tail
      .catch(() => {})
      .then(async () => {
        signal.throwIfAborted();
        const delay = this.next - Date.now();
        if (delay > 0)
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal.reason);
            };
            const timer = setTimeout(() => {
              signal.removeEventListener("abort", abort);
              resolve();
            }, delay);
            signal.addEventListener("abort", abort, { once: true });
          });
        signal.throwIfAborted();
        try {
          return await fn();
        } finally {
          this.next = Date.now() + this.interval;
        }
      });
    this.tail = task.catch(() => {});
    return task;
  }
}
const lanes = new Map<string, ServiceLane>();
export function serviceLane(key: string, interval: number) {
  if (!lanes.has(key)) lanes.set(key, new ServiceLane(interval));
  return lanes.get(key)!;
}
type ToolResult = { isError?: boolean; content?: unknown };
export type Session = {
  call: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  close: () => Promise<void>;
};
async function connect(
  client: Client,
  transport: Parameters<Client["connect"]>[0],
  signal: AbortSignal,
  timeout: number,
): Promise<Session> {
  try {
    await client.connect(transport, { signal, timeout });
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
  return {
    call: async (name, args) =>
      (await client.callTool({ name, arguments: args }, undefined, {
        signal,
        timeout: 45000,
      })) as ToolResult,
    close: async () => {
      if (transport instanceof StreamableHTTPClientTransport)
        await transport.terminateSession().catch(() => {});
      await client.close();
    },
  };
}
export async function openSession(
  endpoint: string,
  signal: AbortSignal,
): Promise<Session> {
  const client = new Client({ name: "hotyaya-reader", version: "0.2.0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { signal },
  });
  return connect(client, transport, signal, 15000);
}
/** Pinned so every machine runs the same reviewed reader. */
export const PLAYWRIGHT_MCP = "@playwright/mcp@0.0.83";
function npxCommand(): { command: string; args: string[] } {
  const bin = dirname(process.execPath);
  for (const cli of [
    join(bin, "node_modules", "npm", "bin", "npx-cli.js"),
    join(bin, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ])
    if (existsSync(cli)) return { command: process.execPath, args: [cli] };
  return { command: process.platform === "win32" ? "npx.cmd" : "npx", args: [] };
}
/**
 * Private headless Playwright MCP over stdio using the locally installed Chrome.
 * --isolated uses a throwaway profile: no cookies or logins from the user's browser.
 */
export async function openLocalChromeSession(
  signal: AbortSignal,
): Promise<Session> {
  const npx = npxCommand();
  const transport = new StdioClientTransport({
    command: npx.command,
    args: [
      ...npx.args,
      "-y",
      PLAYWRIGHT_MCP,
      "--browser",
      process.env.MD_COMPANION_BROWSER || "chrome",
      "--headless",
      "--isolated",
      "--output-dir",
      join(tmpdir(), "md-companion-playwright"),
    ],
    stderr: "ignore",
  });
  const client = new Client({ name: "hotyaya-reader", version: "0.2.0" });
  // First launch may download the pinned package from npm.
  return connect(client, transport, signal, 120000);
}
function toolText(result: ToolResult) {
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
  if (result.isError || /^### Error/m.test(text)) {
    if (
      /not installed|expected executable|executable.*doesn.t exist|chromium distribution .* is not found/i.test(
        text,
      )
    )
      throw new Error(
        "Playwright MCP 找不到浏览器。本机抓取需要安装 Google Chrome；远程服务需维护者安装浏览器。",
      );
    throw new Error("Playwright MCP 未能读取网页，本次将使用搜索摘要。");
  }
  return text;
}
/** Read one page in its own tab of an already opened session. */
export async function readPage(
  session: Session,
  url: string,
): Promise<string> {
  if (!["http:", "https:"].includes(new URL(url).protocol))
    throw new Error("Unsupported page URL");
  let index: number | undefined;
  try {
    const opened = toolText(
      await session.call("browser_tabs", { action: "new" }),
    );
    const current = opened.match(/(?:^|\n)\s*-?\s*(\d+):[^\n]*\(current\)/);
    if (!current)
      throw new Error(
        "MCP 未返回新标签页标识，已停止读取以避免操作其他标签页。",
      );
    index = Number(current[1]);
    toolText(await session.call("browser_navigate", { url }));
    const snapshot = toolText(await session.call("browser_snapshot", {}));
    const marker = snapshot.match(/### (?:Snapshot|Page snapshot)\s*\n/i);
    if (!marker || marker.index === undefined)
      throw new Error("MCP 未返回网页快照，本次将使用搜索摘要。");
    const body = snapshot
      .slice(marker.index + marker[0].length)
      .replace(/^```(?:yaml)?\s*/, "")
      .replace(/\s*```[\s\S]*$/, "")
      .replace(/ \[(?:ref|cursor)=[^\]]*\]/g, "")
      .trim();
    if (!body) throw new Error("网页正文为空，本次将使用搜索摘要。");
    return body.slice(0, 12000);
  } finally {
    if (index !== undefined)
      await session
        .call("browser_tabs", { action: "close", index })
        .catch(() => {});
  }
}
export async function readPlaywrightPage(
  endpoint: string,
  url: string,
  signal: AbortSignal,
  factory = openSession,
): Promise<string> {
  if (!["http:", "https:"].includes(new URL(url).protocol))
    throw new Error("Unsupported page URL");
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
  const session = await factory(endpoint, bounded);
  try {
    return await readPage(session, url);
  } finally {
    await session.close().catch(() => {});
  }
}
