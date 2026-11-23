import { createHud, mapHtml, resultHeading, resultActions, setName } from './game-ui.js';
import { randomSet } from './random.js';
import { esc, isIt, topic } from './word.js';

const KEY = 'dictionary-wordkind-v1';
export const KINDS = ['고유어', '한자어', '외래어'];
export const MAX_SCORE = 16;
// 한 번에 맞히면 2점, 두 번째에 맞히면 1점, 그 뒤는 0점.
export const scoreForTries = (tries, correct) => (correct ? Math.max(0, 3 - tries) : 0);
export const summarize = (records) => records.reduce((sum, r) => sum + scoreForTries(r.tries, r.correct), 0);
// 사전의 원어 표시로 어종을 짐작하는 단서 문장.
export function originClue(origin) {
  if (!origin) return '사전에 원어 표시가 없어요.';
  return `사전의 원어: ${origin}`;
}
export function parseBests(text) {
  try {
    const data = JSON.parse(text);
    if (data?.version !== 1 || !data.sets || typeof data.sets !== 'object' || Array.isArray(data.sets)) return {};
    return Object.fromEntries(Object.entries(data.sets).filter(([set, score]) =>
      /^(?:[1-9]|random)$/.test(set) && Number.isInteger(score) && score >= 0 && score <= MAX_SCORE));
  } catch { return {}; }
}
export const serializeBests = (sets) => JSON.stringify({ version: 1, sets });
export function resultPraise(records) {
  const first = records.filter((r) => r.correct && r.tries === 1).length;
  return [first ? `${records.length}문제 중 ${first}문제를 한 번에 맞혔어요.` : '틀린 낱말도 원어를 보며 다시 생각했어요.',
    '사전의 원어 표시로 낱말이 어디서 왔는지 살펴봤어요.'];
}

export function createWordKind({ readJson, getIndex, open, highlight, position, changed, redraw, idle, closeAbout, collect, debug }) {
  const $ = (id) => document.getElementById(id);
  const hud = createHud('wordkind');
  const button = $('gameButton'), panel = $('gamePanel'), card = $('gameCard'), note = $('gameNote');
  const feedback = $('gameFeedback'), actions = $('gameFeedbackActions'), results = $('gameResults'), hint = $('gameHint');
  let source, bests = {}, run = null, current, phase = 'idle', side = 'right', loading = false, hintTab = -1;
  let hintClock, toastTimer, pickNumber = 0;
  const chunks = new Map();
  try { bests = parseBests(localStorage.getItem(KEY)); } catch {}
  const finding = () => !!run && phase === 'finding';
  // 낱말 묶음(entries)·쪽지 묶음(notes)을 한 번만 읽는다.
  function chunk(kind, seq) {
    const c = Math.floor(seq / getIndex().entriesPerChunk), key = `${kind}-${c}`;
    if (!chunks.has(key)) chunks.set(key, readJson(`data/build/${kind}/${kind}-${String(c).padStart(4, '0')}.json`)
      .catch((error) => { chunks.delete(key); throw error; }));
    return chunks.get(key).then((rows) => rows.find((e) => e.seq === seq));
  }
  function closePicker() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  function hideHint() { clearInterval(hintClock); hintTab = -1; redraw(); }
  function stop() {
    hud.stop();
    clearTimeout(toastTimer); hideHint(); run = null; current = null; phase = 'idle'; closePicker();
    card.hidden = note.hidden = actions.hidden = $('gameNext').hidden = hint.hidden = true;
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
      source ??= await readJson('data/build/games/word-kind.json');
      panel.innerHTML = mapHtml('wordkind', '우리말 분류', '한 판 8문제 · 시간 제한 없음<br>낱말을 사전에서 찾아 원어를 보고 고유어·한자어·외래어로 나눠요.', source, bests);
      panel.hidden = false; button.setAttribute('aria-expanded', 'true'); panel.querySelector('button').focus();
    } catch { fail(); }
    finally { loading = false; }
  }
  async function start(set) {
    if (!idle()) return;
    if (set.set === 'random') set = randomSet(source, 'wordkind', set.set);
    stop(); run = { set, records: [] }; hud.start(set.items.length); button.querySelector('.button-label').textContent = '그만하기'; changed();
    await problem();
  }
  async function problem() {
    const session = run; phase = 'loading'; clearTimeout(toastTimer); hideHint(); highlight(null);
    hud.update(run.records, summarize(run.records));
    note.hidden = actions.hidden = $('gameNext').hidden = true;
    current = { ...run.set.items[run.records.length], tries: 0, correct: false, wrong: 0, flips: 0, hints: 0, chosen: [] };
    card.hidden = hint.hidden = false; $('gameWord').hidden = false; $('gameGuide').hidden = true; $('gameTime').hidden = false;
    $('gameWord').textContent = current.w;
    $('gameNumber').textContent = `${setName('wordkind', run.set.set)} · ${run.records.length + 1}/${run.set.items.length}`;
    $('gameMeaning').textContent = '사전에서 찾아 눌러 보세요'; $('gameMeaning').title = '';
    hint.textContent = '색인 힌트'; hint.disabled = true;
    await open(null, () => run === session);
    if (run === session) { phase = 'finding'; hint.disabled = false; }
  }
  // 낱말을 찾으면(또는 바로 펼치면) 원어 단서를 보여 주고 어종을 고르게 한다.
  async function found(revealed) {
    if (!finding()) return;
    const session = run, record = current; phase = 'opening'; hideHint(); hint.hidden = true; $('gameGuide').hidden = true;
    clearTimeout(toastTimer); record.revealed = revealed;
    if (revealed) {
      await open(record.seq, () => run === session && current === record);
      if (run !== session || current !== record) return;
      side = getIndex().entryPage[record.seq] % 2 ? 'left' : 'right';
    }
    highlight(record.seq);
    let origin;
    try { origin = (await chunk('notes', record.seq))?.origin; } catch {}
    if (run !== session || current !== record) return;
    record.origin = origin;
    // 도감 알림은 정답을 알려 준 뒤에 붙인다.
    if (!revealed) collect(record, 'wordkind').then((added) => {
      record.collected = added;
      if (added && run === session && current === record && phase === 'feedback') feedback.textContent += ' · 도감에 담았어요';
    });
    phase = 'classifying'; $('gameMeaning').textContent = '어떤 말일까요?';
    showFeedback(`${revealed ? '여기 있어요.' : '찾았어요!'} ${originClue(origin)}\n${topic(record.w)} 어떤 말일까요?`);
    renderChoices();
  }
  function renderChoices() {
    actions.innerHTML = '<p class="kind-rule">원어가 한자면 한자어, 외국 글자면 외래어, 원어가 없으면 고유어예요.</p><div class="kind-choices">' +
      KINDS.map((k) => `<button type="button" data-kind="${k}"${current.chosen.includes(k) ? ' disabled' : ''}>${k}</button>`).join('') + '</div>';
    actions.hidden = false; actions.querySelector('button:not([disabled])').focus();
  }
  function answer(kind) {
    if (!run || phase !== 'classifying' || !idle() || current.chosen.includes(kind)) return;
    const record = current; record.tries++; record.chosen.push(kind);
    if (kind !== record.kind && record.tries < 2) {
      feedback.textContent = `'${kind}'는 아니에요. ${originClue(record.origin)}\n한 번 더 골라 보세요.`;
      renderChoices(); return;
    }
    record.correct = kind === record.kind; phase = 'feedback';
    feedback.textContent = `${record.correct ? '맞았어요!' : '아쉬워요.'} ${topic(record.w)} ${record.kind}예요.` +
      (record.origin ? ` (원어 ${record.origin})` : '') + (record.tip ? `\n${record.tip}` : '') + (record.collected ? ' · 도감에 담았어요' : '');
    run.records.push(record);
    hud.update(run.records, summarize(run.records), null);
    actions.innerHTML = '<button type="button" data-action="next">다음 문제</button>';
    actions.querySelector('button').focus();
  }
  function advance() {
    if (!idle() || !run || phase !== 'feedback') return;
    if (run.records.length === run.set.items.length) result(); else problem().catch(fail);
  }
  function result() {
    const { set, records } = run, score = summarize(records), max = records.length * 2;
    let saved = true;
    try { bests = parseBests(localStorage.getItem(KEY)); } catch { saved = false; }
    const fresh = bests[set.set] === undefined || score > bests[set.set];
    if (fresh) {
      bests[set.set] = score;
      try { localStorage.setItem(KEY, serializeBests(bests)); } catch { saved = false; }
    }
    hud.stop(); run = null; phase = 'results'; card.hidden = actions.hidden = true;
    button.querySelector('.button-label').textContent = '놀이'; changed(); feedback.hidden = true; results.hidden = false;
    results.innerHTML = resultHeading('wordkind', set.set, `${score}/${max}점`, score, fresh) +
      '<table><caption>문제별 분류 과정</caption><thead><tr><th scope="col">낱말</th><th scope="col">어종</th><th scope="col">고른 답</th><th scope="col">점수</th></tr></thead><tbody>' +
      records.map((r) => `<tr><th scope="row">${esc(r.w)}${r.level ? ` <small class="question-level">${esc(r.level)}</small>` : ''}</th><td>${esc(r.kind)}</td><td>${r.chosen.map(esc).join(' → ')}</td><td>${scoreForTries(r.tries, r.correct)}점</td></tr>`).join('') +
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
  // 힌트: 처음엔 그 낱말의 색인 탭을 깜빡이고, 다음엔 바로 펼친다.
  function onHint() {
    if (!finding() || !idle()) return;
    if (current.hints === 1) { current.hints = 2; found(true).catch(fail); return; }
    current.hints = 1; hint.textContent = '바로 펼치기';
    const index = getIndex(), page = index.entryPage[current.seq];
    hintTab = index.sections.findIndex((s) => page >= s.start && page <= s.end);
    hintClock = setInterval(redraw, 100); redraw();
  }
  function onActions(e) {
    const target = e.target.closest('button');
    if (!run || !target) return;
    if (target.dataset.kind) answer(target.dataset.kind);
    else if (target.dataset.action === 'next') advance();
  }
  const api = {
    choose, stop,
    startSet(number) {
      const set = number === 'random' ? { set: number } : source?.sets.find((s) => s.set === Number(number));
      if (set) return start(set).catch(fail);
    },
    get active() { return !!run; }, get finding() { return finding(); }, get tabHint() { return hintTab; },
    get tabs() { return true; }, get hideGuide() { return false; },
    flipped(completed) { if (finding() && completed) current.flips++; },
    async pick(seq, pickedSide) {
      if (!finding()) return;
      const record = current, pick = ++pickNumber;
      side = pickedSide === 'left' ? 'right' : 'left';
      if (seq === record.seq) { await found(false); return; }
      record.wrong++;
      try {
        const entry = await chunk('entries', seq);
        if (current !== record || pick !== pickNumber || !finding()) return;
        showFeedback(entry.w === record.w ? `낱말은 맞았어요! 그런데 뜻이 다른 '${record.w}'예요. 바로 옆도 살펴봐요.` : isIt(entry.w));
        toastTimer = setTimeout(() => { note.hidden = true; }, 2500);
      } catch { if (current === record && pick === pickNumber && finding()) showFeedback('다른 낱말이에요. 계속 찾아봐요.'); }
    },
  };
  // 힌트 단추와 쪽지 단추는 다른 놀이와 함께 쓰므로, 이 놀이가 진행 중일 때만 반응한다.
  hint.addEventListener('click', () => { if (run) onHint(); });
  actions.addEventListener('click', onActions);
  if (debug) window.__wordKind = {
    get state() { return { phase, current: current && { ...current }, records: run?.records.map((r) => ({ ...r })), tabHint: hintTab }; },
    openTarget() {
      if (finding() && idle()) {
        const session = run, record = current;
        return open(record.seq, () => run === session && current === record).catch(fail);
      }
    },
    answer,
  };
  return api;
}
