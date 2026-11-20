// 책 본체: 넓은 옆면, 색인 탭, 휘면서 넘어가는 종이(한 장과 묶음 모두 같은 방식).
import { G, layout, xOfPage, pageAtX, targetLeft, tabChips, hitTest, lastLeft, fineWeight, followEdge } from './geometry.js';
import { firstEntry, spreadForEntry, nearestEntry, esc, entryHtml } from './word.js';
import { paperSound } from './sound.js';
import { createGames } from './games.js';
import { createCollection } from './collection.js';

const SIZES = ['normal', 'large', 'xlarge'];
let size = 'normal';
try { const saved = localStorage.getItem('dictionary-size'); if (SIZES.includes(saved)) size = saved; } catch {}
let DATA = `data/build/${size}/`;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const $ = (id) => document.getElementById(id);
const stage = $('stage'), canvas = $('edges'), ctx = canvas.getContext('2d');
const slab = $('slab'), hint = $('hint'), debugEl = $('debug');
const el = { underL: $('underL'), underR: $('underR') };
const slabShadow = $('slabShadow');
const note = $('wordNote'), wordContent = $('wordContent'), about = $('aboutPanel'), aboutButton = $('aboutButton');
const reader = $('reader'), band = $('band'), soundButton = $('sound');
const status = $('status'), sizeControls = $('sizeControls');
const STRIPS = 13, SW = G.PAGE_W / STRIPS;
reader.style.setProperty('--page-width', G.PAGE_W + 'px');
reader.style.setProperty('--strip-width', SW + 'px');
const zoom = document.createElement('canvas'), zoomGuide = document.createElement('div');
zoom.width = 178; zoom.height = 50;
const zoomCtx = zoom.getContext('2d');
hint.append(zoom, zoomGuide);
hint.setAttribute('role', 'img');

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`자료를 읽지 못했습니다 (${response.status})`);
  return response.json();
}
let index = await readJson(DATA + 'index.json');
let N = index.pageCount, sections = index.sections;
let L = Math.min(lastLeft(N), Math.max(0, Number(params.get('p')) || 0) & ~1); // 왼쪽 면 쪽 번호
let flip = null;   // 넘기는 중: { lo, hi, dir, phi, bend }
let press = null;  // 누르는 중: { id, hit, target, x0, y0, started, ... }
let changing = false, selected = null;
let game, collection;

// ---------- 쪽 내용 ----------
let chunks = new Map();
const chunkOf = (n) => Math.floor((n - 1) / index.pagesPerChunk);
function loadChunk(c) {
  if (!chunks.has(c)) {
    const cache = chunks; // 전환 전 요청이 새 단계의 캐시를 덮지 않게 한다.
    const p = readJson(`${DATA}pages-${String(c).padStart(4, '0')}.json`)
      .then((d) => (cache.set(c, d), d)).catch((error) => { cache.delete(c); throw error; });
    chunks.set(c, p);
  }
  return chunks.get(c);
}
const prefetch = (...pages) => pages.forEach((n) => {
  if (n >= 1 && n <= N) Promise.resolve(loadChunk(chunkOf(n))).catch(() => {});
});

function pageHtml(p) {
  const lineStyle = `height:${index.lineHeight}px;line-height:${index.lineHeight}px;`;
  const kindStyle = Object.fromEntries(Object.entries(index.kinds).map(([k, v]) =>
    [k, `font-size:${v.scale}em;font-weight:${v.font === 'bold' ? 700 : 400}`]));
  return `<div class="guide"><span>${esc(p.g[0])}</span><span>${esc(p.g[1])}</span></div><div class="body" style="font-size:${index.fontSize}px">` +
    p.l.map((l) => `<div class="line" data-e="${l.e}" style="${lineStyle}margin-left:${l.i ? index.indent : 0}px;margin-top:${l.g ? index.entryGap : 0}px">` +
      l.r.map(([k, t]) => `<span class="k-${k}" style="${kindStyle[k]}">${esc(t)}</span>`).join('') + '</div>').join('') +
    `</div><div class="num">${p.n}</div>`;
}
// 쪽 n의 내용을 container에 채운다. 아직 못 받은 쪽은 받는 대로 채운다.
function fillInto(container, n, stillWanted) {
  container.innerHTML = '';
  if (n < 1 || n > N) return;
  const c = loadChunk(chunkOf(n));
  const current = index;
  const put = (d) => { if (index === current && stillWanted()) container.innerHTML = pageHtml(d.find((p) => p.n === n)); };
  if (Array.isArray(c)) put(c); else c.then(put).catch(() => { if (index === current && stillWanted()) status.textContent = '쪽을 읽지 못했습니다. 다시 넘겨 주세요.'; });
}
function fill(pageEl, n) {
  const content = pageEl.firstElementChild;
  pageEl.dataset.n = n;
  if (n < 1 || n > N) { content.innerHTML = ''; return; }
  const c = loadChunk(chunkOf(n));
  const current = index;
  const wanted = () => index === current && pageEl.dataset.n == n;
  const put = (d) => { if (wanted()) content.innerHTML = pageHtml(d.find((p) => p.n === n)); };
  if (Array.isArray(c)) put(c); else { content.innerHTML = ''; c.then(put).catch(() => { if (wanted()) status.textContent = '쪽을 읽지 못했습니다. 다시 넘겨 주세요.'; }); }
}
for (const p of Object.values(el)) {
  const content = document.createElement('div');
  content.style.display = 'contents';
  p.prepend(content);
}

// ---------- 옆면 그리기 ----------
const paper = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 1;
  const g = c.getContext('2d');
  ['#f1ead8', '#d9d0b9', '#ece4d0', '#cdc3aa'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); });
  return ctx.createPattern(c, 'repeat');
})();
const tabColor = (i, light = 46) => `hsl(${(i * 26 + 10) % 360} 60% ${light}%)`;

function drawEdges(pos) {
  const lay = layout(pos, N), top = G.TOP, h = G.PAGE_H;
  ctx.clearRect(0, 0, G.STAGE_W, G.STAGE_H);
  // 종이 묶음: 바깥쪽이 살짝 낮아 보이게 사다리꼴로 자른다.
  for (const [inner, outer] of [[lay.leftX1, lay.leftX0], [lay.rightX0, lay.rightX1]]) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(inner, top); ctx.lineTo(outer, top + 7); ctx.lineTo(outer, top + h - 7); ctx.lineTo(inner, top + h);
    ctx.closePath(); ctx.clip();
    ctx.fillStyle = paper; ctx.fillRect(Math.min(inner, outer), top, Math.abs(outer - inner), h);
    const shade = ctx.createLinearGradient(inner, 0, outer, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.02)'); shade.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = shade; ctx.fillRect(Math.min(inner, outer), top, Math.abs(outer - inner), h);
    ctx.restore();
  }
  // 책 아래쪽으로 보이는 종이 단면
  ctx.fillStyle = '#e6dec9'; ctx.fillRect(lay.leftX0, top + h, lay.rightX1 - lay.leftX0, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = top + h + 1; y < top + h + 5; y += 2) ctx.fillRect(lay.leftX0, y, lay.rightX1 - lay.leftX0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(lay.spine - 1, top + h, 2, 5);
  const tabs = game?.tabs !== false, chips = tabs ? tabChips(pos, sections, lay) : [];
  const rowH = h / sections.length;
  // 구간 띠: 실제 종이 분량만큼의 폭
  if (tabs) sections.forEach((s, i) => {
    const a = s.start, b = s.start + s.pages; // [a, b)
    ctx.fillStyle = tabColor(i); ctx.globalAlpha = 0.6;
    const y = top + i * rowH + 6, hh = rowH - 12;
    if (a <= pos) { const x0 = lay.leftX1 - (pos - (a - 1)) * lay.k, x1 = lay.leftX1 - (pos - Math.min(b - 1, pos)) * lay.k; ctx.fillRect(x0, y, x1 - x0, hh); }
    if (b > pos + 1) { const x0 = lay.rightX0 + (Math.max(a, pos + 1) - pos - 1) * lay.k, x1 = lay.rightX0 + (b - pos - 1) * lay.k; ctx.fillRect(x0, y, x1 - x0, hh); }
    ctx.globalAlpha = 1;
  });
  // 잡은 종이 묶음: 층이 벌어진 틈과 옅은 강조
  if (press && ['tab', 'bundle'].includes(press.hit.kind) && !flip) {
    const right = press.hit.side === 'right';
    const x = right ? xOfPage(press.target + 1, L, lay) : xOfPage(press.target, L, lay);
    const inner = right ? lay.rightX0 : lay.leftX1;
    ctx.fillStyle = 'rgba(255, 214, 102, 0.35)'; ctx.fillRect(Math.min(x, inner), top, Math.abs(x - inner), h);
    ctx.save();
    ctx.shadowColor = 'rgba(40, 25, 10, 0.8)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.strokeStyle = '#fffcef'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, top + 2);
    ctx.quadraticCurveTo(x + (right ? -4 : 4), press.lastY, x, top + h - 2);
    ctx.stroke(); ctx.restore();
  }
  // 색인 탭
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 17px Dict, sans-serif';
  for (const c of chips) {
    const held = press && ['tab', 'bundle'].includes(press.hit.kind) && press.hit.tabIndex === c.i && !flip;
    const lift = held ? (c.side === 'right' ? 4 : -4) : 0;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = held ? 8 : 2; ctx.shadowOffsetY = held ? 3 : 1;
    ctx.fillStyle = tabColor(c.i, held ? 62 : 46);
    ctx.beginPath(); ctx.roundRect(c.x + lift, c.y, c.w, c.h, 5); ctx.fill();
    ctx.restore();
    if (game?.tabHint === c.i) {
      ctx.save(); ctx.strokeStyle = '#ffe38b'; ctx.lineWidth = 4;
      ctx.globalAlpha = .5 + .5 * Math.sin(performance.now() / 180) ** 2;
      ctx.shadowColor = '#ffe38b'; ctx.shadowBlur = 12;
      ctx.strokeRect(c.x + lift - 2, c.y - 2, c.w + 4, c.h + 4); ctx.restore();
    }
    ctx.fillStyle = '#fff'; ctx.fillText(c.tab, c.x + lift + c.w / 2, c.y + c.h / 2 + 1);
  }
  if (press && !flip && ['tab', 'bundle'].includes(press.hit.kind)) drawZoom(lay);
  if (DEBUG) drawDebug(lay, chips);
}

function drawZoom(lay) {
  const right = press.hit.side === 'right';
  const x = xOfPage(press.target + (right ? 1 : 0), L, lay);
  const w = zoom.width, h = zoom.height, magnification = 4;
  const sx = x - w / magnification / 2;
  const sy = Math.min(G.TOP + G.PAGE_H - h / magnification, Math.max(G.TOP, press.lastY - h / magnification / 2));
  zoomCtx.fillStyle = '#eee5d0'; zoomCtx.fillRect(0, 0, w, h);
  zoomCtx.drawImage(canvas, sx, sy, w / magnification, h / magnification, 0, 0, w, h);
  // 확대 범위에 걸친 구간 띠를 한 줄에 모아 색인 사이 위치를 보여 준다.
  if (game?.tabs !== false) sections.forEach((s, i) => {
    const a = Math.max(s.start, right ? L + 1 : 1), b = Math.min(s.end, right ? N : L);
    if (a > b) return;
    zoomCtx.fillStyle = tabColor(i);
    zoomCtx.fillRect((xOfPage(a, L, lay) - sx) * magnification, 0, (b - a + 1) * lay.k * magnification, 7);
  });
  zoomCtx.fillStyle = '#fffcef'; zoomCtx.fillRect(w / 2 - 2, 8, 4, h - 8);
  zoomCtx.fillStyle = '#70583b'; zoomCtx.fillRect(w / 2, 8, 1, h - 8);
}

function drawDebug(lay, chips) {
  ctx.save(); ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.strokeStyle = '#0a0';
  for (const c of chips) ctx.strokeRect(c.x - G.CHIP_PAD, c.y - G.CHIP_PAD, c.w + 2 * G.CHIP_PAD, c.h + 2 * G.CHIP_PAD);
  ctx.strokeStyle = '#06f'; // 옆면 판정 경계
  for (const x of [lay.leftX1 + G.EDGE_REACH, lay.rightX0 - G.EDGE_REACH]) { ctx.beginPath(); ctx.moveTo(x, G.TOP); ctx.lineTo(x, G.TOP + G.PAGE_H); ctx.stroke(); }
  ctx.strokeStyle = '#f60'; // 한 장 넘김 판정 경계
  for (const x of [lay.leftX1 + G.PAGE_ZONE, lay.rightX0 - G.PAGE_ZONE]) { ctx.beginPath(); ctx.moveTo(x, G.TOP); ctx.lineTo(x, G.TOP + G.PAGE_H); ctx.stroke(); }
  ctx.restore();
  debugEl.hidden = false;
  debugEl.textContent = `펼친 면 ${L}–${L + 1} / ${N}  ${index.guides[Math.max(0, L - 1)]?.[0] ?? ''}~${index.guides[Math.min(N - 1, L)]?.[1] ?? ''}\n` +
    (press ? `대상 ${press.hit.kind} ${press.hit.side}  탭 ${sections[press.hit.tabIndex]?.tab ?? '-'}  스냅 ${press.hit.snapped ? 'O' : 'X'}  ` +
      `잡은 쪽 ${press.hit.rawPage?.toFixed?.(0) ?? '-'}  목적 ${press.target}–${press.target + 1}` : '대상 없음') +
    (flip ? `\n넘김 ${flip.lo}→${flip.hi} 각도 ${flip.phi.toFixed(0)}°` : '') + `\nfps ${fps}`;
}

// ---------- 배치와 넘김 ----------
const LIFT = 0.32; // 높이 1px당 화면 위로 밀리는 양
function place(pos) {
  const lay = layout(pos, N);
  el.underL.style.transform = `translateX(${lay.leftX1}px)`;
  el.underR.style.transform = `translateX(${lay.spine}px)`;
  // 들린 높이(z)만큼 화면 위쪽으로 밀어 그린다. 앞에서 비스듬히 내려다보는 시점이라 휜 종이의 위아래 가장자리가 곡선으로 보인다.
  // 묶음은 책 속에 묻혀 있다가 나온다: 오른쪽에 누웠을 때는 윗면이, 왼쪽에 누웠을 때는 뒷면이 지면 높이에 온다.
  if (flip) slab.style.transform = `translateX(${lay.spine}px) matrix3d(1,0,0,0, 0,1,0,0, 0,${-LIFT},1,0, 0,0,0,1) ` +
    `translateZ(${-flip.t * (1 + Math.cos(flip.phi * Math.PI / 180)) / 2}px)`;
  drawEdges(pos);
  return lay;
}
function showSpread() {
  reader.style.setProperty('--text-width', index.textWidth + 'px');
  slab.style.display = slabShadow.style.display = 'none';
  fill(el.underL, L); fill(el.underR, L + 1);
  prefetch(L - 2, L + 3);
  place(L);
}
// 넘어가는 종이는 세로로 긴 조각 여러 개를 이어 붙인 곡면이다. 조각마다 각도가 달라 종이가 휜다.
const strips = [];
for (let i = 0; i < STRIPS; i++) {
  const strip = document.createElement('div');
  strip.className = 'strip';
  // 앞면(오른쪽 묶음 위에 있을 때 보이는 면)과 뒷면. 각 면은 지면의 해당 세로 띠만 보여 준다.
  strip.innerHTML =
    `<div class="sf front"><div class="page right inner" style="left:${-i * SW}px"><div style="display:contents"></div></div><div class="shade"></div></div>` +
    `<div class="sf back"><div class="page left inner" style="left:${-(G.PAGE_W - (i + 1) * SW)}px"><div style="display:contents"></div></div><div class="shade"></div></div>` +
    `<div class="cap"></div>`;
  slab.append(strip);
  const [front, back, cap] = strip.children;
  strips.push({ strip, front, frontContent: front.firstChild.firstChild, backContent: back.firstChild.firstChild,
    frontShade: front.lastChild, backShade: back.lastChild, cap });
}
const slabEdge = document.createElement('div');
slabEdge.id = 'slabEdge';
strips.at(-1).strip.append(slabEdge);

function startFlip(target) {
  hint.style.display = 'none';
  closeNote(); closeAbout(); setBandDisabled(true);
  const lo = Math.min(L, target), hi = Math.max(L, target), dir = target > L ? 1 : -1;
  const t = Math.max(0.5, (hi - lo) * (G.EDGE_SPAN / N)); // 묶음 두께(px)
  // 얇을수록 잘 휜다. 한 장은 크게, 두꺼운 묶음은 거의 휘지 않는다.
  flip = { lo, hi, dir, t, phi: dir > 0 ? 0 : 180, bend: 48 / (1 + t / 10) };
  flip.grabKind = press?.hit.kind;
  paperSound.start((hi - lo) / 2);
  fill(el.underL, lo); fill(el.underR, hi + 1);
  const current = flip;
  for (const s of strips) {
    fillInto(s.frontContent, lo + 1, () => flip === current);
    fillInto(s.backContent, hi, () => flip === current);
    s.front.style.transform = `translateZ(${t}px)`;
    s.cap.style.height = t + 'px';
  }
  slabEdge.style.width = t + 'px';
  slab.style.display = slabShadow.style.display = 'block';
  setPhi(flip.phi);
}

// 넘김 각도 phi(0=오른쪽에 누움, 180=왼쪽에 누움)일 때 조각 i의 각도.
// 가운데쯤에서 책등 쪽은 뒤처지고 바깥 끝은 앞서가 활처럼 휜다. 책 속으로 파고들지 않게 0~180으로 자른다.
function stripAngles(phi, bend) {
  const b = bend * Math.sin(phi * Math.PI / 180);
  return strips.map((_, i) => Math.min(180, Math.max(0, phi + b * (2 * (i + 0.5) / STRIPS - 1))));
}
const tipX = (phi, bend) => stripAngles(phi, bend).reduce((x, a) => x + SW * Math.cos(a * Math.PI / 180), 0);

function setPhi(phi) {
  flip.phi = Math.min(180, Math.max(0, phi));
  const lay = place(flip.lo + (flip.hi - flip.lo) * flip.phi / 180);
  let x = 0, z = 0;
  stripAngles(flip.phi, flip.bend).forEach((a, i) => {
    const r = a * Math.PI / 180, s = strips[i];
    s.strip.style.transform = `translate3d(${x}px,0,${z}px) rotateY(${-a}deg)`;
    const dark = Math.sin(r) * 0.2; // 세워질수록 어둡다. 조각마다 달라 곡면의 명암이 된다.
    s.frontShade.style.opacity = dark; s.backShade.style.opacity = dark;
    x += SW * Math.cos(r); z += SW * Math.sin(r);
  });
  // 종이가 아래 지면에 드리우는 그림자: 끝이 떠 있는 만큼 짙다.
  const w = Math.abs(x) + 14;
  slabShadow.style.transform = `translateX(${lay.spine}px) scaleX(${x >= 0 ? 1 : -1})`; // 책등에서 종이 끝 쪽으로 뻗는다
  slabShadow.style.width = w + 'px'; slabShadow.style.opacity = Math.min(0.45, z / 500);
  return lay;
}
function settle(endPhi) {
  const from = flip.phi, dur = 220 + 380 * Math.abs(endPhi - from) / 180, t0 = performance.now();
  const step = (now) => {
    const u = Math.min(1, (now - t0) / dur), e = 1 - (1 - u) ** 3;
    setPhi(from + (endPhi - from) * e);
    if (u < 1) return requestAnimationFrame(step);
    const completed = endPhi === 180 ? flip.dir > 0 : flip.dir < 0, kind = flip.grabKind;
    L = endPhi === 180 ? flip.hi : flip.lo;
    paperSound.land();
    flip = null;
    setBandDisabled(false);
    showSpread();
    game.flipped(completed, kind);
  };
  requestAnimationFrame(step);
}

// ---------- 입력 ----------
let scale = 1, offX = 0, offY = 0;
const BAND_H = 56;
function fit() {
  scale = Math.min(innerWidth / G.STAGE_W, innerHeight / (BAND_H + G.STAGE_H));
  offX = (innerWidth - G.STAGE_W * scale) / 2;
  offY = (innerHeight - (BAND_H + G.STAGE_H) * scale) / 2 + BAND_H * scale;
  reader.style.transform = `translate(${offX}px, ${offY - BAND_H * scale}px) scale(${scale})`;
}
const pt = (e) => ({ x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale });
const MIN_MOVE = 10;   // 이만큼 당겨야 넘김으로 확정
const DWELL_MS = 120;  // 옆면에서 이만큼 멈추면 그 쪽을 고른 것으로 본다

function showHint(x, y) {
  const t = press.target;
  hint.style.display = ['tab', 'bundle'].includes(press.hit.kind) ? 'block' : 'none';
  const hideGuide = !!game?.hideGuide;
  hint.classList.toggle('picture-only', hideGuide); zoomGuide.hidden = hideGuide;
  const words = hideGuide ? '' : `${index.guides[Math.max(0, t - 1)][0]} ~ ${index.guides[Math.min(N - 1, t)][1]}`;
  zoomGuide.textContent = hideGuide ? '' : `${words}\n${t}–${t + 1}쪽`;
  hint.setAttribute('aria-label', hideGuide ? '옆면 4배 확대' : `${words}, ${t}–${t + 1}쪽 옆면 4배 확대`);
  // 위쪽 공간이 부족한 책 모서리에서는 손가락 옆으로 비켜 둔다.
  const left = y < 124 ? x + (press.hit.side === 'right' ? -196 : 16) : x - 90;
  hint.style.left = Math.min(G.STAGE_W - 180, Math.max(0, left)) + 'px';
  hint.style.top = Math.min(G.STAGE_H - 90, Math.max(0, y - 124)) + 'px';
}
function endPress() { press = null; hint.style.display = 'none'; }

// ---------- 낱말 쪽지와 위쪽 도구 띠 ----------
function closeNote() {
  selected = null; note.hidden = true;
  collection?.select(null);
  stage.querySelectorAll('.word-selected').forEach((line) => line.classList.remove('word-selected'));
}
function closeAbout() { about.hidden = true; aboutButton.setAttribute('aria-expanded', 'false'); }
function setBandDisabled(disabled) {
  band.querySelectorAll('button').forEach((button) => { button.disabled = disabled ||
    (game?.active && (!!button.dataset.size || button.id === 'collectionButton')) || (button.id === 'fullscreen' && !document.fullscreenEnabled); });
}
function pageAt(x, y) {
  if (y < G.TOP || y > G.TOP + G.PAGE_H) return null;
  const lay = layout(L, N);
  return x >= lay.leftX1 && x < lay.spine ? el.underL : x >= lay.spine && x <= lay.rightX0 ? el.underR : null;
}
const noteChunks = new Map();
async function selectWord(page, y) {
  const lines = [...page.querySelectorAll('.line')].map((line) => {
    const rect = line.getBoundingClientRect();
    return { entry: Number(line.dataset.e), top: (rect.top - offY) / scale, bottom: (rect.bottom - offY) / scale };
  });
  const seq = nearestEntry(lines, y);
  if (seq === null) return;
  if (game.active) { await game.pick(seq, page === el.underL ? 'left' : 'right'); return; }
  await showWord(seq, page);
}
async function showWord(seq, page) {
  const selection = selected = { seq };
  collection.select(null);
  for (const p of Object.values(el)) p.querySelectorAll('.line').forEach((line) => line.classList.toggle('word-selected', Number(line.dataset.e) === seq));
  const lay = layout(L, N);
  note.style.left = (page === el.underL ? lay.spine : lay.leftX1) + (G.PAGE_W - 500) / 2 + 'px';
  note.dataset.side = page === el.underL ? 'right' : 'left';
  wordContent.textContent = '낱말을 읽고 있어요…'; note.hidden = false; wordContent.scrollTop = 0;
  const c = Math.floor(seq / index.entriesPerChunk);
  try {
    if (!noteChunks.has(c)) noteChunks.set(c, readJson(`data/build/notes/notes-${String(c).padStart(4, '0')}.json`)
      .catch((error) => { noteChunks.delete(c); throw error; }));
    const [notes, entry] = await Promise.all([noteChunks.get(c), collection.entryAt(seq)]);
    if (selected === selection) {
      wordContent.innerHTML = entryHtml(notes.find((entry) => entry.seq === seq));
      collection.select(entry);
    }
  } catch {
    if (selected === selection) wordContent.textContent = '낱말을 읽지 못했습니다. 닫고 다시 선택해 주세요.';
  }
}
$('closeWord').addEventListener('click', () => { closeNote(); });
aboutButton.addEventListener('click', () => {
  if (flip || press || changing) return;
  collection.close();
  closeNote(); about.hidden = !about.hidden;
  aboutButton.setAttribute('aria-expanded', String(!about.hidden));
});
sizeControls.addEventListener('click', async (e) => {
  const nextSize = e.target.closest('button')?.dataset.size;
  if (flip || press || changing || game.active || !SIZES.includes(nextSize) || nextSize === size) return;
  const seq = firstEntry(index, L);
  changing = true; setBandDisabled(true); closeNote(); closeAbout(); collection.close();
  status.textContent = '글씨 크기를 바꾸고 있어요…';
  try {
    const data = `data/build/${nextSize}/`, nextIndex = await readJson(data + 'index.json');
    const nextL = spreadForEntry(nextIndex, seq), nextChunks = new Map();
    // 보일 두 면을 먼저 받아 두면 단계가 바뀐 순간 지면이 비지 않는다.
    for (const n of [nextL, nextL + 1]) {
      if (n < 1 || n > nextIndex.pageCount) continue;
      const c = Math.floor((n - 1) / nextIndex.pagesPerChunk);
      if (!nextChunks.has(c)) nextChunks.set(c, await readJson(`${data}pages-${String(c).padStart(4, '0')}.json`));
    }
    size = nextSize; DATA = data; index = nextIndex; N = index.pageCount; sections = index.sections; chunks = nextChunks; L = nextL;
    showSpread(); status.textContent = '';
    try { localStorage.setItem('dictionary-size', size); } catch { status.textContent = '이 브라우저에서는 글씨 크기를 저장할 수 없습니다.'; }
  } catch { status.textContent = '글씨 크기를 바꾸지 못했습니다. 다시 골라 주세요.'; }
  finally {
    changing = false; setBandDisabled(false); updateSizeButtons();
  }
});
function updateSizeButtons() {
  sizeControls.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.size === size)));
}
updateSizeButtons();
function updateSoundButton() {
  soundButton.textContent = paperSound.enabled ? '소리 끄기' : '소리 켜기';
  soundButton.setAttribute('aria-pressed', String(paperSound.enabled));
}
soundButton.addEventListener('click', () => {
  if (flip || press || changing) return;
  paperSound.toggle(); updateSoundButton();
});
updateSoundButton();
const fullscreen = $('fullscreen');
fullscreen.disabled = !document.fullscreenEnabled;
fullscreen.addEventListener('click', async () => {
  if (flip || press || changing) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();
  } catch { status.textContent = '전체 화면으로 바꾸지 못했습니다. 브라우저 설정을 확인해 주세요.'; }
});
document.addEventListener('fullscreenchange', () => {
  fullscreen.textContent = document.fullscreenElement ? '전체 화면 끄기' : '전체 화면 켜기'; fit();
  fullscreen.setAttribute('aria-pressed', String(!!document.fullscreenElement));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeNote(); closeAbout(); }
});
document.addEventListener('pointerdown', (e) => {
  paperSound.unlock();
  if (!stage.contains(e.target)) closeNote();
  if (!about.contains(e.target) && !aboutButton.contains(e.target)) closeAbout();
});
band.addEventListener('keydown', () => paperSound.unlock());

stage.addEventListener('pointerdown', (e) => {
  if (press || flip || changing || (game.active && !game.finding) || !e.isPrimary || e.button !== 0 || e.target.closest('[data-ui]')) return;
  closeNote(); closeAbout();
  const { x, y } = pt(e);
  const hit = hitTest(x, y, L, N, sections, { tabs: game.tabs });
  const page = pageAt(x, y);
  if (hit.kind === 'none' && !page) return;
  stage.setPointerCapture(e.pointerId);
  // sel: 고른 쪽(소수). 손가락 아래 쪽 + offset(색인 스냅·미세 조정으로 생긴 차이). committed: 마지막으로 멈칫한 곳의 쪽.
  const sel = hit.rawPage ?? hit.target;
  const offset = hit.kind === 'bundle' ? sel - pageAtX(hit.side, x, L, N, layout(L, N)) : 0;
  // locked: 짚은 직후나 멈칫한 뒤에는 펼친 면 쪽 이동을 넘기기로 보고 고른 쪽을 바꾸지 않는다.
  press = { id: e.pointerId, hit, page, target: hit.target, sel, offset, committed: sel, locked: true, onEdge: true, v: 0,
    x0: x, y0: y, t0: e.timeStamp, moved: 0, started: false, lastX: x, lastY: y, lastT: e.timeStamp, vx: 0 };
  if (hit.kind !== 'none') { prefetch(hit.target, hit.target + 1); showHint(x, y); }
  drawEdges(L);
});

stage.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  const { x, y } = pt(e), right = press.hit.side === 'right';
  press.moved = Math.max(press.moved, Math.hypot(x - press.x0, y - press.y0));
  if (press.hit.kind === 'none') return;
  const dt = e.timeStamp - press.lastT, dx = x - press.lastX;
  if (dt > 0) { press.vx = dx / dt; press.lastX = x; press.lastY = y; press.lastT = e.timeStamp; }
  const bundle = press.hit.kind === 'bundle';
  if (!press.started) {
    const lay = layout(L, N), edge = right ? lay.rightX0 : lay.leftX1;
    const pull = right ? press.x0 - x : x - press.x0, inward = right ? edge - x : x - edge;
    // 옆면 묶음: 옆면 위에서는 고른 쪽이 손가락 아래를 따라가고(아주 천천히 움직이면 한 장씩),
    // 펼친 면 안으로 들어오면 마지막으로 멈칫했던 쪽으로 돌아가 FLIP_IN만큼 더 끌면 그 쪽까지 넘긴다.
    // 색인 탭: 구간 첫 쪽으로 바로 가므로 지금처럼 조금만 당겨도 넘긴다.
    if (bundle && dt > 0) {
      // 터치 이벤트 간격이 고르지 않아 속도를 약 30ms 동안 고른다. 멈췄다 움직이면 예전 속도는 바로 잊는다.
      // 멈췄다 움직인 첫 이벤트는 dt가 길어 아주 느린 것으로 잘못 읽히므로 시간 간격을 50ms까지만 센다.
      press.v += (Math.abs(dx) / Math.min(dt, 50) - press.v) * Math.min(1, dt / 30);
      const onEdge = inward <= G.EDGE_REACH, w = fineWeight(press.v);
      if (onEdge) {
        const toward = right ? dx < 0 : dx > 0, under = pageAtX(press.hit.side, x, L, N, lay);
        if (press.locked && toward && w < 0.5) {
          // 짚거나 멈칫한 뒤 펼친 면 쪽으로 끄는 중: 넘기려는 동작이므로 고른 묶음을 그대로 둔다.
          press.offset = press.sel - under;
        } else {
          if (!toward && w < 0.5) press.locked = false; // 바깥쪽으로 다시 훑으면 손가락을 따라간다
          press.offset = followEdge(press.offset, dx, press.v, lay.k);
          press.sel = under + press.offset;
        }
      } else {
        if (press.onEdge) press.sel = press.committed; // 옆면을 그대로 긁고 들어온 몫은 버린다
        press.sel += w * dx * 2 / G.FINE_PX;          // 지면 안에서는 아주 천천히 움직일 때만 한 장씩
      }
      press.sel = Math.min(N, Math.max(1, press.sel));
      if (!onEdge) press.offset = press.sel - pageAtX(press.hit.side, x, L, N, lay);
      if (w > 0.5) { press.committed = press.sel; press.locked = true; } // 아주 천천히 맞춘 곳도 멈칫한 곳
      // 갑자기 멈추면 이벤트가 더 오지 않으므로, DWELL_MS 동안 안 움직이면 그 자리를 멈칫한 곳으로 본다.
      clearTimeout(press.dwell);
      const held = press;
      if (onEdge) held.dwell = setTimeout(() => {
        if (press === held && !held.started && held.onEdge) { held.committed = held.sel; held.locked = true; }
      }, DWELL_MS);
      press.onEdge = onEdge;
      const t = targetLeft(press.sel, L, press.hit.side, N);
      if (t !== press.target) { press.target = t; prefetch(t, t + 1); paperSound.tick(); }
    }
    showHint(x, y);
    if (bundle ? inward < G.FLIP_IN : pull < MIN_MOVE) { drawEdges(L); return; }
    press.started = true;
    hint.style.display = 'none';
    // 손가락과 종이 바깥 끝 사이 거리. 묶음은 손가락이 이미 지면 안쪽에 있으므로 아래에서 줄여 가며 따라잡게 한다.
    press.grab = (bundle ? x : press.x0) - edge;
    startFlip(press.target);
  } else if (bundle) press.grab *= 0.8;
  const lay = layout(flip.lo + (flip.hi - flip.lo) * flip.phi / 180, N);
  // 종이 바깥 끝이 손가락을 따라오도록 넘김 각도를 찾는다(끝의 가로 위치는 각도가 커질수록 줄어든다).
  const want = x - press.grab - lay.spine;
  let a = 0, b = 180;
  for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (tipX(m, flip.bend) > want) a = m; else b = m; }
  setPhi((a + b) / 2);
});

function release(e, cancel) {
  if (!press || e.pointerId !== press.id) return;
  const { started } = press;
  const held = press, { x, y } = pt(e);
  const moved = Math.max(held.moved, Math.hypot(x - held.x0, y - held.y0));
  const vx = e.timeStamp - press.lastT > 80 ? 0 : press.vx; // 멈췄다가 놓으면 속도로 치지 않는다
  endPress();
  if (!started && !cancel && held.hit.kind === 'bundle') {
    // 넘김 시작 지점 전에 놓았어도 펼친 면 쪽으로 빠르게 튕겼으면 고른 쪽까지 넘긴다.
    const right = held.hit.side === 'right', lay = layout(L, N);
    const inward = right ? lay.rightX0 - x : x - lay.leftX1;
    if (inward >= G.FLICK_IN && (right ? vx < -0.5 : vx > 0.5)) {
      startFlip(held.target); flip.grabKind = held.hit.kind;
      settle(right ? 180 : 0);
      return;
    }
  }
  if (!started) {
    drawEdges(L);
    if (!cancel && moved < 8 && e.timeStamp - held.t0 <= 500 && held.page && ['none', 'page'].includes(held.hit.kind)) selectWord(held.page, held.y0);
    return;
  }
  // 절반 가까이 넘겼거나 넘기는 쪽으로 빠르게 놓으면 완료, 아니면 되돌린다.
  const fast = Math.abs(vx) > 0.5;
  const toLeft = cancel ? flip.dir < 0 : fast ? vx < 0 : flip.phi > 80;
  settle(toLeft ? 180 : 0);
}
stage.addEventListener('pointerup', (e) => release(e, false));
stage.addEventListener('pointercancel', (e) => release(e, true));
stage.addEventListener('lostpointercapture', (e) => release(e, true));
stage.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('resize', fit);

let fps = 0, frames = 0, lastFps = performance.now();
if (DEBUG) {
  const tick = (now) => {
    frames++;
    if (now - lastFps >= 1000) { fps = frames; frames = 0; lastFps = now; if (!flip) drawEdges(L); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__dict = { get L() { return L; }, get flip() { return flip; }, get press() { return press; },
    get N() { return N; }, get sections() { return sections; }, get size() { return size; } };
}

collection = createCollection({
  readJson, getIndex: () => index, idle: () => !flip && !press && !changing && !game?.active,
  busy: (value) => { changing = value; setBandDisabled(value); },
  closeOthers: () => {
    closeNote(); closeAbout(); $('gamePanel').hidden = true; $('gameButton').setAttribute('aria-expanded', 'false'); $('gameNote').hidden = true;
  },
  open: async (entry) => {
    const left = spreadForEntry(index, entry.seq);
    await Promise.all([left, left + 1].filter((n) => n >= 1 && n <= N).map((n) => loadChunk(chunkOf(n))));
    closeNote(); L = left; showSpread(); status.textContent = '';
    await showWord(entry.seq, index.entryPage[entry.seq] === left ? el.underL : el.underR);
    $('collectWord').focus();
  },
  debug: DEBUG,
});
game = createGames({
  readJson, getIndex: () => index, getLeft: () => L, idle: () => !flip && !press && !changing, closeAbout,
  collect: collection.collect, closeCollection: collection.close,
  changed: () => setBandDisabled(!!flip || changing),
  redraw: () => { if (!flip) drawEdges(L); },
  position: (element, side) => {
    const lay = layout(L, N);
    element.style.left = (side === 'right' ? lay.spine : lay.leftX1) + (G.PAGE_W - 500) / 2 + 'px';
  },
  highlight: (seq) => {
    closeNote();
    if (seq !== null) for (const p of Object.values(el)) p.querySelectorAll('.line').forEach((line) =>
      line.classList.toggle('word-selected', Number(line.dataset.e) === seq));
  },
  open: async (seq, wanted) => {
    const left = seq === null ? 0 : spreadForEntry(index, seq);
    await Promise.all([left, left + 1].filter((n) => n >= 1 && n <= N).map((n) => loadChunk(chunkOf(n))));
    // 진행 중인 손동작과 안착을 끝낸 뒤 놀이의 펼침을 연다.
    while ((flip || press) && wanted()) await new Promise((resolve) => setTimeout(resolve, 30));
    if (wanted()) { closeNote(); L = left; showSpread(); }
  },
  debug: DEBUG,
});
fit();
await document.fonts.ready;
showSpread();
