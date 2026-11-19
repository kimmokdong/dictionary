import { esc, spreadForEntry, isIt } from './word.js';

const LIMIT = 100000, KEY = 'dictionary-quickfind-v1';
export function timerStage(elapsed) {
  return { remaining: Math.max(0, Math.ceil((LIMIT - elapsed) / 1000)), tab: elapsed >= 30000,
    guide: elapsed >= 60000, expired: elapsed >= LIMIT };
}
export function summarize(records) {
  return { found: records.filter((r) => !r.timeout).length,
    totalMs: records.reduce((sum, r) => sum + (r.timeout ? LIMIT : r.elapsedMs), 0) };
}
export const betterRecord = (next, previous) => !previous || next.found > previous.found ||
  (next.found === previous.found && next.totalMs < previous.totalMs);

export function parseBests(text) {
  try {
    const data = JSON.parse(text);
    if (data?.version !== 1) return {};
    return Object.fromEntries(Object.entries(data.sets ?? {}).filter(([set, r]) =>
      /^(?:[1-9]|1[0-2])$/.test(set) && Number.isInteger(r?.found) && r.found >= 0 && r.found <= 5 &&
      Number.isFinite(r.totalMs) && r.totalMs >= 0 && r.totalMs <= 5 * LIMIT));
  } catch { return {}; }
}
export const serializeBests = (sets) => JSON.stringify({ version: 1, sets });
export function resultPraise(records) {
  return [records.some((r) => r.usedIndex) ? '색인과 옆면을 써서 낱말을 찾았어요.' : '책장을 넘기며 낱말의 자리를 살펴봤어요.',
    records.some((r) => r.wrong) ? '틀려도 끝까지 찾았어요.' : '다섯 낱말의 자리를 끝까지 살펴봤어요.'];
}

export function createQuickFind({ readJson, getIndex, open, highlight, position, changed, redraw, idle, closeAbout, debug }) {
  const $ = (id) => document.getElementById(id);
  const button = $('gameButton'), panel = $('gamePanel'), card = $('gameCard'), note = $('gameNote');
  const feedback = $('gameFeedback'), results = $('gameResults');
  let source, bests = {}, run = null, phase = 'idle', current, started = 0, offset = 0;
  let clock, nextTimer, toastTimer, hintTab = -1, side = 'right', loading = false;
  const entryChunks = new Map();
  try { bests = parseBests(localStorage.getItem(KEY)); } catch {}
  const active = () => !!run;
  const finding = () => !!run && phase === 'finding';
  function closePicker() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  function clearTimers() { clearInterval(clock); clearTimeout(nextTimer); clearTimeout(toastTimer); }
  function hideHint() { hintTab = -1; redraw(); }
  function stop() {
    clearTimers(); run = null; phase = 'idle'; closePicker(); card.hidden = note.hidden = true;
    button.textContent = '놀이'; highlight(null); hideHint(); changed();
    $('gameNext').hidden = $('gameFeedbackActions').hidden = true;
  }
  function fail() { stop(); $('status').textContent = '놀이 자료를 읽지 못했습니다. 놀이 버튼으로 다시 시작해 주세요.'; }
  function showFeedback(text) {
    clearTimeout(toastTimer); feedback.textContent = text; feedback.hidden = false; results.hidden = true;
    position(note, side); note.hidden = false;
  }
  function renderPicker() {
    let html = '<button type="button" data-action="games">놀이 고르기</button><h2>낱말 빨리 찾기</h2><p>한 판 5문제 · 문제마다 100초<br>같은 세트 번호로 함께 찾아봐요.</p>';
    for (const level of ['쉬움', '보통', '어려움']) {
      html += `<h3>${level}</h3><div class="game-sets">` + source.sets.filter((s) => s.level === level).map((s) => {
        const best = bests[s.set];
        return `<button type="button" data-set="${s.set}">${s.set}세트<small>${best ? `최고 ${best.found}/5 · ${(best.totalMs / 1000).toFixed(1)}초` : '아직 기록이 없어요'}</small></button>`;
      }).join('') + '</div>';
    }
    panel.innerHTML = html; panel.hidden = false; button.setAttribute('aria-expanded', 'true');
    panel.querySelector('button')?.focus();
  }
  async function choose() {
    if (!idle() || loading) return;
    closeAbout(); highlight(null); note.hidden = true;
    loading = true;
    try { source ??= await readJson('data/build/games/quick-find.json'); renderPicker(); }
    catch { fail(); }
    finally { loading = false; }
  }
  async function start(set) {
    if (!idle()) return;
    stop(); run = { set, records: [] }; button.textContent = '그만하기';
    changed(); await problem();
  }
  async function problem() {
    const session = run; phase = 'loading'; highlight(null); note.hidden = true; hideHint();
    current = { ...run.set.items[run.records.length], wrong: 0, flips: 0, usedIndex: false };
    card.hidden = false; $('gameWord').textContent = current.w;
    $('gameMeaning').textContent = current.hint ?? ''; $('gameMeaning').title = current.hint ?? '';
    $('gameNumber').textContent = `${run.records.length + 1}/5`;
    $('gameTime').hidden = false;
    $('gameTime').textContent = '100초'; $('gameGuide').hidden = true;
    await open(null, () => run === session);
    if (run !== session) return;
    started = performance.now(); offset = 0; phase = 'finding';
    clock = setInterval(tick, 100); tick();
  }
  function tick() {
    if (!finding()) return;
    const elapsed = performance.now() - started + offset, timer = timerStage(elapsed);
    $('gameTime').textContent = `${timer.remaining}초`;
    const index = getIndex(), page = index.entryPage[current.seq];
    hintTab = timer.tab ? index.sections.findIndex((s) => page >= s.start && page <= s.end) : -1;
    $('gameGuide').hidden = !timer.guide;
    if (timer.guide) {
      const left = spreadForEntry(index, current.seq);
      $('gameGuide').textContent = `${index.guides[Math.max(0, left - 1)][0]} ~ ${index.guides[Math.min(index.pageCount - 1, left)][1]} 사이에 있어요`;
    }
    redraw();
    if (timer.expired) finish(true).catch(fail);
  }
  async function finish(timeout) {
    if (!finding()) return;
    phase = 'feedback'; clearInterval(clock); clearTimeout(toastTimer); hideHint();
    const session = run, record = current;
    record.timeout = timeout; record.elapsedMs = timeout ? null : Math.min(LIMIT, Math.round(performance.now() - started + offset));
    if (timeout) {
      await open(record.seq, () => run === session);
      if (run !== session) return;
      side = getIndex().entryPage[record.seq] % 2 ? 'left' : 'right';
    }
    highlight(record.seq); showFeedback(timeout ? '여기 있었어요' : '찾았어요! 낱말의 자리를 잘 찾았어요.');
    run.records.push(record);
    nextTimer = setTimeout(() => {
      if (run !== session) return;
      if (run.records.length === run.set.items.length) result(); else problem().catch(fail);
    }, timeout ? 2000 : 1000);
  }
  function result() {
    const { set, records } = run, summary = summarize(records);
    let saved = true;
    try { bests = parseBests(localStorage.getItem(KEY)); } catch { saved = false; }
    const fresh = betterRecord(summary, bests[set.set]);
    if (fresh) {
      bests[set.set] = summary;
      try { localStorage.setItem(KEY, serializeBests(bests)); } catch { saved = false; }
    }
    run = null; phase = 'results'; card.hidden = true; button.textContent = '놀이'; changed();
    feedback.hidden = true; results.hidden = false;
    results.innerHTML = `<h2>${set.set}세트 · ${summary.found}/5 찾았어요</h2>` +
      (fresh ? '<p class="new-best">새 기록!</p>' : '') +
      `<table><caption>문제별 찾기 과정</caption><thead><tr><th scope="col">낱말</th><th scope="col">시간</th><th scope="col">오답</th><th scope="col">넘김</th><th scope="col">색인·옆면</th></tr></thead><tbody>` +
      records.map((r) => `<tr><th scope="row">${esc(r.w)}</th><td>${r.timeout ? '시간 초과' : `${(r.elapsedMs / 1000).toFixed(1)}초`}</td><td>${r.wrong}</td><td>${r.flips}</td><td>${r.usedIndex ? '사용' : '—'}</td></tr>`).join('') +
      `</tbody></table><p>${resultPraise(records).join('<br>')}</p>` +
      (!saved ? '<p>이 브라우저에서는 기록을 저장할 수 없어요.</p>' : '') +
      '<div class="game-actions"><button type="button" data-action="retry">다시 하기</button><button type="button" data-action="choose">다른 세트</button><button type="button" data-action="exit">사전으로</button></div>';
    position(note, side); note.hidden = false;
    results.querySelector('button').focus();
    results.onclick = (e) => {
      const action = e.target.closest('button')?.dataset.action;
      if (!action || !idle()) return;
      if (action === 'retry') start(set).catch(fail);
      else { stop(); if (action === 'choose') choose(); else button.focus(); }
    };
  }
  const api = {
    choose, stop,
    startSet(number) { const set = source?.sets.find((s) => s.set === number); if (set) return start(set).catch(fail); },
    get active() { return active(); }, get finding() { return finding(); }, get tabHint() { return hintTab; },
    get tabs() { return true; }, get hideGuide() { return false; },
    flipped(completed, kind) {
      if (!finding()) return;
      if (completed) current.flips++;
      if (['tab', 'bundle'].includes(kind)) current.usedIndex = true;
    },
    async pick(seq, pickedSide) {
      if (!finding()) return;
      tick(); if (!finding()) return;
      side = pickedSide === 'left' ? 'right' : 'left';
      if (seq === current.seq) { await finish(false); return; }
      current.wrong++;
      const record = current, c = Math.floor(seq / getIndex().entriesPerChunk);
      try {
        if (!entryChunks.has(c)) entryChunks.set(c, readJson(`data/build/entries/entries-${String(c).padStart(4, '0')}.json`)
          .catch((error) => { entryChunks.delete(c); throw error; }));
        const entry = (await entryChunks.get(c)).find((e) => e.seq === seq);
        if (current !== record || !finding()) return;
        showFeedback(isIt(entry.w));
        toastTimer = setTimeout(() => { note.hidden = true; }, 1500);
      } catch { if (current === record && finding()) showFeedback('다른 낱말이에요. 계속 찾아봐요.'); }
    },
  };
  if (debug) window.__quickFind = {
    get state() { return { phase, current: current && { ...current }, records: run?.records.map((r) => ({ ...r })), tabHint: hintTab }; },
    advance(seconds) { if (finding() && Number.isFinite(seconds) && seconds >= 0) { offset += seconds * 1000; tick(); } },
    openTarget() { if (finding()) { const session = run; return open(current.seq, () => run === session).catch(fail); } },
  };
  return api;
}
