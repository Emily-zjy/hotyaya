import { deckSchema, type Deck } from "./schema";
import { fonts, mix, type Theme } from "./theme";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
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
  const slides = deck.slides.filter(
    (s, i) => !(i === 0 && s.layout === "section" && s.title === deck.title),
  );
  let section = 0;
  const body = slides
    .map((s) => {
      const cards =
        (s.layout === "cards" && s.bullets.length > 0) ||
        (s.layout === "bullets" && s.bullets.length >= 2 && s.bullets.length <= 4 && s.bullets.every((b) => b.length <= 36));
      if (s.layout === "section") {
        section++;
        return `<section class="slide dark section"><span class="num">${String(section).padStart(2, "0")}</span><h2>${esc(s.title)}</h2>${s.bullets[0] ? `<p class="lede">${esc(s.bullets[0])}</p>` : ""}</section>`;
      }
      if (s.layout === "quote" && s.quote)
        return `<section class="slide quote"><blockquote>${esc(s.quote)}</blockquote><p class="cite">${esc(s.title)}</p>${s.bullets.length ? `<p class="aside">${s.bullets.map(esc).join("　")}</p>` : ""}</section>`;
      if (s.layout === "compare" && (s.left || s.right))
        return `<section class="slide"><h2>${esc(s.title)}</h2><div class="compare">${[s.left, s.right]
          .filter(Boolean)
          .map((side) => `<div class="side"><h3>${esc(side!.heading)}</h3>${list(side!.bullets)}</div>`)
          .join("")}</div></section>`;
      if (cards)
        return `<section class="slide"><h2>${esc(s.title)}</h2><div class="cards n${Math.min(s.bullets.length, 9)}">${s.bullets
          .slice(0, 9)
          .map((b) => `<div class="card">${esc(b)}</div>`)
          .join("")}</div></section>`;
      // Five or more short points fill the slide better in two columns.
      const two = s.bullets.length >= 5 && s.bullets.every((b) => b.length <= 28);
      return `<section class="slide"><h2>${esc(s.title)}</h2>${two ? list(s.bullets).replace("<ul>", '<ul class="two">') : list(s.bullets)}</section>`;
    })
    .join("\n");
  const notes = JSON.stringify(slides.map((s) => s.note ?? "")).replace(/</g, "\\u003c");
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
@media (prefers-reduced-motion:no-preference){.slide.active>*{animation:in .45s ease both}.slide.active>*:nth-child(2){animation-delay:.06s}.slide.active>*:nth-child(3){animation-delay:.12s}}
@keyframes in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media print{html,body{overflow:visible;background:#fff}.stage{position:static;transform:none!important}.slide{display:flex!important;position:relative;page-break-after:always}.hud,.nav{display:none}}
</style>
</head>
<body>
<main class="stage" id="stage">
<section class="slide dark cover active"><h1>${esc(deck.title)}</h1>${deck.subtitle ? `<p class="lede">${esc(deck.subtitle)}</p>` : ""}<span class="bar"></span></section>
${body}
</main>
<div class="hud"><div id="bar"></div></div>
<nav class="nav"><button id="prev" aria-label="上一页">‹</button><button id="next" aria-label="下一页">›</button></nav>
<script>
(function(){
var slides=[].slice.call(document.querySelectorAll('.slide')),i=0,notes=${notes};
slides.forEach(function(s,k){if(k)s.setAttribute('data-n',k+1);});
function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach(function(s,k){s.classList.toggle('active',k===i)});document.getElementById('bar').style.width=(slides.length>1?i/(slides.length-1)*100:100)+'%';if(notes[i-1])console.info('讲者备注：'+notes[i-1]);}
function fit(){var s=Math.min(innerWidth/1920,innerHeight/1080);document.getElementById('stage').style.transform='translate(-50%,-50%) scale('+s+')';}
document.getElementById('prev').onclick=function(){show(i-1)};
document.getElementById('next').onclick=function(){show(i+1)};
addEventListener('keydown',function(e){if(['ArrowRight','PageDown',' ','Enter'].indexOf(e.key)>=0){e.preventDefault();show(i+1)}else if(['ArrowLeft','PageUp','Backspace'].indexOf(e.key)>=0){e.preventDefault();show(i-1)}else if(e.key==='Home')show(0);else if(e.key==='End')show(slides.length-1);});
var x=null;addEventListener('touchstart',function(e){x=e.touches[0].clientX});addEventListener('touchend',function(e){if(x===null)return;var d=e.changedTouches[0].clientX-x;if(d<-40)show(i+1);else if(d>40)show(i-1);x=null;});
addEventListener('resize',fit);fit();show(0);
})();
</script>
</body>
</html>
`;
}
