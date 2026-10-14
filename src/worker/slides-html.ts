import { deckSchema, type Deck } from "./schema";
import { fonts, mix, type Theme } from "./theme";
import { deckDesign, prepareSlides } from "./export-design";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const list = (items: string[]) =>
  `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`;

/**
 * Standalone HTML deck in a theme-factory theme, following frontend-slides' fixed 16:9
 * stage rule: a 1920×1080 canvas scaled as a whole, keyboard/click/touch navigation,
 * no network requests.
 */
export function renderSlidesHtml(input: Deck, theme: Theme): string {
  const deck = deckSchema.parse(input);
  const t = theme;
  const f = fonts(t);
  const slides = prepareSlides(deck);
  const design = deckDesign(deck, theme);
  let section = 0;
  const body = slides
    .map((s) => {
      const cards = s.layout === "cards" && s.bullets.length > 0;
      if (s.layout === "metrics" && s.metrics?.length)
        return `<section class="slide" data-layout="metrics"><h2>${esc(s.title)}</h2><div class="metrics">${s.metrics.map((m) => `<div><strong>${esc(m.value)}</strong><h3>${esc(m.label)}</h3><p>${esc(m.detail ?? "")}</p></div>`).join("")}</div></section>`;
      if (
        (s.layout === "process" || s.layout === "timeline") &&
        s.steps?.length
      )
        return `<section class="slide" data-layout="${s.layout}"><h2>${esc(s.title)}</h2><ol class="steps ${s.layout}">${s.steps.map((step, k) => `<li><span class="step-num">${(s.startIndex ?? 0) + k + 1}</span><h3>${esc(step.label)}</h3><p>${esc(step.detail ?? "")}</p></li>`).join("")}</ol></section>`;
      if (s.layout === "chart" && s.chart) {
        const max = s.chartRange
          ? Math.max(Math.abs(s.chartRange.min), Math.abs(s.chartRange.max), 1)
          : Math.max(...s.chart.values.map(Math.abs), 1);
        return `<section class="slide" data-layout="chart"><h2>${esc(s.title)}</h2><figure class="chart"><figcaption>${esc(s.chart.name)}${s.chart.unit ? ` · ${esc(s.chart.unit)}` : ""}</figcaption>${s.chart.labels.map((label, k) => `<div class="chart-row"><span>${esc(label)}</span><div class="track"><i class="${s.chart!.values[k] < 0 ? "negative" : "positive"}" style="width:${(Math.abs(s.chart!.values[k]) / max) * 50}%;${s.chart!.values[k] < 0 ? "right" : "left"}:50%"></i></div><b>${s.chart!.values[k]}</b></div>`).join("")}</figure></section>`;
      }
      if (s.layout === "section") {
        section++;
        return `<section class="slide dark section"><span class="num">${String(section).padStart(2, "0")}</span><h2>${esc(s.title)}</h2>${s.bullets[0] ? `<p class="lede">${esc(s.bullets[0])}</p>` : ""}</section>`;
      }
      if (s.layout === "quote" && s.quote)
        return `<section class="slide quote"><blockquote>${esc(s.quote)}</blockquote><p class="cite">${esc(s.title)}</p>${s.bullets.length ? `<p class="aside">${s.bullets.map(esc).join("　")}</p>` : ""}</section>`;
      if (s.layout === "compare" && (s.left || s.right))
        return `<section class="slide"><h2>${esc(s.title)}</h2><div class="compare">${[
          s.left,
          s.right,
        ]
          .filter(Boolean)
          .map(
            (side) =>
              `<div class="side"><h3>${esc(side!.heading)}</h3>${list(side!.bullets)}</div>`,
          )
          .join("")}</div></section>`;
      if (cards)
        return `<section class="slide"><h2>${esc(s.title)}</h2><div class="cards n${Math.min(s.bullets.length, 9)}">${s.bullets
          .slice(0, 9)
          .map((b) => `<div class="card">${esc(b)}</div>`)
          .join("")}</div></section>`;
      // Five or more short points fill the slide better in two columns.
      const two =
        s.bullets.length >= 5 && s.bullets.every((b) => b.length <= 28);
      return `<section class="slide" data-layout="bullets"><h2>${esc(s.title)}</h2>${two ? list(s.bullets).replace("<ul>", '<ul class="two">') : list(s.bullets)}</section>`;
    })
    .map((html) =>
      html.replace(
        /<h2>(.*?)<\/h2>/g,
        (_, title: string) =>
          `<h2${title.length > 35 ? ' class="compact-title"' : ""}>${title}</h2>`,
      ),
    )
    .join("\n");
  const notes = JSON.stringify(slides.map((s) => s.note ?? "")).replace(
    /</g,
    "\\u003c",
  );
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(deck.title)}</title>
<style>
:root{--dark:#${t.dark};--light:#${t.light};--accent:#${t.accent};--accent2:#${t.accent2};--ink:#${t.ink};--muted:#${t.muted};--soft:#${t.soft};--line:#${t.line};--on-dark:#${mix(t.light, "ffffff", 0.5)};--dim-dark:#${mix(t.light, t.dark, 0.35)};--head:${f.cssHead};--body:${f.cssBody}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--dark);overflow:hidden}
body{font-family:var(--body);color:var(--ink)}
.stage{position:fixed;left:50%;top:50%;width:1920px;height:1080px;transform-origin:center;transform:translate(-50%,-50%)}
.slide{position:absolute;inset:0;padding:110px 150px 120px 170px;background:var(--light);display:none;flex-direction:column;overflow:hidden}
.slide.active{display:flex}
.slide::before{content:"";position:absolute;left:0;top:0;bottom:0;width:22px;background:var(--accent)}
.slide::after{content:attr(data-n);position:absolute;right:80px;bottom:56px;font-size:22px;color:var(--muted)}
.dark,.quote{}.dark{background:var(--dark);color:var(--on-dark)}.dark::before{display:none}.dark::after{color:var(--dim-dark)}
h1,h2,h3{font-family:var(--head);font-weight:700;line-height:1.18;letter-spacing:.005em}
h2{font-size:64px;margin-bottom:28px;max-width:1500px}
.slide h2.compact-title{font-size:46px}.slide h1{overflow-wrap:anywhere}.slide h2,.steps h3,.metrics h3,.chart-row>span{overflow-wrap:anywhere}
/* Center the body in the space under the title instead of leaving the lower half empty. */
.slide>h2+*{margin-top:auto;margin-bottom:auto}
.slide>h2::after{content:"";display:block;width:110px;height:7px;background:var(--accent2);margin-top:30px}
.dark h2::after,.quote h2::after{display:none}
ul{list-style:none;display:flex;flex-direction:column;gap:30px;max-width:1500px}
ul.two{display:grid;grid-template-columns:1fr 1fr;column-gap:90px;row-gap:44px;max-width:1600px}
li{position:relative;padding-left:46px;font-size:38px;line-height:1.45}
li::before{content:"";position:absolute;left:0;top:.56em;width:16px;height:16px;background:var(--accent)}
.cover{justify-content:center;padding-left:230px}
.cover::before{left:150px;top:330px;bottom:auto;height:360px;width:14px;background:var(--accent2)}
.cover h1{font-size:96px;max-width:1500px}
.cover .lede{font-size:36px;color:var(--dim-dark);margin-top:40px;max-width:1300px;line-height:1.5}
.cover .bar{position:absolute;left:0;right:0;bottom:0;height:26px;background:var(--accent)}
.section{justify-content:center}
.section .num{font-family:var(--head);font-size:150px;font-weight:700;color:var(--accent2);line-height:1}
.section h2{font-size:82px;margin:30px 0 0}
.section .lede{font-size:34px;color:var(--dim-dark);margin-top:34px;max-width:1300px;line-height:1.5}
.cards{display:grid;gap:30px;grid-template-columns:repeat(2,1fr);max-width:1600px}
.cards.n5,.cards.n6,.cards.n7,.cards.n8,.cards.n9{grid-template-columns:repeat(3,1fr)}
.card{background:var(--soft);border-top:7px solid var(--accent);padding:38px 40px;font-size:34px;line-height:1.45;display:flex;align-items:center;min-height:170px}
.card:nth-child(even){border-top-color:var(--accent2)}
.compare{display:grid;grid-template-columns:1fr 1fr;gap:50px;max-width:1600px}
.side{background:var(--soft);border-left:9px solid var(--accent);padding:46px 50px}
.side+.side{border-left-color:var(--accent2)}
.side h3{font-size:40px;margin-bottom:30px}
.side li{font-size:32px}
.quote{background:var(--soft);justify-content:center;padding-left:260px;padding-right:260px}
.quote::before{display:none}
.quote blockquote{font-family:var(--head);font-size:68px;font-weight:700;line-height:1.35;position:relative}
.quote blockquote::before{content:"\\201C";position:absolute;left:-120px;top:-60px;font-size:220px;color:var(--accent);font-family:Georgia,serif;line-height:1}
.quote .cite{margin-top:50px;font-size:28px;color:var(--muted)}
.quote .aside{margin-top:14px;font-size:28px;color:var(--muted)}
.hud{position:fixed;left:0;right:0;bottom:0;height:6px;background:rgba(255,255,255,.08);z-index:5}
#bar{height:100%;width:0;background:var(--accent2);transition:width .3s}
.nav{position:fixed;right:18px;bottom:20px;display:flex;gap:8px;z-index:5}
.nav button{width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:var(--light);color:var(--ink);font-size:20px;cursor:pointer}
.nav button:focus-visible{outline:3px solid var(--accent2);outline-offset:2px}
.metrics{display:flex;gap:60px}.metrics>div{flex:1;min-width:0;border-left:2px solid var(--line);padding-left:42px}.metrics strong{display:block;font-size:116px;line-height:1.2;color:var(--accent);overflow-wrap:anywhere}.metrics h3{font-size:40px;margin:30px 0 20px}.metrics p,.steps p{font-size:30px;line-height:1.6;color:var(--muted)}
.steps{display:flex;list-style:none;gap:40px;counter-reset:none;padding:0}.steps li{flex:1;min-width:0;padding:0;border-top:4px solid var(--accent)}.steps li::before{display:none}.step-num{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:var(--accent);color:var(--light);font-size:24px;margin-top:-30px}.steps h3{font-size:38px;margin:35px 0 20px}.timeline li{border:0;border-left:4px solid var(--accent);padding-left:30px}.timeline .step-num{margin:0 0 20px -60px}.timeline h3{margin-top:0}
.chart{width:100%}.chart figcaption{font-size:28px;color:var(--muted);margin-bottom:30px}.chart-row{display:grid;grid-template-columns:260px 1fr 130px;align-items:center;gap:24px;margin:18px 0;font-size:30px}.track{height:36px;position:relative;background:var(--soft)}.track::after{content:"";position:absolute;left:50%;height:100%;border-left:2px solid var(--muted)}.track i{position:absolute;height:100%;background:var(--accent)}.track i.negative{background:var(--ink)}.chart-row b{font-weight:500}
body[data-design="editorial"] .slide::before{display:none}body[data-design="editorial"] .slide>h2::after{width:100%;height:2px;background:var(--ink)}body[data-design="editorial"] .cover{background:var(--light);color:var(--ink);padding:170px 220px 170px 140px;border-top:3px solid var(--ink)}body[data-design="editorial"] .cover::after{content:"";right:90px;top:90px;bottom:90px;width:80px;background:var(--accent)}body[data-design="editorial"] .cover .lede{color:var(--muted)}body[data-design="editorial"] .cover .bar{display:none}body[data-design="editorial"] h1{font-size:110px;max-width:1350px}
body[data-design="studio"] .cover{background:var(--light);color:var(--ink);padding-left:120px;padding-right:680px}body[data-design="studio"] .cover::before{display:block;left:auto;right:0;top:0;width:560px;height:1080px;background:var(--accent)}body[data-design="studio"] .cover::after{display:none}.cover-index{position:absolute;right:70px;top:150px;width:420px;color:var(--light);z-index:1}.cover-index>div{padding:30px 0;border-bottom:1px solid currentColor}.cover-index small{font-size:24px;opacity:.75}.cover-index p{font-size:34px;line-height:1.4;margin-top:20px}body[data-design="studio"] .cover h1{font-size:88px}body[data-design="studio"] .cover .lede{color:var(--muted)}body[data-design="studio"] .cover .bar{display:none}
body[data-design="technical"] .slide::before{height:12px;width:100%;bottom:auto}body[data-design="technical"] .cover{background-image:linear-gradient(90deg,transparent 95%,#ffffff08 95%),linear-gradient(transparent 95%,#ffffff08 95%);background-size:100px 100px}
.nav{align-items:center}.nav output{color:var(--light);background:var(--dark);padding:6px 12px;font-size:14px;border-radius:20px}.notes{position:fixed;left:20px;right:20px;bottom:80px;max-height:35vh;overflow:auto;background:var(--light);color:var(--ink);border:1px solid var(--line);padding:24px;z-index:10;font-size:18px;white-space:pre-wrap}.notes[hidden]{display:none}
@media (prefers-reduced-motion:no-preference){.slide.active>*{animation:in .45s ease both}.slide.active>*:nth-child(2){animation-delay:.06s}.slide.active>*:nth-child(3){animation-delay:.12s}}
@keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media print{html,body{overflow:visible;background:#fff}.stage{position:static;transform:none!important}.slide{display:flex!important;position:relative;page-break-after:always}.hud,.nav,.notes{display:none}}
</style>
</head>
<body data-design="${design}">
<main class="stage" id="stage">
<section class="slide dark cover active"><h1>${esc(deck.title)}</h1>${deck.subtitle ? `<p class="lede">${esc(deck.subtitle)}</p>` : ""}${
    design === "studio"
      ? `<aside class="cover-index">${slides
          .slice(0, 3)
          .map(
            (s, k) =>
              `<div><small>${String(k + 1).padStart(2, "0")}</small><p>${esc(s.title)}</p></div>`,
          )
          .join("")}</aside>`
      : ""
  }<span class="bar"></span></section>
${body}
</main>
<div class="hud"><div id="bar"></div></div>
<aside class="notes" id="notes" hidden aria-live="polite"></aside>
<nav class="nav" aria-label="演示控制"><output id="counter" aria-live="polite"></output><button id="notes-toggle" aria-label="讲者备注" aria-expanded="false">≡</button><button id="prev" aria-label="上一页">‹</button><button id="next" aria-label="下一页">›</button></nav>
<script>
(function(){
var slides=[].slice.call(document.querySelectorAll('.slide')),i=0,notes=${notes};
slides.forEach(function(s,k){if(k)s.setAttribute('data-n',k+1);});
function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach(function(s,k){s.classList.toggle('active',k===i)});document.getElementById('bar').style.width=(slides.length>1?i/(slides.length-1)*100:100)+'%';document.getElementById('counter').textContent=(i+1)+' / '+slides.length;document.getElementById('notes').textContent=notes[i-1]||'本页没有讲者备注';document.getElementById('prev').disabled=i===0;document.getElementById('next').disabled=i===slides.length-1;}
function fit(){var s=Math.min(innerWidth/1920,innerHeight/1080);document.getElementById('stage').style.transform='translate(-50%,-50%) scale('+s+')';}
document.getElementById('prev').onclick=function(){show(i-1)};
document.getElementById('next').onclick=function(){show(i+1)};
document.getElementById('notes-toggle').onclick=function(){var box=document.getElementById('notes');box.hidden=!box.hidden;this.setAttribute('aria-expanded',String(!box.hidden));};
addEventListener('keydown',function(e){if(/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)||e.target.isContentEditable)return;if(['ArrowRight','PageDown',' ','Enter'].indexOf(e.key)>=0){e.preventDefault();show(i+1)}else if(['ArrowLeft','PageUp','Backspace'].indexOf(e.key)>=0){e.preventDefault();show(i-1)}else if(e.key==='Home')show(0);else if(e.key==='End')show(slides.length-1);});
var x=null;addEventListener('touchstart',function(e){x=e.touches[0].clientX});addEventListener('touchend',function(e){if(x===null)return;var d=e.changedTouches[0].clientX-x;if(d<-40)show(i+1);else if(d>40)show(i-1);x=null;});
addEventListener('resize',fit);fit();show(0);
})();
</script>
</body>
</html>
`;
}
