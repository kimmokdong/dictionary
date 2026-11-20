import { createQuickFind } from './quickfind.js';
import { createOpenOnce } from './openonce.js';
import { createBaseForm } from './baseform.js';

// 놀이 선택과 사전 본체 사이의 연결은 여기서만 맡는다.
export function createGames(options) {
  const button = document.getElementById('gameButton'), panel = document.getElementById('gamePanel');
  const games = { quickfind: createQuickFind(options), openonce: createOpenOnce(options), baseform: createBaseForm(options) };
  let current, choosing = false;
  function closePicker() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  function chooseGame() {
    options.closeCollection();
    current?.stop(); options.closeAbout(); options.highlight(null);
    document.getElementById('gameNote').hidden = true;
    panel.innerHTML = '<h2>놀이 고르기</h2><div class="game-actions game-choices">' +
      '<button type="button" data-game="quickfind"><svg aria-hidden="true" viewBox="0 0 32 32"><circle cx="16" cy="18" r="11"/><path d="M12 2h8m-4 0v5m0 5v7l5 3"/></svg>낱말 빨리 찾기</button>' +
      '<button type="button" data-game="openonce"><svg aria-hidden="true" viewBox="0 0 32 32"><path d="M16 8C12 4 6 4 2 5v22c5-1 10-1 14 3 4-4 9-4 14-3V5c-4-1-10-1-14 3Zm0 0v22M6 11l6 1m-6 5 6 1m8-6 6-1m-6 7 6-1"/></svg>한 번에 펼치기</button>' +
      '<button type="button" data-game="baseform"><svg aria-hidden="true" viewBox="0 0 32 32"><circle cx="13" cy="13" r="10"/><path d="m21 21 9 9M9 13l3 3 5-6"/></svg>기본형 탐정</button></div>';
    panel.hidden = false; button.setAttribute('aria-expanded', 'true'); panel.querySelector('button').focus();
  }
  button.addEventListener('click', () => {
    if (!options.idle() || choosing) return;
    if (current?.active) {
      if (confirm('놀이를 그만하고 사전으로 돌아갈까요?')) current.stop();
    } else if (!panel.hidden) closePicker(); else chooseGame();
  });
  panel.addEventListener('click', async (e) => {
    if (!options.idle() || choosing) return;
    const data = e.target.closest('button')?.dataset;
    if (data?.action === 'games') chooseGame();
    else if (games[data?.game]) {
      choosing = true; current = games[data.game];
      try { await current.choose(); } finally { choosing = false; }
    }
    else if (data?.set) current?.startSet(Number(data.set));
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.contains(e.target) && !button.contains(e.target)) closePicker();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { closePicker(); button.focus(); }
  });
  return {
    get active() { return current?.active ?? false; },
    get finding() { return current?.finding ?? false; },
    get tabHint() { return current?.tabHint ?? -1; },
    get tabs() { return current?.tabs ?? true; },
    get hideGuide() { return current?.hideGuide ?? false; },
    flipped(...args) { current?.flipped(...args); },
    pick(...args) { return current?.pick(...args); },
  };
}
