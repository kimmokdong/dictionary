// 고정 지면 조판: 폰트 글리프 폭으로 줄바꿈을 확정하고 쪽을 나눈다.
import * as fontkit from 'fontkit';

const fonts = {
  regular: fontkit.openSync('assets/fonts/Pretendard-Regular.woff2'),
  bold: fontkit.openSync('assets/fonts/Pretendard-Bold.woff2'),
};
const widthCache = { regular: new Map(), bold: new Map() };
export const missingGlyphs = new Map();

// shortcut: 글자별 전진 폭만 더한다(커닝 무시). 앱은 font-kerning: none 으로 그려야 한다.
function charWidth(fontName, ch) {
  const cache = widthCache[fontName];
  let w = cache.get(ch);
  if (w === undefined) {
    const font = fonts[fontName];
    const glyph = font.glyphForCodePoint(ch.codePointAt(0));
    if (!glyph.id) missingGlyphs.set(ch, (missingGlyphs.get(ch) || 0) + 1);
    w = glyph.id ? glyph.advanceWidth / font.unitsPerEm : 1;
    cache.set(ch, w);
  }
  return w;
}

export function textWidth(kinds, kind, text, fontSize) {
  const { font, scale } = kinds[kind];
  let w = 0;
  for (const ch of text) w += charWidth(font, ch);
  return w * fontSize * scale;
}

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const REL_LABEL = { 유의어: '비슷한말', 반대말: '반대말' };

// 한 항목을 조각(종류, 글, 앞 띄어쓰기 여부, 줄 새로 시작 여부)의 나열로 만든다.
export function entrySegments(e) {
  const seg = [{ k: 'h', t: e.w }];
  if (e.hn) seg.push({ k: 's', t: String(e.hn) });
  if (e.pos && e.pos !== '품사 없음') seg.push({ k: 'p', t: e.pos.replace(/\s+/g, ''), sp: true });
  const multi = e.senses.length > 1;
  e.senses.forEach((s, i) => {
    if (multi) seg.push({ k: 'n', t: CIRCLED[i] ?? `(${i + 1})`, sp: true, br: true });
    seg.push({ k: 'd', t: s.def, sp: true });
    if (s.ex.length) {
      seg.push({ k: 'l', t: '예', sp: true });
      for (const x of s.ex) seg.push({ k: 'x', t: x, sp: true });
    }
    for (const type of ['유의어', '반대말']) {
      const words = s.rel.filter((r) => r.type === type).map((r) => r.w);
      if (!words.length) continue;
      seg.push({ k: 'l', t: REL_LABEL[type], sp: true });
      seg.push({ k: 'r', t: words.join(', '), sp: true });
    }
  });
  return seg;
}

// 줄바꿈은 띄어쓰기 자리에서만 한다(낱말 중간에서 끊지 않는다).
export function breakLines(segments, config, fontSize) {
  const { kinds } = config;
  const limit = config.textWidth * config.widthSafety;
  const indent = config.indentEm * fontSize;
  const W = (k, t) => textWidth(kinds, k, t, fontSize);

  // 낱말 묶음: 사이에 띄어쓰기가 없는 조각들은 한 묶음으로 붙어 다닌다.
  const groups = [];
  for (const s of segments) {
    s.t.trim().split(/\s+/).forEach((word, i) => {
      const atom = { k: s.k, t: word, w: W(s.k, word) };
      const sp = i > 0 || !!s.sp;
      if (sp || !groups.length) groups.push({ atoms: [atom], w: atom.w, spw: W(s.k, ' '), br: i === 0 && !!s.br });
      else { const g = groups.at(-1); g.atoms.push(atom); g.w += atom.w; }
    });
  }

  const lines = [];
  let overflow = 0;
  let runs = [], x = 0;
  const avail = () => (lines.length ? limit - indent : limit);
  const flush = () => { lines.push({ r: runs, w: x }); runs = []; x = 0; };
  const push = (k, t) => {
    const last = runs.at(-1);
    if (last && last[0] === k) last[1] += t; else runs.push([k, t]);
  };
  for (const g of groups) {
    if (runs.length && (g.br || x + g.spw + g.w > avail())) flush();
    if (!runs.length && g.w > avail()) overflow++;
    g.atoms.forEach((a, i) => push(a.k, (i === 0 && runs.length ? ' ' : '') + a.t));
    x += (x ? g.spw : 0) + g.w;
  }
  if (runs.length) flush();
  return { lines, overflow };
}

// 쪽 나누기. 반환: 쪽 배열(각 쪽은 줄 배열)과 표제어별 시작 쪽.
export function paginate(entries, config, fontSize) {
  const lineH = fontSize * config.lineHeightRatio;
  const gap = lineH * config.entryGapLines;
  const pages = [];
  const entryPage = new Array(entries.length);
  let overflow = 0;
  let page = null, y = 0;
  const newPage = () => { page = []; pages.push(page); y = 0; };
  const fits = (n, withGap) => y + (withGap && page.length ? gap : 0) + n * lineH <= config.textHeight + 1e-6;

  let prevTab = -1;
  for (const e of entries) {
    const { lines, overflow: o } = breakLines(entrySegments(e), config, fontSize);
    overflow += o;
    if (e.tab !== prevTab) { newPage(); prevTab = e.tab; } // 자음 구간이 바뀌면 새 쪽
    const k = lines.length;
    const minHead = Math.min(2, k); // 표제어 줄과 그다음 줄은 같은 쪽에 둔다

    let placed = 0;
    while (placed < k) {
      const rem = k - placed;
      const first = placed === 0;
      // 이 쪽에 몇 줄까지 넣을 수 있는지 센다.
      let room = 0;
      while (room < rem && fits(room + 1, first)) room++;
      let here = room;
      if (here < rem) {
        if (rem - here === 1) here--;               // 다음 쪽에 한 줄만 남기지 않는다
        if (first && here < minHead) here = 0;      // 머리 부분을 못 지키면 통째로 다음 쪽
      }
      if (here <= 0) {
        if (page.length) { newPage(); continue; }
        here = room; // 빈 쪽에서도 못 지키는 경우(이론상)에는 그냥 채운다
      }
      for (let n = 0; n < here; n++, placed++) {
        const head = placed === 0;
        const g = head && page.length ? 1 : 0;
        const line = { e: e.seq, r: lines[placed].r };
        if (head) { line.h = 1; entryPage[e.seq] = pages.length; } else line.i = 1;
        if (g) line.g = 1;
        page.push(line);
        y += (g ? gap : 0) + lineH;
      }
      if (placed < k) newPage();
    }
  }
  return { pages, entryPage, overflow, lineH };
}
