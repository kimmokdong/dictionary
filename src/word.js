import { jamoSlots, sortKey } from '../scripts/data/sort.mjs';

// 지면 위치와 표제어를 연결한다. 이어지는 항목만 있는 면은 그 항목을 기준으로 삼는다.
export function firstEntry(index, left) {
  const first = index.entryPage.findIndex((p) => p >= Math.max(1, left) && p <= left + 1);
  return first >= 0 ? first : Math.max(0, index.entryPage.findLastIndex((p) => p <= left + 1));
}

export const spreadForEntry = (index, seq) => Math.floor(index.entryPage[seq] / 2) * 2;

export function nearestEntry(lines, y) {
  let entry = null, best = 20;
  for (const line of lines) {
    const distance = Math.max(line.top - y, y - line.bottom, 0);
    if (distance <= best) { best = distance; entry = line.entry; }
  }
  return entry;
}

export const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const hasBatchim = (w) => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c < 11172 && c % 28 !== 0; };
// 받침이 있으면 '이에요', 없으면 '예요'(한글 음절이 아니면 '예요').
export const topic = (w) => `'${w}'${hasBatchim(w) ? '은' : '는'}`;
export const isIt = (w) => `이건 '${w}'${hasBatchim(w) ? '이에요' : '예요'}`;

// 자음 이름(기역·니은…)은 받침으로 끝나 '이', 모음 이름(아·오…)은 받침이 없어 '가'를 붙인다.
const jamoSubject = (j) => (j >= 'ㄱ' && j <= 'ㅎ' ? '이' : '가');
const ordinal = (n) => ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째'][n - 1] ?? `${n}번째`;
export function orderComparison(before, after) {
  const a = jamoSlots(before), b = jamoSlots(after);
  let slot = 0;
  while (slot < Math.max(a.length, b.length) && a[slot] === b[slot]) slot++;
  const common = a.slice(0, slot).filter(Boolean).length;
  const prefix = `'${before}'${hasBatchim(before) ? '과' : '와'} '${after}'${hasBatchim(after) ? '은' : '는'} `;
  const subject = `'${before}'${hasBatchim(before) ? '이' : '가'}`;
  let text;
  if (sortKey(before) === sortKey(after)) text = '글자가 똑같아서 어깨번호 차례로 놓여요.';
  else if (slot === a.length) text = `${prefix}앞부분이 같고 ${subject} 먼저 끝나서 앞에 와요.`;
  else if (a[slot] === '') text = `${prefix}${ordinal(Math.floor(slot / 3) + 1)} 글자에서 받침 없는 '${sortKey(before)[Math.floor(slot / 3)]}'가 받침 '${b[slot]}'인 '${sortKey(after)[Math.floor(slot / 3)]}'보다 먼저라서 ${subject} 앞에 와요.`;
  else text = prefix + (common ? `${ordinal(common)} 자모까지 같아요. ` : '') +
    `${ordinal(common + 1)}에서 '${a[slot]}'${jamoSubject(a[slot])} '${b[slot]}'보다 먼저라서 ${subject} 앞에 와요.`;
  return { slot: slot < Math.max(a.length, b.length) ? slot : -1, common, text, a, b };
}

function orderHtml(entry, neighbors) {
  const pairs = [];
  if (neighbors.before) pairs.push([neighbors.before, entry]);
  if (neighbors.after) pairs.push([entry, neighbors.after]);
  const rows = (e, slots, at) => `<div class="jamo-row"><b>${esc(e.w)}${e.hn ? `<sup>${e.hn}</sup>` : ''}</b><span>` +
    [...slots, ...(at === slots.length ? ['낱말 끝'] : [])].map((j, i) => j || i === at ?
      `<${i === at ? 'mark' : 'span'}>${esc(j || '받침 없음')}</${i === at ? 'mark' : 'span'}>` : '').join(' ') + '</span></div>';
  return '<details class="word-order"><summary>왜 여기 있을까?</summary>' + pairs.map(([a, b]) => {
    const cmp = orderComparison(a.w, b.w);
    return `<div class="order-pair">${rows(a, cmp.a, cmp.slot)}${rows(b, cmp.b, cmp.slot)}<p>${esc(cmp.text)}</p></div>`;
  }).join('') + '</details>';
}

// ---------- 어종 띠와 풀이 (6학년 '소중한 우리말' 수준의 말로, '혼종어'·'귀화어' 같은 용어는 쓰지 않는다) ----------
// 원어 표기의 기호(▽·←)를 빼고, 'A/B하다'처럼 여러 표기가 있으면 첫 표기에 뒤쪽 우리말 끝(하다 등)을 붙인다.
export function cleanOrigin(origin) {
  const parts = String(origin ?? '').normalize('NFC').replace(/[▽▼←^]/g, '').split('/').map((s) => s.trim());
  const suffix = parts.at(-1).match(/[가-힣]+$/)?.[0];
  return suffix && !parts[0].endsWith(suffix) ? parts[0] + suffix : parts[0];
}
const KIND_OF = (token) => (/^[가-힣]/.test(token) ? '고유어' : /^[一-鿿]/.test(token) ? '한자어' : '외래어');
// 섞인 말을 조각으로 나눈다. 숭고하다 + 崇高하다 → [숭고(崇高) 한자어, 하다 고유어]. 못 나누면 null.
export function kindParts(w, origin) {
  const tokens = cleanOrigin(origin).match(/[一-鿿]+|[가-힣]+|[A-Za-z][A-Za-z .'-]*[A-Za-z]|[A-Za-z]/g);
  const syllables = [...w.normalize('NFC')];
  if (!tokens || tokens.length < 2 || tokens.filter((t) => KIND_OF(t) === '외래어').length > 1) return null;
  // 한자는 한 글자에 한 음절, 우리말은 그대로, 외국 글자 조각은 남는 음절을 모두 가져간다.
  const fixed = tokens.reduce((sum, t) => sum + (KIND_OF(t) === '외래어' ? 0 : t.length), 0);
  const parts = [];
  let at = 0;
  for (const token of tokens) {
    const kind = KIND_OF(token), size = kind === '외래어' ? syllables.length - fixed : token.length;
    const text = syllables.slice(at, at + size).join('');
    if (size < 1 || text.length !== size || (kind === '고유어' && text !== token)) return null;
    parts.push(kind === '고유어' ? { text, kind } : { text, kind, src: token });
    at += size;
  }
  return at === syllables.length && new Set(parts.map((p) => p.kind)).size > 1 ? parts : null;
}
// 외국에서 들어왔거나 한자에서 왔지만 오래 써서 우리말로 굳은 낱말(사전은 고유어로 본다).
const FOREIGN_ROOTS = { 빵: '포르투갈어 pão에서', 담배: '포르투갈어 tabaco에서', 가방: '네덜란드어 kabas가 일본을 거쳐',
  고무: '프랑스어 gomme에서', 구두: '일본어 kutsu(구쓰)에서', 냄비: '일본어 nabe(나베)에서' };
const HANJA_ROOTS = { 배추: '白菜(백채)', 성냥: '石硫黃(석류황)', 숭늉: '熟冷(숙랭)', 김치: '沈菜(침채)', 상추: '生菜(생채)',
  고추: '苦椒(고초)', 가난: '艱難(간난)', 사냥: '山行(산행)', 짐승: '衆生(중생)', 감자: '甘藷(감저)' };
const withTopic = (text, src) => `'${text}'${src ? `(${src})` : ''}${hasBatchim(text) ? '은' : '는'}`;
export function kindInfo(entry) {
  const origin = entry.origin ? cleanOrigin(entry.origin) : '';
  if (entry.kind === '고유어') {
    if (!origin && FOREIGN_ROOTS[entry.w]) return { label: '고유어', text: `${FOREIGN_ROOTS[entry.w]} 들어왔지만, 오래 써서 우리말처럼 굳어진 말이에요. 그래서 사전에서는 고유어로 봐요.` };
    if (!origin && HANJA_ROOTS[entry.w]) return { label: '고유어', text: `한자 ${HANJA_ROOTS[entry.w]}에서 왔지만, 소리가 바뀌어 우리말처럼 굳어진 말이에요. 그래서 사전에서는 고유어로 봐요.` };
    return { label: '고유어', text: '예부터 우리가 써 온 순우리말이에요.' };
  }
  if (entry.kind === '한자어') return { label: '한자어', origin, text: `한자${origin ? ` ${origin}` : ''}로 쓰는 말이에요.` };
  if (entry.kind === '외래어') return { label: '외래어', origin, text: `다른 나라 말${origin ? ` ${origin}` : ''}에서 들어와 우리말처럼 쓰는 말이에요.` };
  if (entry.kind === '혼종어') {
    const parts = kindParts(entry.w, entry.origin);
    if (!parts) return { label: '섞인 말', origin, text: '고유어·한자어·외래어 가운데 서로 다른 말이 합쳐진 낱말이에요.' };
    return { label: [...new Set(parts.map((p) => p.kind))].join(' + '), origin,
      text: parts.map((p, i) => `${withTopic(p.text, p.src)} ${p.kind}${i === parts.length - 1 ? '예요.' : ','}`).join(' ') + ' 서로 다른 말이 합쳐진 낱말이에요.' };
  }
  return null;
}
// 어종을 모르면 띠를 만들지 않고, 원어는 entryHtml에서 따로 보인다.
export function kindHtml(entry) {
  const info = kindInfo(entry);
  if (!info) return '';
  return `<div class="word-kind"><p><span class="kind-badge" data-kind="${entry.kind}">${esc(info.label)}</span>` +
    (info.origin ? ` <span class="kind-origin">원어 ${esc(info.origin)}</span>` : '') + `</p><p class="kind-note">${esc(info.text)}</p></div>`;
}

export function entryHtml(entry, neighbors) {
  const grades = ['학교 가기 전', '1~2학년', '3~4학년', '5~6학년'];
  const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  let info = '';
  if (entry.pronunciation.length) info += `<p>발음 <b>[${entry.pronunciation.map(esc).join(', ')}]</b></p>`;
  if (entry.forms.length) info += `<p>활용 · ${entry.forms.map((f) => esc(f.w) + (f.short.length ? `(${f.short.map(esc).join(', ')})` : '')).join(', ')}</p>`;
  if (entry.origin && !entry.kind) info += `<p>원어 · ${esc(entry.origin)}</p>`;
  info += entry.senses.map((s) => `<section class="sense"><h3>${circled[s.n - 1] ?? `(${s.n})`} 예문</h3>` +
    s.sentences.map((x) => `<p class="word-example">${esc(x)}</p>`).join('') +
    (s.dialogue.length ? `<div class="word-dialogue">${s.dialogue.map((x, i) => `<p><span>${i % 2 ? '나' : '가'}</span> ${esc(x)}</p>`).join('')}</div>` : '') + '</section>').join('');
  for (const [type, label] of [['유의어', '비슷한말'], ['반대말', '반대말']]) {
    const related = entry.related?.filter((r) => r.type === type) ?? [];
    if (related.length) info += `<section class="sense"><h3>${label}</h3><p>` + related.map((r) =>
      Number.isInteger(r.seq) ? `<a href="#word-${r.seq}" data-seq="${r.seq}">${esc(r.w)}</a>` : esc(r.w)).join(', ') + '</p></section>';
  }
  if (entry.phrases.length) info += '<section class="sense"><h3>관용구·속담</h3><div class="phrase-cards">' + entry.phrases.map((p) =>
    `<article class="phrase-card"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 3h16v14H9l-5 4V3Zm4 5h8M8 12h6"/></svg><div><b>${esc(p.w)}</b> <small>${esc(p.type)}</small><p class="word-example">${esc(p.def)}</p></div></article>`).join('') + '</div></section>';
  if (entry.derived.length) info += `<section class="sense"><h3>파생어</h3><p>${entry.derived.map(esc).join(', ')}</p></section>`;
  return `<h2 id="wordTitle">${esc(entry.w)}${entry.hn ? `<sup>${entry.hn}</sup>` : ''}</h2>` +
    `<p class="word-meta">${esc(entry.pos)} · ${grades[entry.grade - 1]}</p>` +
    kindHtml(entry) +
    (neighbors ? orderHtml(entry, neighbors) : '') + (info || '<p>이 낱말은 지면에 실린 내용이 전부예요.</p>');
}
