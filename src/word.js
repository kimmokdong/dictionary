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

export function entryHtml(entry) {
  const grades = ['학교 가기 전', '1~2학년', '3~4학년', '5~6학년'];
  const circled = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  let info = '';
  if (entry.pronunciation.length) info += `<p>발음 <b>[${entry.pronunciation.map(esc).join(', ')}]</b></p>`;
  if (entry.forms.length) info += `<p>활용 · ${entry.forms.map((f) => esc(f.w) + (f.short.length ? `(${f.short.map(esc).join(', ')})` : '')).join(', ')}</p>`;
  if (entry.origin) info += `<p>원어 · ${esc(entry.origin)}</p>`;
  info += entry.senses.map((s) => `<section class="sense"><h3>${circled[s.n - 1] ?? `(${s.n})`} 예문</h3>` +
    s.sentences.map((x) => `<p class="word-example">${esc(x)}</p>`).join('') +
    (s.dialogue.length ? `<div class="word-dialogue">${s.dialogue.map((x, i) => `<p><span>${i % 2 ? '나' : '가'}</span> ${esc(x)}</p>`).join('')}</div>` : '') + '</section>').join('');
  if (entry.phrases.length) info += '<section class="sense"><h3>관용구·속담</h3>' + entry.phrases.map((p) =>
    `<p><b>${esc(p.w)}</b> <small>${esc(p.type)}</small></p><p class="word-example">${esc(p.def)}</p>`).join('') + '</section>';
  if (entry.derived.length) info += `<section class="sense"><h3>파생어</h3><p>${entry.derived.map(esc).join(', ')}</p></section>`;
  return `<h2 id="wordTitle">${esc(entry.w)}${entry.hn ? `<sup>${entry.hn}</sup>` : ''}</h2>` +
    `<p class="word-meta">${esc(entry.pos)} · ${grades[entry.grade - 1]}</p>` +
    (info || '<p>이 낱말은 지면에 실린 내용이 전부예요.</p>');
}
