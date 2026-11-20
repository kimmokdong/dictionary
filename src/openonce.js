import { esc, isIt } from './word.js';

const KEY = 'dictionary-openonce-v1';
export const SCORE_BANDS = [[0, 10], [20, 8], [60, 6], [150, 4], [400, 2], [Infinity, 1]];
export function spreadDistance(target, left, pageCount) {
  const first = Math.max(1, left), last = Math.min(pageCount, left + 1);
  return Math.max(first - target, target - last, 0);
}
export const scoreForDistance = (distance) => SCORE_BANDS.find(([limit]) => distance <= limit)[1];
export function feedbackText(target, left, pageCount) {
  const distance = spreadDistance(target, left, pageCount);
  return distance === 0 ? '딱 맞혔어요!' : `목표는 ${target < Math.max(1, left) ? '앞쪽' : '뒤쪽'}으로 ${distance}쪽`;
}
export function parseBests(text) {
  try {
    const data = JSON.parse(text);
    if (data?.version !== 1 || !data.sets || typeof data.sets !== 'object' || Array.isArray(data.sets)) return {};
    return Object.fromEntries(Object.entries(data.sets).filter(([set, score]) =>
      /^[1-8]$/.test(set) && Number.isInteger(score) && score >= 0 && score <= 100));
  } catch { return {}; }
}
export const serializeBests = (sets) => JSON.stringify({ version: 1, sets });
export function resultPraise(records) {
  const close = records.filter((r) => r.distance <= 20).length;
  return [close ? `${close}문제를 20쪽 안으로 펼쳤어요.` : '낱말의 자리를 짐작하며 열 문제를 끝까지 펼쳤어요.',
    '옆면의 두께와 낱말의 순서를 살펴봤어요.'];
}

export function createOpenOnce({ readJson, getIndex, getLeft, open, highlight, position, changed, redraw, idle, closeAbout, collect, debug }) {
  const $ = (id) => document.getElementById(id);
  const button = $('gameButton'), panel = $('gamePanel'), card = $('gameCard'), note = $('gameNote');
  const feedback = $('gameFeedback'), actions = $('gameFeedbackActions'), results = $('gameResults'), next = $('gameNext');
  let source, bests = {}, run = null, current, phase = 'idle', side = 'right', loading = false, pickNumber = 0;
  const entryChunks = new Map();
  try { bests = parseBests(localStorage.getItem(KEY)); } catch {}
  const active = () => !!run;
  const finding = () => active() && ['guessing', 'checking'].includes(phase);
  function closePicker() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  function stop() {
    run = null; current = null; phase = 'idle'; closePicker();
    card.hidden = note.hidden = actions.hidden = next.hidden = true;
    button.querySelector('.button-label').textContent = '놀이'; highlight(null); changed(); redraw();
  }
  function fail() { stop(); $('status').textContent = '놀이 자료를 읽지 못했습니다. 놀이 버튼으로 다시 시작해 주세요.'; }
  function showFeedback(text) {
    feedback.textContent = text; feedback.hidden = false; results.hidden = true;
    position(note, side); note.hidden = false;
  }
  function collectFound() {
    const session = run, record = current, text = feedback.textContent;
    collect(record, 'openonce').then((added) => {
      if (added && run === session && current === record && feedback.textContent === text && !note.hidden) feedback.textContent += ' · 도감에 담았어요';
    });
  }
  async function choose() {
    if (!idle() || loading) return;
    closeAbout(); highlight(null); note.hidden = true; loading = true;
    try {
      source ??= await readJson('data/build/games/open-once.json');
      let html = '<button type="button" data-action="games">놀이 고르기</button><h2>한 번에 펼치기</h2><p>한 판 10문제 · 시간 제한 없음<br>한 번에 낱말의 자리를 짐작해 펼쳐요.</p>';
      for (const level of ['쉬움', '어려움']) {
        html += `<h3>${level} · ${level === '쉬움' ? '색인 사용' : '색인 없이'}</h3><div class="game-sets">` +
          source.sets.filter((s) => s.level === level).map((s) => `<button type="button" data-set="${s.set}" class="${bests[s.set] === undefined ? '' : 'recorded'}">${s.set}세트${bests[s.set] === undefined ? '' : '<span class="record-stamp" aria-hidden="true">완</span>'}<small>${bests[s.set] === undefined ? '아직 기록이 없어요' : `최고 ${bests[s.set]}/100점`}</small></button>`).join('') + '</div>';
      }
      panel.innerHTML = html; panel.hidden = false; button.setAttribute('aria-expanded', 'true'); panel.querySelector('button').focus();
    } catch { fail(); }
    finally { loading = false; }
  }
  async function start(set) {
    if (!idle()) return;
    stop(); run = { set, records: [] }; button.querySelector('.button-label').textContent = '그만하기'; changed(); redraw();
    await problem();
  }
  async function problem() {
    const session = run; phase = 'loading'; highlight(null); note.hidden = actions.hidden = next.hidden = true;
    current = { ...run.set.items[run.records.length] };
    card.hidden = false; $('gameWord').textContent = current.w;
    $('gameNumber').textContent = `${run.records.length + 1}/10`;
    $('gameMeaning').textContent = '한 번에 펼쳐 보세요'; $('gameMeaning').title = '';
    $('gameTime').textContent = ''; $('gameTime').hidden = true; $('gameGuide').hidden = true;
    await open(null, () => run === session);
    if (run === session) phase = 'guessing';
  }
  function advance() {
    if (!idle() || !active() || !['feedback', 'checking'].includes(phase)) return;
    if (run.records.length === run.set.items.length) result(); else problem().catch(fail);
  }
  function result() {
    const { set, records } = run, total = records.reduce((sum, r) => sum + r.score, 0);
    let saved = true;
    try { bests = parseBests(localStorage.getItem(KEY)); } catch { saved = false; }
    const fresh = bests[set.set] === undefined || total > bests[set.set];
    if (fresh) {
      bests[set.set] = total;
      try { localStorage.setItem(KEY, serializeBests(bests)); } catch { saved = false; }
    }
    run = null; phase = 'results'; card.hidden = actions.hidden = next.hidden = true;
    button.querySelector('.button-label').textContent = '놀이'; changed(); redraw(); feedback.hidden = true; results.hidden = false;
    results.innerHTML = `<h2 tabindex="-1">${set.set}세트 · ${total}/100점</h2>` + (fresh ? '<p class="new-best">새 기록!</p>' : '') +
      '<table><caption>문제별 펼치기 과정</caption><thead><tr><th scope="col">낱말</th><th scope="col">거리</th><th scope="col">점수</th></tr></thead><tbody>' +
      records.map((r) => `<tr><th scope="row">${esc(r.w)}</th><td>${r.distance}쪽</td><td>${r.score}점</td></tr>`).join('') +
      `</tbody></table><p>${resultPraise(records).join('<br>')}</p>` + (!saved ? '<p>이 브라우저에서는 기록을 저장할 수 없어요.</p>' : '') +
      '<div class="game-actions"><button type="button" data-action="retry">다시 하기</button><button type="button" data-action="choose">다른 세트</button><button type="button" data-action="exit">사전으로</button></div>';
    position(note, side); note.hidden = false; results.querySelector('h2').focus(); note.scrollTop = 0;
    results.onclick = (e) => {
      const action = e.target.closest('button')?.dataset.action;
      if (!action || !idle()) return;
      if (action === 'retry') start(set).catch(fail);
      else { stop(); if (action === 'choose') choose(); else button.focus(); }
    };
  }
  actions.addEventListener('click', (e) => {
    const action = e.target.closest('button')?.dataset.action;
    if (!idle() || phase !== 'feedback') return;
    if (action === 'check') {
      phase = 'checking'; note.hidden = actions.hidden = true; next.hidden = false;
      $('gameMeaning').textContent = '넘겨서 낱말을 확인해 보세요'; next.focus();
    } else if (action === 'next') advance();
  });
  next.addEventListener('click', advance);
  const api = {
    choose, stop,
    startSet(number) { const set = source?.sets.find((s) => s.set === number); if (set) return start(set).catch(fail); },
    get active() { return active(); }, get finding() { return finding(); }, get tabHint() { return -1; },
    get tabs() { return !active() || run.set.level !== '어려움'; }, get hideGuide() { return active(); },
    flipped(completed) {
      if (!completed || phase !== 'guessing' || !active()) return;
      phase = 'feedback';
      const index = getIndex(), target = index.entryPage[current.seq], left = getLeft();
      current.distance = spreadDistance(target, left, index.pageCount); current.score = scoreForDistance(current.distance);
      run.records.push(current); side = target === left + 1 ? 'left' : 'right';
      showFeedback(`${feedbackText(target, left, index.pageCount)} · ${current.score}점`);
      if (current.distance === 0) collectFound();
      actions.innerHTML = '<button type="button" data-action="check">넘겨서 확인하기</button><button type="button" data-action="next">다음 문제</button>';
      actions.hidden = false; actions.querySelector('button').focus();
    },
    async pick(seq, pickedSide) {
      if (phase !== 'checking' || !active()) return;
      const pick = ++pickNumber;
      side = pickedSide === 'left' ? 'right' : 'left';
      if (seq === current.seq) { highlight(seq); showFeedback('여기 있어요!'); collectFound(); return; }
      const record = current, c = Math.floor(seq / getIndex().entriesPerChunk);
      try {
        if (!entryChunks.has(c)) entryChunks.set(c, readJson(`data/build/entries/entries-${String(c).padStart(4, '0')}.json`)
          .catch((error) => { entryChunks.delete(c); throw error; }));
        const entry = (await entryChunks.get(c)).find((e) => e.seq === seq);
        if (current === record && pick === pickNumber && phase === 'checking') showFeedback(isIt(entry.w));
      } catch { if (current === record && pick === pickNumber && phase === 'checking') showFeedback('다른 낱말이에요. 계속 찾아봐요.'); }
    },
  };
  if (debug) window.__openOnce = {
    get state() { return { phase, current: current && { ...current }, records: run?.records.map((r) => ({ ...r })), tabs: api.tabs }; },
    async openTarget() {
      if (!finding() || !idle()) return;
      const session = run, record = current, wanted = () => run === session && current === record;
      try { await open(record.seq, wanted); if (wanted()) api.flipped(true); } catch { if (wanted()) fail(); }
    },
  };
  return api;
}
