import { TABS, tabIndex, sortKey } from '../scripts/data/sort.mjs';
import { esc } from './word.js';

export { TABS, tabIndex };
export const KEY = 'dictionary-collection-v1';
const SOURCES = { star: '★', quickfind: '빨리 찾기', openonce: '한 번에 펼치기', baseform: '기본형 탐정', wordkind: '우리말 분류' };
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
function validWord(id, word) {
  return /^\d+$/.test(id) && object(word) && typeof word.w === 'string' && tabIndex(word.w) >= 0 &&
    Number.isSafeInteger(word.hn) && word.hn >= 0 && Number.isSafeInteger(word.seq) && word.seq >= 0 &&
    typeof word.from === 'string' && Object.hasOwn(SOURCES, word.from) && Number.isSafeInteger(word.at) && word.at >= 0;
}
export function parseCollection(text) {
  try {
    const data = JSON.parse(text);
    if (data?.version !== 1 || !object(data.words)) return {};
    return Object.fromEntries(Object.entries(data.words).filter(([id, word]) => validWord(id, word))
      .map(([id, { w, hn, seq, from, at }]) => [id, { w, hn, seq, from, at }]));
  } catch { return {}; }
}
export const serializeCollection = (words) => JSON.stringify({ version: 1, words });
export function addWord(words, entry, from, at = Date.now()) {
  const word = { w: entry.w, hn: entry.hn, seq: entry.seq, from, at };
  if (Object.hasOwn(words, entry.id) || !validWord(entry.id, word)) return words;
  return { ...words, [entry.id]: word };
}
export function removeWord(words, id) {
  if (!Object.hasOwn(words, id)) return words;
  const next = { ...words }; delete next[id]; return next;
}
export function tabCounts(words) {
  const counts = TABS.map(() => 0);
  for (const word of Object.values(words)) { const tab = tabIndex(word.w); if (tab >= 0) counts[tab]++; }
  return counts;
}
export const isComplete = (words) => tabCounts(words).every((count) => count > 0);

export function createCollection({ readJson, getIndex, idle, busy, open, closeOthers, debug }) {
  const $ = (id) => document.getElementById(id);
  const button = $('collectionButton'), panel = $('collectionPanel'), star = $('collectWord');
  let words = {}, saved = true, tab = 0, selected = null;
  const chunks = new Map();
  try { words = parseCollection(localStorage.getItem(KEY)); } catch { saved = false; }
  function save() {
    try { localStorage.setItem(KEY, serializeCollection(words)); saved = true; } catch { saved = false; }
  }
  save();
  function updateStar() {
    const has = !!selected && Object.hasOwn(words, selected.id);
    star.disabled = !selected; star.textContent = has ? '★' : '☆';
    star.setAttribute('aria-pressed', String(has));
    star.setAttribute('aria-label', has ? '도감에서 빼기' : '도감에 담기');
  }
  function render() {
    const counts = tabCounts(words);
    const list = Object.entries(words).filter(([, word]) => tabIndex(word.w) === tab).sort((a, b) => {
      const ak = sortKey(a[1].w), bk = sortKey(b[1].w);
      return (ak < bk ? -1 : ak > bk ? 1 : 0) || a[1].hn - b[1].hn || a[1].seq - b[1].seq;
    });
    panel.innerHTML = `<button type="button" class="collection-close" aria-label="도감 닫기">×</button><h2>낱말 도감 · ${Object.keys(words).length}개 모음</h2>` +
      (saved ? '' : '<p role="status">이 브라우저에서는 도감을 저장할 수 없어요</p>') +
      '<div class="collection-tabs" role="group" aria-label="자음별 모은 낱말">' + TABS.map((letter, i) =>
        `<button type="button" data-tab="${i}" aria-pressed="${tab === i}" aria-label="${letter} · ${counts[i]}개" style="--tab-color:hsl(${(i * 26 + 10) % 360} 60% 46%)" class="${counts[i] ? 'stamped' : 'empty'}"><b>${letter}</b><small>${counts[i] ? `${counts[i]}개` : '빈칸'}</small></button>`).join('') + '</div>' +
      (isComplete(words) ? '<p class="collection-complete">도감 완성!</p>' : '') +
      `<h3>${TABS[tab]} 낱말 · ${list.length}개</h3><ul class="collection-words">` + list.map(([id, word]) =>
        `<li><button type="button" data-word="${id}"><span>${esc(word.w)}${word.hn ? `<sup>${word.hn}</sup>` : ''}</span><small>${SOURCES[word.from]}</small></button></li>`).join('') +
      (list.length ? '' : '<li class="collection-empty">낱말을 찾아 이 칸에 도장을 찍어 봐요.</li>') +
      '</ul><button type="button" class="collection-clear">모두 지우기</button>';
  }
  function changed() { save(); updateStar(); if (!panel.hidden) render(); }
  function close() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  async function entryAt(seq) {
    const c = Math.floor(seq / getIndex().entriesPerChunk);
    if (!chunks.has(c)) chunks.set(c, readJson(`data/build/entries/entries-${String(c).padStart(4, '0')}.json`)
      .catch((error) => { chunks.delete(c); throw error; }));
    return (await chunks.get(c)).find((entry) => entry.seq === seq);
  }
  async function collect(found, from) {
    try {
      const entry = await entryAt(found.seq);
      if (!entry || entry.id !== found.id) return false;
      const next = addWord(words, entry, from);
      if (next === words) return false;
      words = next; changed(); return true;
    } catch { $('status').textContent = '낱말을 도감에 담지 못했어요. 다시 찾아 주세요.'; return false; }
  }
  star.addEventListener('click', () => {
    if (!selected || !idle()) return;
    words = Object.hasOwn(words, selected.id) ? removeWord(words, selected.id) : addWord(words, selected, 'star');
    changed();
  });
  button.addEventListener('click', () => {
    if (!idle()) return;
    if (!panel.hidden) { close(); return; }
    closeOthers(); tab = Math.max(0, tabCounts(words).findIndex((count) => count));
    render(); panel.hidden = false; button.setAttribute('aria-expanded', 'true'); panel.querySelector('[data-tab]').focus();
  });
  panel.addEventListener('click', async (event) => {
    if (!idle()) return;
    const target = event.target.closest('button');
    if (!target) return;
    if (target.classList.contains('collection-close')) { close(); button.focus(); }
    else if (target.dataset.tab !== undefined) {
      tab = Number(target.dataset.tab); render(); panel.querySelector(`[data-tab="${tab}"]`).focus();
    } else if (target.classList.contains('collection-clear')) {
      if (confirm('모은 낱말을 모두 지울까요?')) { words = {}; changed(); panel.querySelector('.collection-clear').focus(); }
    } else if (target.dataset.word) {
      const id = target.dataset.word, word = words[id];
      busy(true);
      try {
        const entry = await entryAt(word.seq);
        if (!entry || entry.id !== id || !Number.isInteger(getIndex().entryPage[word.seq])) {
          $('status').textContent = '낱말 자리를 찾지 못했어요'; return;
        }
        close(); await open(entry);
      } catch { $('status').textContent = '낱말 자리를 찾지 못했어요'; }
      finally { busy(false); }
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!panel.contains(event.target) && !button.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) { close(); button.focus(); }
  });
  updateStar();
  if (debug) window.__collection = { get state() { return { words: structuredClone(words), saved, complete: isComplete(words) }; } };
  return { collect, close, entryAt, select(entry) { selected = entry; updateStar(); } };
}
