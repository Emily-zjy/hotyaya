import { expect, test } from "vitest";
import { rankSources } from "../src/worker/workflow";
test("keeps on-topic results and drops portals, redirect wrappers, mojibake and duplicates", () => {
  const results = [
    { title: "AI工具集官网 | 1000+ AI工具导航", url: "https://ai-bot.cn/", content: "AI 工具" },
    { title: "ReAct vs Workflow：谁更适合你的 Agent 系统", url: "https://blog.example.com/a", content: "RAG 与 Agent 选型" },
    { title: "ReAct vs Workflow：谁更适合你的 Agent 系统", url: "https://blog.example.com/a#x", content: "dup" },
    { title: "C6驾驶证_百度百科", url: "https://baike.baidu.com/item/C6", content: "驾驶" },
    { title: "企业 RAG 权限过滤实践", url: "http://www.baidu.com/link?url=abc", content: "RAG 权限" },
    { title: "ReAct Agent %D3%EB Workflow", url: "https://x.example/b", content: "Agent" },
    { title: "企业级 RAG 落地：权限与密级过滤", url: "https://blog.example.com/c", content: "Workflow" },
  ];
  const ranked = rankSources(results, ["RAG", "Workflow", "Agent", "权限", "AI"]);
  expect(ranked.map((r) => r.url)).toEqual(["https://blog.example.com/a", "https://blog.example.com/c"]);
});
