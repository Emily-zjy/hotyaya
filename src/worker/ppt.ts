import PptxGenJS from "pptxgenjs";
import { deckSchema, parseJSON, type Deck } from "./schema";
import { fonts, mix, type Theme } from "./theme";

const W = 13.333,
  H = 7.5;

/** Render a validated deck to native, editable PowerPoint shapes and text in a theme-factory theme. */
export async function renderDeck(input: Deck, theme: Theme): Promise<Buffer> {
  const deck = deckSchema.parse(input);
  const f = fonts(theme);
  const t = theme;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = deck.title;
  pptx.theme = { headFontFace: f.pptHead, bodyFontFace: f.pptBody };
  const onDark = mix(t.light, "ffffff", 0.5);
  const dimOnDark = mix(t.light, t.dark, 0.35);
  const rect = (slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, color: string) =>
    slide.addShape("rect", { x, y, w, h, fill: { color }, line: { color, width: 0 } });
  const footer = (slide: PptxGenJS.Slide, n: number) => {
    slide.addText(deck.title, { x: 0.7, y: H - 0.5, w: 8, h: 0.3, fontFace: f.pptBody, fontSize: 10, color: t.muted });
    slide.addText(String(n), { x: W - 1.3, y: H - 0.5, w: 0.6, h: 0.3, fontFace: f.pptBody, fontSize: 10, color: t.muted, align: "right" });
  };
  const header = (slide: PptxGenJS.Slide, title: string, n: number) => {
    slide.background = { color: t.light };
    rect(slide, 0, 0, 0.18, H, t.accent);
    slide.addText(title, { x: 0.7, y: 0.45, w: W - 1.4, h: 0.9, fontFace: f.pptHead, fontSize: 30, bold: true, color: t.ink, valign: "middle", fit: "shrink" });
    rect(slide, 0.72, 1.38, 0.9, 0.05, t.accent2);
    footer(slide, n);
  };
  const bullets = (items: string[], size: number) =>
    items.map((text) => ({
      text,
      options: { bullet: { code: "25A0", indent: 18 }, paraSpaceAfter: size * 0.55, color: t.ink },
    }));

  // Cover: dark field, title, subtitle, one accent rule.
  const cover = pptx.addSlide();
  cover.background = { color: t.dark };
  rect(cover, 0, H - 0.22, W, 0.22, t.accent);
  rect(cover, 0.9, 2.05, 0.12, 2.2, t.accent2);
  cover.addText(deck.title, { x: 1.3, y: 1.9, w: W - 2.6, h: 1.6, fontFace: f.pptHead, fontSize: 44, bold: true, color: onDark, valign: "bottom", fit: "shrink" });
  if (deck.subtitle)
    cover.addText(deck.subtitle, { x: 1.3, y: 3.6, w: W - 3, h: 0.9, fontFace: f.pptBody, fontSize: 18, color: dimOnDark, valign: "top", fit: "shrink" });

  const slides = deck.slides.filter(
    (s, i) => !(i === 0 && s.layout === "section" && s.title === deck.title),
  );
  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    const n = i + 2;
    const cards =
      (s.layout === "cards" && s.bullets.length > 0) ||
      (s.layout === "bullets" && s.bullets.length >= 2 && s.bullets.length <= 4 && s.bullets.every((b) => b.length <= 36));
    if (s.layout === "section") {
      slide.background = { color: t.dark };
      slide.addText(String(n - 1).padStart(2, "0"), { x: 0.9, y: 1.6, w: 3, h: 1.2, fontFace: f.pptHead, fontSize: 60, bold: true, color: t.accent2 });
      slide.addText(s.title, { x: 0.9, y: 2.9, w: W - 1.8, h: 1.3, fontFace: f.pptHead, fontSize: 36, bold: true, color: onDark, fit: "shrink" });
      if (s.bullets[0])
        slide.addText(s.bullets[0], { x: 0.9, y: 4.2, w: W - 2.5, h: 0.9, fontFace: f.pptBody, fontSize: 16, color: dimOnDark, fit: "shrink" });
    } else if (cards) {
      header(slide, s.title, n);
      const items = s.bullets.slice(0, 9);
      const cols = items.length <= 4 ? 2 : 3;
      const rows = Math.ceil(items.length / cols);
      const gap = 0.28,
        cw = (W - 1.4 - gap * (cols - 1)) / cols,
        ch = Math.min(1.75, (H - 1.75 - 0.85 - gap * (rows - 1)) / rows),
        // Center the grid in the space under the title.
        top = 1.75 + (H - 1.75 - 0.85 - (rows * ch + (rows - 1) * gap)) / 2;
      items.forEach((text, k) => {
        const x = 0.7 + (k % cols) * (cw + gap),
          y = top + Math.floor(k / cols) * (ch + gap);
        rect(slide, x, y, cw, ch, t.soft);
        rect(slide, x, y, cw, 0.06, k % 2 ? t.accent2 : t.accent);
        slide.addText(text, { x: x + 0.3, y: y + 0.1, w: cw - 0.55, h: ch - 0.15, fontFace: f.pptBody, fontSize: 16, color: t.ink, valign: "middle", fit: "shrink" });
      });
    } else if (s.layout === "compare" && (s.left || s.right)) {
      header(slide, s.title, n);
      const most = Math.max(s.left?.bullets.length ?? 0, s.right?.bullets.length ?? 0);
      const boxH = Math.min(H - 2.6, 1.35 + most * 0.62);
      const top = 1.75 + (H - 2.6 - boxH) / 2;
      ([s.left, s.right] as const).forEach((side, k) => {
        if (!side) return;
        const x = 0.7 + k * 6.1,
          color = k ? t.accent2 : t.accent;
        rect(slide, x, top, 5.85, boxH, t.soft);
        rect(slide, x, top, 0.08, boxH, color);
        slide.addText(side.heading, { x: x + 0.4, y: top + 0.2, w: 5.2, h: 0.6, fontFace: f.pptHead, fontSize: 20, bold: true, color: t.ink });
        slide.addText(bullets(side.bullets, 17), { x: x + 0.4, y: top + 0.85, w: 5.2, h: boxH - 1.05, fontFace: f.pptBody, fontSize: 17, valign: "top", fit: "shrink" });
      });
    } else if (s.layout === "quote" && s.quote) {
      slide.background = { color: t.soft };
      slide.addText("“", { x: 0.9, y: 0.8, w: 1.5, h: 1.5, fontFace: "Georgia", fontSize: 120, color: t.accent });
      slide.addText(s.quote, { x: 1.6, y: 2.0, w: W - 3.2, h: 2.6, fontFace: f.pptHead, fontSize: 32, bold: true, color: t.ink, valign: "middle", fit: "shrink" });
      slide.addText(s.title, { x: 1.6, y: 4.8, w: W - 3.2, h: 0.5, fontFace: f.pptBody, fontSize: 14, color: t.muted });
      if (s.bullets.length)
        slide.addText(s.bullets.join("　"), { x: 1.6, y: 5.3, w: W - 3.2, h: 0.7, fontFace: f.pptBody, fontSize: 14, color: t.muted, fit: "shrink" });
      footer(slide, n);
    } else {
      header(slide, s.title, n);
      if (s.bullets.length >= 5 && s.bullets.every((b) => b.length <= 28)) {
        // Two columns instead of one long list hugging the left edge.
        const half = Math.ceil(s.bullets.length / 2);
        [s.bullets.slice(0, half), s.bullets.slice(half)].forEach((col, k) =>
          slide.addText(bullets(col, 20), { x: 0.75 + k * 6.1, y: 1.75, w: 5.7, h: H - 2.55, fontFace: f.pptBody, fontSize: 20, valign: "middle", fit: "shrink" }),
        );
        if (s.note) slide.addNotes(s.note);
        return;
      }
      const size = s.bullets.length <= 4 ? 24 : s.bullets.length <= 6 ? 20 : 17;
      slide.addText(bullets(s.bullets, size), { x: 0.75, y: 1.75, w: W - 1.6, h: H - 2.55, fontFace: f.pptBody, fontSize: size, valign: "middle", fit: "shrink" });
    }
    if (s.note) slide.addNotes(s.note);
  });
  const out = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(out as Uint8Array);
}
/** Accepts raw model text or an already parsed deck object. */
export function parseDeck(input: unknown): Deck {
  return deckSchema.parse(typeof input === "string" ? parseJSON(input) : input);
}
export async function exportPptx(input: unknown, theme: Theme): Promise<Buffer> {
  return renderDeck(parseDeck(input), theme);
}
