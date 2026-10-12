import { expect, test } from "vitest";
import JSZip from "jszip";
import { exportPptx } from "../src/worker/ppt";
import { loadThemes, pickTheme } from "../src/worker/theme";
import { resolve } from "node:path";
const theme = pickTheme(loadThemes(resolve("vendor/skills")), "ocean-depths");
test("exports native editable PPTX text without Python", async () => {
  const data = await exportPptx(
    "好的，下面是结构：\n" +
      JSON.stringify({
        title: "第 8 周 · 综合评审方法",
        subtitle: "把前 7 周串起来",
        slides: [
          { layout: "bullets", title: "Native editable slide", bullets: ["Real export pipeline", "Structured safe content"], note: "讲者备注" },
          { layout: "cards", title: "八个问题", bullets: ["用户是谁？", "任务是什么？", "数据从哪里来？"] },
          { layout: "compare", title: "对比", left: { heading: "不信", bullets: ["没引用"] }, right: { heading: "可信", bullets: ["有来源"] } },
          { layout: "quote", title: "金句", quote: "可信不是语气问题，是证据链问题。" },
          { layout: "unknown-layout", title: "未知版式回退", bullets: ["仍然可用"] },
        ],
      }),
    theme,
  );
  expect(data.subarray(0, 2).toString()).toBe("PK");
  const zip = await JSZip.loadAsync(data);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slides).toHaveLength(6);
  const all = (await Promise.all(slides.map((f) => zip.file(f)!.async("string")))).join("");
  expect(all).toContain("<a:t>Native editable slide</a:t>");
  expect(all).toContain("可信不是语气问题");
  expect(all).toContain("未知版式回退");
});
test("rejects a prose answer instead of producing an empty deck", async () => {
  await expect(exportPptx("本轮只收到文档引用句", theme)).rejects.toThrow();
});
