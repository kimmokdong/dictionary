import { esc } from './word.js';

export function starCount(kind, record) {
  if (record === undefined || record === null) return 0;
  if (kind === 'quickfind') return record.found === 5 ? (record.totalMs <= 200000 ? 3 : 2) : record.found >= 1 ? 1 : 0;
  const score = kind === 'baseform' ? record.score : record;
  return (kind === 'baseform' ? [5, 10, 14] : [30, 60, 85]).filter((n) => score >= n).length;
}

export function progressStates(total, outcomes, current) {
  return Array.from({ length: total }, (_, i) => i < outcomes.length ? (outcomes[i] ? 'correct' : 'missed') : i === current ? 'current' : 'waiting');
}

const stars = (count, animated = false) => `<span class="stars${animated ? ' earned-stars' : ''}" role="img" aria-label="별 ${count}개">` +
  [0, 1, 2].map((i) => `<span class="${i < count ? 'earned' : ''}" style="--star-delay:${i * 170}ms">${i < count ? '★' : '☆'}</span>`).join('') + '</span>';

export function mapHtml(kind, title, description, source, bests) {
  return '<button type="button" class="collection-close" data-action="close" aria-label="지도 닫기">×</button>' +
    `<button type="button" data-action="games">놀이 고르기</button><p class="map-label">${title}</p><h2>모험 지도</h2><p>${description}</p>` +
    ['쉬움', '보통', '어려움'].filter((level) => source.sets.some((s) => s.level === level)).map((level) =>
      `<h3>${level}${kind === 'openonce' ? ` · ${level === '쉬움' ? '색인 사용' : '색인 없이'}` : ''}</h3><div class="stage-path">` +
      source.sets.filter((s) => s.level === level).map((s) => {
        const best = bests[s.set], count = starCount(kind, best);
        const record = best === undefined ? '아직 기록이 없어요' : kind === 'quickfind' ? `최고 ${best.found}/5 · ${(best.totalMs / 1000).toFixed(1)}초` :
          `최고 ${kind === 'baseform' ? best.score : best}/${kind === 'baseform' ? 15 : 100}점`;
        return `<button type="button" data-set="${s.set}"><span class="stage-sign"><small>스테이지</small><b>${s.set}</b></span>${stars(count)}<small class="stage-record">${esc(record)}</small></button>`;
      }).join('') + '</div>').join('');
}

export function resultHeading(kind, set, text, record, fresh) {
  return `<h2 tabindex="-1">스테이지 ${set} · ${text}</h2>${stars(starCount(kind, record), true)}` +
    (fresh ? '<p class="new-best">최고 기록 갱신!</p>' : '');
}
export function resultActions(hasNext) {
  return '<div class="game-actions"><button type="button" data-action="retry">다시 하기</button>' +
    (hasNext ? '<button type="button" data-action="next-stage">다음 스테이지 →</button>' : '') +
    '<button type="button" data-action="choose">지도로</button></div>';
}

export function createHud(kind) {
  const $ = (id) => document.getElementById(id);
  let total = 0, score = 0, started = 0, clock;
  function timer(ms) {
    const remaining = Math.max(0, Math.ceil((100000 - ms) / 1000));
    $('gameTime').hidden = false;
    $('gameTime').textContent = kind === 'quickfind' ? `${remaining}초` : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    $('gameTimer').dataset.tone = kind === 'quickfind' ? (remaining <= 10 ? 'danger' : remaining <= 30 ? 'warning' : 'normal') : 'normal';
    $('gameTimer').setAttribute('aria-label', kind === 'quickfind' ? `남은 시간 ${remaining}초` : `걸린 시간 ${Math.floor(ms / 1000)}초`);
    $('gameTimeBar').style.transform = `scaleX(${kind === 'quickfind' ? Math.max(0, 1 - ms / 100000) : 1})`;
  }
  return {
    start(count) {
      clearInterval(clock); total = count; score = 0; started = performance.now();
      $('gameCard').dataset.game = kind; timer(0);
      if (kind !== 'quickfind') clock = setInterval(() => timer(performance.now() - started), 250);
    },
    timer,
    update(records, nextScore, current = records.length) {
      const outcomes = records.map((r) => kind === 'quickfind' ? !r.timeout : kind === 'baseform' ? !r.revealed : r.distance === 0);
      const labels = { correct: '맞힘', missed: '놓침', current: '지금 문제', waiting: '다음 문제' };
      $('gameProgress').innerHTML = progressStates(total, outcomes, current).map((state, i) =>
        `<span class="progress-dot ${state}" role="img" aria-label="${i + 1}번 ${labels[state]}"${state === 'current' ? ' aria-current="step"' : ''}>${state === 'correct' ? '✓' : state === 'missed' ? '✗' : ''}</span>`).join('');
      $('gameScore').textContent = kind === 'quickfind' ? `${nextScore}개 찾음` : `${nextScore}점`;
      if (nextScore > score) {
        $('gameGain').textContent = `+${nextScore - score}`;
        $('gameGain').getAnimations().forEach((a) => a.cancel());
        $('gameGain').animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, offset: .2 }, { opacity: 0, transform: 'translateY(-3px)' }], { duration: 850 });
      }
      score = nextScore;
    },
    stop() { clearInterval(clock); $('gameGain').getAnimations().forEach((a) => a.cancel()); },
  };
}
