import { esc, spreadForEntry, isIt } from './word.js';
import { createHud, mapHtml, resultHeading, resultActions, setName } from './game-ui.js';
import { randomSet } from './random.js';

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
    if (data?.version !== 1 || !data.sets || typeof data.sets !== 'object' || Array.isArray(data.sets)) return {};
    return Object.fromEntries(Object.entries(data.sets).filter(([set, r]) =>
      /^(?:[1-9]|1[0-2]|random)$/.test(set) && Number.isInteger(r?.found) && r.found >= 0 && r.found <= 5 &&
      Number.isFinite(r.totalMs) && r.totalMs >= 0 && r.totalMs <= 5 * LIMIT));
  } catch { return {}; }
}
export const serializeBests = (sets) => JSON.stringify({ version: 1, sets });
export function resultPraise(records) {
  return [records.some((r) => r.usedIndex) ? '색인과 옆면을 써서 낱말을 찾았어요.' : '책장을 넘기며 낱말의 자리를 살펴봤어요.',
    records.some((r) => r.wrong) ? '틀려도 끝까지 찾았어요.' : '다섯 낱말의 자리를 끝까지 살펴봤어요.'];
}

export function createQuickFind({ readJson, getIndex, open, highlight, position, changed, redraw, idle, closeAbout, collect, debug }) {
  const $ = (id) => document.getElementById(id);
  const hud = createHud('quickfind');
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
    hud.stop();
    clearTimers(); run = null; phase = 'idle'; closePicker(); card.hidden = note.hidden = true;
    button.querySelector('.button-label').textContent = '놀이'; highlight(null); hideHint(); changed();
    $('gameNext').hidden = $('gameFeedbackActions').hidden = true;
  }
  function fail() { stop(); $('status').textContent = '놀이 자료를 읽지 못했습니다. 놀이 버튼으로 다시 시작해 주세요.'; }
  function showFeedback(text) {
    clearTimeout(toastTimer); feedback.textContent = text; feedback.hidden = false; results.hidden = true;
    position(note, side); note.hidden = false;
  }
  function renderPicker() {
    const html = mapHtml('quickfind', '낱말 빨리 찾기', '한 판 5문제 · 문제마다 100초<br>같은 스테이지 번호로 함께 찾아봐요.', source, bests);
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
    if (set.set === 'random') set = randomSet(source, 'quickfind', set.set);
    stop(); run = { set, records: [] }; hud.start(set.items.length); button.querySelector('.button-label').textContent = '그만하기';
    changed(); await problem();
  }
  async function problem() {
    const session = run; phase = 'loading'; highlight(null); note.hidden = true; hideHint();
    hud.update(run.records, summarize(run.records).found);
    current = { ...run.set.items[run.records.length], wrong: 0, flips: 0, usedIndex: false };
    card.hidden = false; $('gameWord').textContent = current.w;
    $('gameMeaning').textContent = current.hint ?? ''; $('gameMeaning').title = current.hint ?? '';
    $('gameNumber').textContent = `${setName('quickfind', run.set.set)} · ${run.records.length + 1}/5`;
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
    hud.timer(elapsed);
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
    if (!timeout) collect(record, 'quickfind').then((added) => {
      if (added && run === session && current === record && phase === 'feedback') feedback.textContent += ' · 도감에 담았어요';
    });
    run.records.push(record);
    hud.update(run.records, summarize(run.records).found, null);
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
    hud.stop(); run = null; phase = 'results'; card.hidden = true; button.querySelector('.button-label').textContent = '놀이'; changed();
    feedback.hidden = true; results.hidden = false;
    results.innerHTML = resultHeading('quickfind', set.set, `${summary.found}/5 찾았어요`, summary, fresh) +
      `<table><caption>문제별 찾기 과정</caption><thead><tr><th scope="col">낱말</th><th scope="col">시간</th><th scope="col">오답</th><th scope="col">넘김</th><th scope="col">색인·옆면</th></tr></thead><tbody>` +
      records.map((r) => `<tr><th scope="row">${esc(r.w)}${r.level ? ` <small class="question-level">${esc(r.level)}</small>` : ''}</th><td>${r.timeout ? '시간 초과' : `${(r.elapsedMs / 1000).toFixed(1)}초`}</td><td>${r.wrong}</td><td>${r.flips}</td><td>${r.usedIndex ? '사용' : '—'}</td></tr>`).join('') +
      `</tbody></table><p>${resultPraise(records).join('<br>')}</p>` +
      (!saved ? '<p>이 브라우저에서는 기록을 저장할 수 없어요.</p>' : '') +
      resultActions(typeof set.set === 'number' && source.sets.findIndex((s) => s.set === set.set) < source.sets.length - 1);
    position(note, side); note.hidden = false;
    results.querySelector('button').focus();
    results.onclick = (e) => {
      const action = e.target.closest('button')?.dataset.action;
      if (!action || !idle()) return;
      if (action === 'retry') start(set).catch(fail);
      else if (action === 'next-stage') start(source.sets[source.sets.findIndex((s) => s.set === set.set) + 1]).catch(fail);
      else { stop(); if (action === 'choose') choose(); else button.focus(); }
    };
  }
  const api = {
    choose, stop,
    startSet(number) { const set = number === 'random' ? { set: number } : source?.sets.find((s) => s.set === Number(number)); if (set) return start(set).catch(fail); },
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
