import { ChatOpenAI } from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";

/**
 * Upstream gateways sometimes accept a request and then go silent without failing.
 * Healthy streams deliver their first (reasoning or answer) delta within ~2 s and never
 * pause for more than ~1 s, so a long silence is treated as a stall and retried.
 */
export interface RetryPolicy {
  attempts: number;
  /** No delta of any kind (headers, reasoning or answer) within this window. */
  firstChunkMs: number;
  /** Silence between two deltas. */
  idleMs: number;
  /** Hard cap for one attempt. */
  attemptMs: number;
  backoffMs: number;
}
export const DEFAULT_POLICY: RetryPolicy = {
  attempts: 3,
  firstChunkMs: 30_000,
  idleMs: 30_000,
  attemptMs: 300_000,
  backoffMs: 800,
};
export class ModelStallError extends Error {}
export interface ModelTarget {
  model: string;
  apiKey: string;
  baseURL: string;
}
export interface StreamHooks {
  token?: (text: string) => void;
  /** Called at most every 1.5 s while the model streams reasoning. */
  thinking?: (reasoningChars: number) => void;
}
export function answerText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (v) =>
        v &&
        (v.type === "text" || v.type === "output_text") &&
        typeof v.text === "string",
    )
    .map((v) => v.text)
    .join("");
}
export function finishReason(value: unknown): string {
  return typeof value === "string" &&
    [
      "stop",
      "length",
      "tool_calls",
      "function_call",
      "content_filter",
    ].includes(value)
    ? value
    : "未提供";
}
function statusOf(error: unknown): number | undefined {
  const e = error as { status?: unknown; response?: { status?: unknown } };
  const status = e?.status ?? e?.response?.status;
  return typeof status === "number" ? status : undefined;
}
export function retryable(error: unknown): boolean {
  if (error instanceof ModelStallError) return true;
  const status = statusOf(error);
  if (status !== undefined)
    return [408, 409, 425, 429].includes(status) || status >= 500;
  const message = error instanceof Error ? error.message : String(error);
  return /network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket|fetch failed|terminated|premature|timed? ?out|Connection error/i.test(
    message,
  );
}
export function describeFailure(error: unknown): string {
  if (error instanceof ModelStallError) return error.message;
  const status = statusOf(error);
  const message = error instanceof Error ? error.message : String(error);
  return status ? `HTTP ${status}` : message.slice(0, 160);
}
function retryAfter(error: unknown): number {
  const headers = (error as { headers?: Record<string, string> })?.headers;
  const value = Number(headers?.["retry-after"]);
  return Number.isFinite(value) && value > 0 ? Math.min(value * 1000, 10_000) : 0;
}
export function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export interface AttemptResult {
  text: string;
  finish: string;
  sawReasoning: boolean;
  sawRefusal: boolean;
}
/** One streamed request guarded by first-chunk, idle and total watchdogs. */
export async function streamOnce(
  target: ModelTarget,
  messages: BaseMessage[],
  signal: AbortSignal,
  hooks: StreamHooks,
  policy: RetryPolicy,
  json = false,
): Promise<AttemptResult> {
  const watchdog = new AbortController();
  const combined = AbortSignal.any([signal, watchdog.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number, reason: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => watchdog.abort(new ModelStallError(reason)), ms);
  };
  arm(
    policy.firstChunkMs,
    `${Math.round(policy.firstChunkMs / 1000)} 秒内没有收到模型响应`,
  );
  const hard = setTimeout(
    () =>
      watchdog.abort(
        new ModelStallError(
          `单次生成超过 ${Math.round(policy.attemptMs / 1000)} 秒`,
        ),
      ),
    policy.attemptMs,
  );
  const result: AttemptResult = {
    text: "",
    finish: "未提供",
    sawReasoning: false,
    sawRefusal: false,
  };
  let reasoningChars = 0,
    lastThinking = 0;
  try {
    const model = new ChatOpenAI({
      model: target.model,
      apiKey: target.apiKey,
      configuration: { baseURL: target.baseURL },
      streaming: true,
      maxRetries: 0,
      timeout: policy.attemptMs,
    });
    const stream = await model.stream(messages, {
      signal: combined,
      ...(json ? { response_format: { type: "json_object" as const } } : {}),
    });
    for await (const chunk of stream) {
      arm(
        policy.idleMs,
        `模型输出中断超过 ${Math.round(policy.idleMs / 1000)} 秒`,
      );
      combined.throwIfAborted();
      const token = answerText(chunk.content);
      if (chunk.response_metadata?.finish_reason)
        result.finish = finishReason(chunk.response_metadata.finish_reason);
      const reasoning =
        chunk.additional_kwargs?.reasoning_content ??
        chunk.additional_kwargs?.reasoning;
      if (reasoning) {
        result.sawReasoning = true;
        reasoningChars +=
          typeof reasoning === "string" ? reasoning.length : 1;
        if (hooks.thinking && Date.now() - lastThinking > 1500) {
          lastThinking = Date.now();
          hooks.thinking(reasoningChars);
        }
      }
      result.sawRefusal ||= Boolean(chunk.additional_kwargs?.refusal);
      if (!token) continue;
      result.text += token;
      if (result.text.length > 2_000_000)
        throw new Error("Model output exceeded limit");
      hooks.token?.(token);
    }
    return result;
  } catch (error) {
    if (!signal.aborted && watchdog.signal.aborted) throw watchdog.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    clearTimeout(hard);
  }
}
/** Non-streaming request for gateways that stream reasoning but no answer body. */
export async function invokeOnce(
  target: ModelTarget,
  messages: BaseMessage[],
  signal: AbortSignal,
  policy: RetryPolicy,
) {
  const result = await new ChatOpenAI({
    model: target.model,
    apiKey: target.apiKey,
    configuration: { baseURL: target.baseURL },
    streaming: false,
    maxRetries: 0,
    timeout: policy.attemptMs,
  }).invoke(messages, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(policy.attemptMs)]),
  });
  return {
    text: answerText(result.content),
    finish: finishReason(result.response_metadata?.finish_reason),
  };
}
export function backoff(attempt: number, policy: RetryPolicy, error: unknown) {
  return Math.max(
    retryAfter(error),
    policy.backoffMs * 2 ** attempt + Math.floor(Math.random() * 250),
  );
}
