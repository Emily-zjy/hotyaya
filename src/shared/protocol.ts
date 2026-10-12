export type Action =
  | "chat"
  | "comment"
  | "explain"
  | "polish"
  | "translate"
  | "table"
  | "research"
  | "image"
  | "pptx"
  | "slides"
  | "html";
export interface ModelConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  imageModel?: string;
  imageBaseUrl?: string;
  imageApiKey?: string;
  /** Optional fast model: comments, search queries and the last retry when the primary model stalls. */
  fastModel?: string;
}
export interface RunRequest {
  action: Action;
  instruction: string;
  document: { path: string; content: string; selection?: string };
  config: ModelConfig;
  history?: { role: "user" | "assistant"; content: string }[];
  targetLanguage?: "zh" | "en";
  searchUrl?: string;
  crawlUrl?: string;
  browserMcpUrl?: string;
  /** Launch a private Playwright MCP over stdio using the locally installed Chrome. */
  localChrome?: boolean;
}
export interface Artifact {
  id: string;
  name: string;
  mime: string;
  size?: number;
}
export type RunEvent =
  | {
      type: "step";
      id: string;
      label: string;
      status: "running" | "done" | "error" | "stopped";
      detail?: string;
      elapsedMs?: number;
    }
  | { type: "token"; text: string }
  /** Discard tokens streamed by an abandoned attempt before a retry. */
  | { type: "reset" }
  | { type: "artifact"; artifact: Artifact }
  | { type: "result"; text: string; editable: boolean }
  | { type: "error"; message: string }
  | { type: "done" };
export interface Health {
  version: string;
  capabilities: { skills: string[] };
  detected: {
    provider: string;
    model?: string;
    baseUrl?: string;
    hasKey: boolean;
  }[];
}
export const ACTION_LABELS: Record<Action, string> = {
  chat: "聊一聊",
  comment: "阅读建议",
  explain: "一键解读",
  polish: "自然润色",
  translate: "中英互译",
  table: "生成表格",
  research: "相关资讯",
  image: "企业配图",
  pptx: "导出 PPT",
  slides: "HTML 演示稿",
  html: "导出 HTML",
};
