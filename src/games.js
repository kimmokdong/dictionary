import { createQuickFind } from './quickfind.js';
import { createOpenOnce } from './openonce.js';

// 놀이 선택과 사전 본체 사이의 연결은 여기서만 맡는다.
export function createGames(options) {
  const button = document.getElementById('gameButton'), panel = document.getElementById('gamePanel');
  const games = { quickfind: createQuickFind(options), openonce: createOpenOnce(options) };
  let current, choosing = false;
  function closePicker() { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  function chooseGame() {
    current?.stop(); options.closeAbout(); options.highlight(null);
    document.getElementById('gameNote').hidden = true;
    panel.innerHTML = '<h2>놀이 고르기</h2><div class="game-actions"><button type="button" data-game="quickfind">낱말 빨리 찾기</button><button type="button" data-game="openonce">한 번에 펼치기</button></div>';
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
