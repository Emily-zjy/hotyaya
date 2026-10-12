import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { RunRequest } from "../shared/protocol";
/**
 * Reference excerpts per action. Only sections that guide the output itself are sent;
 * interactive/CLI procedure text is dropped because it only adds prompt latency.
 */
interface Ref {
  file: string;
  sections?: string[];
  max: number;
}
const refs: Partial<Record<RunRequest["action"], Ref[]>> = {
  polish: [{ file: "humanizer-zh/SKILL.md", max: 9000 }],
  translate: [{ file: "baoyu-translate/SKILL.md", max: 6000 }],
  // Planning only needs the type/style catalog; the style spec is added to the image prompt in code.
  image: [
    { file: "baoyu-article-illustrator/SKILL.md", sections: ["Three Dimensions", "Types"], max: 2500 },
    { file: "baoyu-article-illustrator/references/styles.md", sections: ["Core Styles", "Style Gallery"], max: 4000 },
  ],
  // Visual actions return a content plan; layout and styling are rendered from the
  // theme-factory themes, frontend-design principles and frontend-slides stage rules in code.
  pptx: [
    { file: "theme-factory/SKILL.md", sections: ["Purpose", "Themes Available"], max: 2000 },
  ],
  slides: [
    { file: "theme-factory/SKILL.md", sections: ["Purpose", "Themes Available"], max: 2000 },
    { file: "frontend-slides/SKILL.md", sections: ["Content Density Modes"], max: 2500 },
  ],
  html: [
    { file: "theme-factory/SKILL.md", sections: ["Purpose", "Themes Available"], max: 2000 },
  ],
  explain: [{ file: "fabric/explain_docs/system.md", max: 3000 }],
  comment: [{ file: "fabric/summarize/system.md", max: 1500 }],
};
function excerpt(text: string, ref: Ref) {
  let body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
  if (ref.sections) {
    const parts = body.split(/(?=^#{2,3} )/m);
    body = parts
      .filter((p) => ref.sections!.some((s) => p.startsWith(`## ${s}`) || p.startsWith(`### ${s}`)))
      .join("");
  }
  return body.trim().slice(0, ref.max);
}
export async function skillPrompt(root: string, request: RunRequest) {
  const english = request.action === "polish" && !/[\u3400-\u9fff]/.test(request.document.selection || request.document.content);
  const list = english
    ? [{ file: "humanizer/SKILL.md", max: 9000 }]
    : (refs[request.action] ?? []);
  let out = "";
  for (const ref of list) {
    try {
      out += `\nREFERENCE: ${ref.file}\n${excerpt(await readFile(join(root, ref.file), "utf8"), ref)}`;
    } catch {
      throw new Error(`Required vendored skill unavailable: ${ref.file}`);
    }
  }
  return out;
}
export async function installedSkills(root: string) {
  const candidates = [
    "theme-factory",
    "frontend-design",
    "frontend-slides",
    "humanizer",
    "humanizer-zh",
    "fabric",
    "baoyu-translate",
    "baoyu-article-illustrator",
    "baoyu-image-gen",
    "baoyu-markdown-to-html",
    "baoyu-format-markdown",
  ];
  return (
    await Promise.all(
      candidates.map(async (n) => {
        try {
          await access(join(root, n));
          return n;
        } catch {
          return "";
        }
      }),
    )
  ).filter(Boolean);
}
