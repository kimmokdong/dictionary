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

export function entryHtml(entry, neighbors) {
  const grades = ['학교 가기 전', '1~2학년', '3~4학년', '5~6학년'];
  const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  let info = '';
  if (entry.pronunciation.length) info += `<p>발음 <b>[${entry.pronunciation.map(esc).join(', ')}]</b></p>`;
  if (entry.forms.length) info += `<p>활용 · ${entry.forms.map((f) => esc(f.w) + (f.short.length ? `(${f.short.map(esc).join(', ')})` : '')).join(', ')}</p>`;
  if (entry.origin) info += `<p>원어 · ${esc(entry.origin)}</p>`;
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
    (neighbors ? orderHtml(entry, neighbors) : '') + (info || '<p>이 낱말은 지면에 실린 내용이 전부예요.</p>');
}
