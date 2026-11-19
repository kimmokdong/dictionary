// 책 옆면의 좌표 계산과 터치 대상 판정. 화면(DOM)에 의존하지 않는 순수 함수만 둔다.
// 좌표는 모두 1366×768 무대 기준 픽셀이다.

export const G = {
  STAGE_W: 1366, STAGE_H: 768,
  PAGE_W: 528, PAGE_H: 730, TOP: 19,
  MARGIN: 3,          // 무대 좌우 바깥 여백
  EDGE_MIN: 10,       // 종이가 한 장도 없을 때의 옆면 폭(표지 두께)
  EDGE_SPAN: 283,     // 전체 종이가 차지하는 옆면 폭(좌우 합)
  EDGE_REACH: 10,     // 옆면 터치 판정을 지면 쪽으로 넓히는 폭
  PAGE_ZONE: 80,      // 한 장 넘김을 인식하는 지면 가장자리 폭
  SNAP_PX: 8,         // 색인 시작 위치로 맞추는 터치 거리(최대)
  SNAP_SHARE: 0.3,    // 구간이 얇으면 스냅 폭을 구간 폭의 이 비율까지로 줄여 구간 안쪽을 남긴다
  CHIP_W: 28, CHIP_PAD: 6, // 색인 탭 크기와 터치 여유
};

// L: 왼쪽 면의 쪽 번호(짝수, 0이면 앞표지 안쪽). 오른쪽 면은 L+1.
export const lastLeft = (N) => N - (N % 2);

// 훑는 거리(px)와 시간(ms)을 장 수로 바꾼다. 소수 쪽을 보존해 작은 움직임도 누적한다.
export function riffleTarget(target, dy, dt, L, N, side) {
  if (dt <= 0) return target;
  const speed = Math.min(1, Math.max(0, (Math.abs(dy) / dt - 0.05) / 1.45));
  const multiplier = 1 + 29 * speed * speed * (3 - 2 * speed);
  const next = target + 2 * (dy / 10) * multiplier;
  return side === 'right' ? Math.min(lastLeft(N), Math.max(L + 2, next)) : Math.max(0, Math.min(L - 2, next));
}

// pos(왼쪽에 넘어간 쪽 수, 넘김 도중에는 소수)에 따른 가로 배치.
export function layout(pos, N) {
  const k = G.EDGE_SPAN / N; // 쪽당 옆면 픽셀
  const leftX0 = G.MARGIN;
  const leftX1 = leftX0 + G.EDGE_MIN + pos * k;   // 왼쪽 옆면 끝 = 왼쪽 면 시작
  const spine = leftX1 + G.PAGE_W;
  const rightX0 = spine + G.PAGE_W;               // 오른쪽 면 끝 = 오른쪽 옆면 시작
  const rightX1 = rightX0 + G.EDGE_MIN + (N - pos) * k;
  return { k, leftX0, leftX1, spine, rightX0, rightX1 };
}

// 쪽 q가 옆면에서 놓이는 가로 위치. 펼친 곳에 가까울수록 현재 쪽에 가깝다.
export function xOfPage(q, L, lay) {
  return q > L ? lay.rightX0 + (q - (L + 1)) * lay.k : lay.leftX1 - (L - q) * lay.k;
}

export function pageAtX(side, x, L, N, lay) {
  const q = side === 'right' ? L + 1 + (x - lay.rightX0) / lay.k : L - (lay.leftX1 - x) / lay.k;
  return Math.min(N, Math.max(1, q));
}

// 쪽 q가 보이도록 펼칠 때의 왼쪽 면 번호. 넘기는 방향으로 최소 한 장은 움직인다.
export function targetLeft(q, L, side, N) {
  const t = Math.floor(q) & ~1;
  return side === 'right' ? Math.min(lastLeft(N), Math.max(L + 2, t)) : Math.max(0, Math.min(L - 2, t));
}

// 색인 탭의 위치. 구간 시작 쪽이 왼쪽 묶음에 있으면 왼쪽 옆면에, 아니면 오른쪽 옆면에 붙는다.
export function tabChips(L, sections, lay) {
  const rowH = G.PAGE_H / sections.length;
  return sections.map((s, i) => {
    const side = s.start > L ? 'right' : 'left';
    const ax = xOfPage(s.start, L, lay);
    let x = side === 'right' ? ax - 4 : ax + 4 - G.CHIP_W;
    x = Math.min(G.STAGE_W - 1 - G.CHIP_W, Math.max(1, x));
    return { i, tab: s.tab, start: s.start, side, ax, x, y: G.TOP + i * rowH + 4, w: G.CHIP_W, h: rowH - 8 };
  });
}

// 터치 시작점이 무엇을 잡았는지 판정한다.
// 반환 kind: 'tab'(색인) | 'bundle'(종이 묶음) | 'page'(한 장) | 'none'
export function hitTest(x, y, L, N, sections) {
  const lay = layout(L, N);
  const none = { kind: 'none' };
  if (y < G.TOP || y > G.TOP + G.PAGE_H) return none;
  const can = { right: L < lastLeft(N), left: L > 0 };

  const p = G.CHIP_PAD;
  for (const c of tabChips(L, sections, lay)) {
    if (x < c.x - p || x > c.x + c.w + p || y < c.y - p || y > c.y + c.h + p) continue;
    // 지금 펼친 면에서 시작하는 구간의 탭은 넘길 것이 없다.
    if (c.start === L || c.start === L + 1 || !can[c.side]) return none;
    return { kind: 'tab', side: c.side, tabIndex: c.i, rawPage: c.start, snapped: true,
      target: targetLeft(c.start, L, c.side, N) };
  }

  const side = x >= lay.rightX0 - G.EDGE_REACH ? 'right' : x <= lay.leftX1 + G.EDGE_REACH ? 'left' : null;
  if (side) {
    if (!can[side]) return none;
    let q = pageAtX(side, x, L, N, lay);
    let snapped = false, tabIndex = -1, best = Infinity;
    sections.forEach((s, i) => {
      if ((s.start > L ? 'right' : 'left') !== side || s.start === L || s.start === L + 1) return;
      const dx = x - xOfPage(s.start, L, lay); // 양수면 구간 안쪽, 음수면 앞 구간 쪽
      const width = (dx >= 0 ? s.pages : sections[i - 1]?.pages ?? 0) * lay.k;
      const d = Math.abs(dx);
      if (d <= Math.min(G.SNAP_PX, width * G.SNAP_SHARE) && d < best) { best = d; q = s.start; snapped = true; tabIndex = i; }
    });
    return { kind: 'bundle', side, rawPage: q, snapped, tabIndex, target: targetLeft(q, L, side, N) };
  }

  if (x >= lay.rightX0 - G.PAGE_ZONE && can.right) return { kind: 'page', side: 'right', target: L + 2 };
  if (x <= lay.leftX1 + G.PAGE_ZONE && can.left) return { kind: 'page', side: 'left', target: L - 2 };
  return none;
}
