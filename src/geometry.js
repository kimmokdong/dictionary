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
  // 옆면 가로 훑기: 천천히 움직이면 FINE_PX마다 한 장, FINE_FAST(px/ms)보다 빠르면 고른 쪽을 고정한다(들어 올리는 동작).
  // 기준(손가락 속도): 미세 조정 약 5~20mm/s ≈ 0.03~0.1px/ms, 넘기려고 끄는 동작 ≈ 0.5px/ms 이상. 실기기에서 다듬는다.
  FINE_PX: 5, FINE_SLOW: 0.1, FINE_FAST: 0.3,
  FLIP_IN: 176,       // 옆면을 잡은 손가락이 펼친 면 안으로 이만큼 들어와야 넘김 시작(지면 폭의 약 1/3)
  FLICK_IN: 40,       // 그 전에 놓아도 이만큼 들어온 빠른 튕김이면 넘긴다
};

// L: 왼쪽 면의 쪽 번호(짝수, 0이면 앞표지 안쪽). 오른쪽 면은 L+1.
export const lastLeft = (N) => N - (N % 2);

// 옆면을 잡은 채 가로로 움직인 거리(dx, 오른쪽이 +)와 시간(ms)으로 고를 쪽을 조정한다.
// 오른쪽으로 가면 쪽 번호가 커진다(오른쪽 옆면은 바깥, 왼쪽 옆면은 펼친 곳 쪽). 소수 쪽을 보존해 작은 움직임도 누적한다.
// 빠를수록 덜 반영해, 빠르게 끌어 넘길 때는 고른 쪽이 밀리지 않는다.
export function slideTarget(target, dx, dt, L, N, side) {
  if (dt <= 0) return target;
  const weight = Math.min(1, Math.max(0, (G.FINE_FAST - Math.abs(dx) / dt) / (G.FINE_FAST - G.FINE_SLOW)));
  const next = target + 2 * (dx / G.FINE_PX) * weight;
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
