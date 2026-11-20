import { createHud, mapHtml, resultHeading, resultActions, setName } from './game-ui.js';
import { randomSet } from './random.js';
import { esc, isIt } from './word.js';

const KEY = 'dictionary-baseform-v1';
export const scoreForHints = (hints, revealed = false) => revealed ? 0 : Math.max(1, 3 - hints);
export function hintStage(w, hints) {
  return { text: hints === 1 ? "'-다'로 끝나는 모양으로 바꿔 봐요." : hints >= 2 ? `첫 글자는 '${[...w][0]}'이에요.` : '',
    tab: hints >= 3, label: hints >= 3 ? '정답 보기' : '힌트' };
}
export const classifyAnswer = (target, entry) => entry.id === target.id ? 'correct' : entry.w === target.w ? 'homonym' : 'other';
export function summarize(records) {
  return { score: records.reduce((sum, r) => sum + scoreForHints(r.hints, r.revealed), 0),
    records: records.map(({ hints, wrong, flips, revealed }) => ({ hints, wrong, flips, revealed })) };
}
export function parseBests(text) {
  try {
    const data = JSON.parse(text);
    if (data?.version !== 1 || !data.sets || typeof data.sets !== 'object' || Array.isArray(data.sets)) return {};
    return Object.fromEntries(Object.entries(data.sets).filter(([set, r]) =>
      /^(?:[1-9]|random)$/.test(set) && Number.isInteger(r?.score) && r.score >= 0 && r.score <= 15 &&
      Array.isArray(r.records) && r.records.length === 5 && r.records.every((q) =>
        Number.isInteger(q?.hints) && q.hints >= 0 && q.hints <= 3 &&
        Number.isSafeInteger(q.wrong) && q.wrong >= 0 && Number.isSafeInteger(q.flips) && q.flips >= 0 &&
        typeof q.revealed === 'boolean' && (!q.revealed || q.hints === 3)) &&
      summarize(r.records).score === r.score).map(([set, r]) => [set, summarize(r.records)]));
  } catch { return {}; }
}
export const serializeBests = (sets) => JSON.stringify({ version: 1, sets });
export function resultPraise(records) {
  const unaided = records.filter((r) => !r.revealed && r.hints === 0).length;
  return [unaided ? `${unaided}문제를 힌트 없이 찾았어요.` : '힌트와 풀이를 읽으며 기본형을 살펴봤어요.',
    '모양이 바뀌는 낱말을 끝까지 추적했어요.'];
}

export function createBaseForm({ readJson, getIndex, open, highlight, position, changed, redraw, idle, closeAbout, collect, debug }) {
  const $ = (id) => document.getElementById(id);
  const hud = createHud('baseform');
  const button = $('gameButton'), panel = $('gamePanel'), card = $('gameCard'), note = $('gameNote');
  const feedback = $('gameFeedback'), actions = $('gameFeedbackActions'), results = $('gameResults'), hint = $('gameHint');
  let source, bests = {}, run = null, current, phase = 'idle', side = 'right', loading = false, hintTab = -1;
  let hintClock, toastTimer, pickNumber = 0;
  const entryChunks = new Map();
  try { bests = parseBests(localStorage.getItem(KEY)); } catch {}
  const finding = () => !!run && phase === 'finding';
  function closePicker() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  function hideHint() { clearInterval(hintClock); hintTab = -1; redraw(); }
  function stop() {
    hud.stop();
    clearTimeout(toastTimer); hideHint(); run = null; current = null; phase = 'idle'; closePicker();
    card.hidden = note.hidden = actions.hidden = $('gameNext').hidden = hint.hidden = $('gameSentence').hidden = true;
    card.classList.remove('baseform'); $('gameWord').hidden = false;
    button.querySelector('.button-label').textContent = '놀이'; highlight(null); changed();
  }
  function fail() { stop(); $('status').textContent = '놀이 자료를 읽지 못했습니다. 놀이 버튼으로 다시 시작해 주세요.'; }
  function showFeedback(text) {
    clearTimeout(toastTimer); feedback.textContent = text; feedback.hidden = false; results.hidden = true;
    position(note, side); note.hidden = false; note.scrollTop = 0;
  }
  async function choose() {
    if (!idle() || loading) return;
    closeAbout(); highlight(null); note.hidden = true; loading = true;
    try {
      source ??= await readJson('data/build/games/base-form.json');
      const html = mapHtml('baseform', '기본형 탐정', '한 판 5문제 · 시간 제한 없음<br>굵은 낱말의 기본형을 사전에서 찾아요.', source, bests);
      panel.innerHTML = html; panel.hidden = false; button.setAttribute('aria-expanded', 'true'); panel.querySelector('button').focus();
    } catch { fail(); }
    finally { loading = false; }
  }
  async function start(set) {
    if (!idle()) return;
    if (set.set === 'random') set = randomSet(source, 'baseform', set.set);
    stop(); run = { set, records: [] }; hud.start(set.items.length); button.querySelector('.button-label').textContent = '그만하기'; changed();
    await problem();
  }
  async function problem() {
    const session = run; phase = 'loading'; clearTimeout(toastTimer); hideHint(); highlight(null);
    hud.update(run.records, summarize(run.records).score);
    note.hidden = actions.hidden = $('gameNext').hidden = true;
    current = { ...run.set.items[run.records.length], hints: 0, wrong: 0, flips: 0, revealed: false };
    card.classList.add('baseform'); card.hidden = $('gameSentence').hidden = hint.hidden = false;
    $('gameWord').hidden = $('gameGuide').hidden = true; $('gameTime').hidden = false;
    const form = document.createElement('strong'); form.textContent = current.form;
    $('gameSentence').replaceChildren(document.createTextNode(current.before), form, document.createTextNode(current.after));
    $('gameNumber').textContent = `${setName('baseform', run.set.set)} · ${run.records.length + 1}/5`;
    $('gameMeaning').textContent = ''; $('gameMeaning').title = ''; hint.textContent = '힌트'; hint.disabled = true;
    await open(null, () => run === session);
    if (run === session) { phase = 'finding'; hint.disabled = false; }
  }
  async function finish(revealed) {
    if (!finding()) return;
    const session = run, record = current; phase = 'opening'; hideHint(); $('gameGuide').hidden = hint.hidden = true;
    clearTimeout(toastTimer); record.revealed = revealed;
    if (revealed) {
      await open(record.seq, () => run === session && current === record);
      if (run !== session || current !== record) return;
      side = getIndex().entryPage[record.seq] % 2 ? 'left' : 'right';
    }
    phase = 'feedback'; highlight(record.seq);
    showFeedback(`${revealed ? '여기 있었어요!' : '찾았어요!'} ${record.form} → ${record.w}\n${record.tip}`);
    if (!revealed) collect(record, 'baseform').then((added) => {
      if (added && run === session && current === record && phase === 'feedback') feedback.textContent += ' · 도감에 담았어요';
    });
    run.records.push(record);
    hud.update(run.records, summarize(run.records).score, null);
    actions.innerHTML = '<button type="button" data-action="next">다음 문제</button>';
    actions.hidden = false; actions.querySelector('button').focus();
  }
  function advance() {
    if (!idle() || !run || phase !== 'feedback') return;
    if (run.records.length === run.set.items.length) result(); else problem().catch(fail);
  }
  function result() {
    const { set, records } = run, summary = summarize(records);
    let saved = true;
    try { bests = parseBests(localStorage.getItem(KEY)); } catch { saved = false; }
    const fresh = !bests[set.set] || summary.score > bests[set.set].score;
    if (fresh) {
      bests[set.set] = summary;
      try { localStorage.setItem(KEY, serializeBests(bests)); } catch { saved = false; }
    }
    hud.stop(); run = null; phase = 'results'; card.hidden = actions.hidden = true;
    button.querySelector('.button-label').textContent = '놀이'; changed(); feedback.hidden = true; results.hidden = false;
    results.innerHTML = resultHeading('baseform', set.set, `${summary.score}/15점`, summary, fresh) +
      '<table><caption>문제별 기본형 찾기 과정</caption><thead><tr><th scope="col">활용형 → 기본형</th><th scope="col">힌트</th><th scope="col">오답</th><th scope="col">넘김</th></tr></thead><tbody>' +
      records.map((r) => `<tr><th scope="row">${esc(r.form)} → ${esc(r.w)}${r.level ? ` <small class="question-level">${esc(r.level)}</small>` : ''}${r.revealed ? '<br><small>정답 보기 · 0점</small>' : ''}</th><td>${r.hints}</td><td>${r.wrong}</td><td>${r.flips}</td></tr>`).join('') +
      `</tbody></table><p>${resultPraise(records).join('<br>')}</p>` + (!saved ? '<p>이 브라우저에서는 기록을 저장할 수 없어요.</p>' : '') +
      resultActions(typeof set.set === 'number' && source.sets.findIndex((s) => s.set === set.set) < source.sets.length - 1);
    position(note, side); note.hidden = false; results.querySelector('h2').focus(); note.scrollTop = 0;
    results.onclick = (e) => {
      const action = e.target.closest('button')?.dataset.action;
      if (!action || !idle()) return;
      if (action === 'retry') start(set).catch(fail);
      else if (action === 'next-stage') start(source.sets[source.sets.findIndex((s) => s.set === set.set) + 1]).catch(fail);
      else { stop(); if (action === 'choose') choose(); else button.focus(); }
    };
  }
  hint.addEventListener('click', () => {
    if (!finding() || !idle()) return;
    if (current.hints === 3) { finish(true).catch(fail); return; }
    const stage = hintStage(current.w, ++current.hints);
    $('gameGuide').textContent = stage.text; $('gameGuide').hidden = false; hint.textContent = stage.label;
    if (stage.tab) {
      const index = getIndex(), page = index.entryPage[current.seq];
      hintTab = index.sections.findIndex((s) => page >= s.start && page <= s.end);
      hintClock = setInterval(redraw, 100); redraw();
    }
  });
  actions.addEventListener('click', (e) => { if (e.target.closest('button')?.dataset.action === 'next') advance(); });
  const api = {
    choose, stop,
    startSet(number) { const set = number === 'random' ? { set: number } : source?.sets.find((s) => s.set === Number(number)); if (set) return start(set).catch(fail); },
    get active() { return !!run; }, get finding() { return finding(); }, get tabHint() { return hintTab; },
    get tabs() { return true; }, get hideGuide() { return false; },
    flipped(completed) { if (finding() && completed) current.flips++; },
    async pick(seq, pickedSide) {
      if (!finding()) return;
      const record = current, pick = ++pickNumber;
      side = pickedSide === 'left' ? 'right' : 'left';
      if (seq === record.seq) { await finish(false); return; }
      record.wrong++;
      const c = Math.floor(seq / getIndex().entriesPerChunk);
      try {
        if (!entryChunks.has(c)) entryChunks.set(c, readJson(`data/build/entries/entries-${String(c).padStart(4, '0')}.json`)
          .catch((error) => { entryChunks.delete(c); throw error; }));
        const entry = (await entryChunks.get(c)).find((e) => e.seq === seq);
        if (current !== record || pick !== pickNumber || !finding()) return;
        showFeedback(classifyAnswer(record, entry) === 'homonym' ?
          `기본형은 맞았어요! 그런데 뜻이 다른 '${record.w}'예요. 바로 옆의 '${record.w}'도 살펴봐요.` : isIt(entry.w));
        toastTimer = setTimeout(() => { note.hidden = true; }, 3500);
      } catch { if (current === record && pick === pickNumber && finding()) showFeedback('다른 낱말이에요. 계속 찾아봐요.'); }
    },
  };
  if (debug) window.__baseForm = {
    get state() { return { phase, current: current && { ...current }, records: run?.records.map((r) => ({ ...r })), tabHint: hintTab }; },
    openTarget() {
      if (finding() && idle()) {
        const session = run, record = current;
        return open(record.seq, () => run === session && current === record).catch(fail);
      }
    },
  };
  return api;
}
