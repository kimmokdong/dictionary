import test from 'node:test';
import assert from 'node:assert/strict';
import { G, layout, xOfPage, pageAtX, targetLeft, tabChips, hitTest, lastLeft, slideTarget } from '../src/geometry.js';

const N = 2547;
// 판정 회귀 검사에 사용하는 고정 구간 시작 쪽
const starts = { ㄱ: 1, ㄴ: 383, ㄷ: 498, ㄹ: 724, ㅁ: 732, ㅂ: 901, ㅅ: 1145, ㅇ: 1432, ㅈ: 1801, ㅊ: 2081, ㅋ: 2193, ㅌ: 2225, ㅍ: 2291, ㅎ: 2379 };
const sections = Object.entries(starts).map(([tab, start], i, a) => ({ tab, start, pages: (a[i + 1]?.[1] ?? N + 1) - start }));
const midY = (i) => G.TOP + (i + 0.5) * (G.PAGE_H / 14);

test('배치: 좌우 옆면 폭의 합은 일정하고 위치에 따라 비율이 바뀐다', () => {
  for (const pos of [0, 1000, lastLeft(N)]) {
    const l = layout(pos, N);
    assert.ok(Math.abs((l.leftX1 - l.leftX0) + (l.rightX1 - l.rightX0) - (2 * G.EDGE_MIN + G.EDGE_SPAN)) < 1e-9);
    assert.ok(Math.abs(l.rightX1 - (G.MARGIN + 2 * G.PAGE_W + 2 * G.EDGE_MIN + G.EDGE_SPAN)) < 1e-9);
    assert.ok(l.rightX1 <= G.STAGE_W - G.MARGIN);
  }
  assert.ok(layout(0, N).rightX1 - layout(0, N).rightX0 > G.EDGE_SPAN);
  assert.ok(layout(2000, N).leftX1 - layout(2000, N).leftX0 > layout(2000, N).rightX1 - layout(2000, N).rightX0);
});

test('옆면 위치와 쪽 번호는 서로 되돌릴 수 있다', () => {
  const L = 1000, lay = layout(L, N);
  for (const q of [1, 400, 999]) assert.ok(Math.abs(pageAtX('left', xOfPage(q, L, lay), L, N, lay) - q) < 1e-6);
  for (const q of [1001, 1500, 2547]) assert.ok(Math.abs(pageAtX('right', xOfPage(q, L, lay), L, N, lay) - q) < 1e-6);
});

// 같은 방향으로 1px씩 n번 천천히 움직였을 때의 결과
const stroke = (target, n, step, L, side) => {
  for (let i = 1; i <= n; i++) target = slideTarget(target, step, 100, i, L, N, side);
  return target;
};

test('가로 훑기: 움직이기 시작할 때는 FINE_PX마다 한 장, 오른쪽이 뒤쪽 쪽', () => {
  for (const side of ['left', 'right']) {
    const L = side === 'right' ? 0 : 2000;
    assert.equal(slideTarget(1000, G.FINE_PX, 1000, G.FINE_PX / 2, L, N, side), 1002);
    assert.equal(slideTarget(1000, -G.FINE_PX, 1000, G.FINE_PX / 2, L, N, side), 998);
    const s = side === 'right' ? 1 : -1; // 펼친 면 반대쪽(바깥)으로
    const a = stroke(1000, G.FINE_PX, s, L, side);
    assert.ok(Math.abs(a - (1000 + 2 * s)) < 0.2, `${side} 처음 5px은 거의 한 장`);
  }
});

test('가로 훑기: 같은 방향으로 멀리 갈수록 가속, 끝에서는 옆면 실제 비율의 RAMP_MAX배', () => {
  const first = stroke(1000, 50, 1, 0, 'right') - 1000;
  const second = stroke(1000, 100, 1, 0, 'right') - 1000 - first;
  assert.ok(second > 3 * first, '뒤 50px이 앞 50px보다 훨씬 많이');
  const max = G.RAMP_MAX * N / G.EDGE_SPAN;
  assert.ok(Math.abs(slideTarget(1000, 1, 100, 500, 0, N, 'right') - 1000 - max) < 1e-9);
  assert.ok(stroke(1000, 100, 1, 0, 'right') - 1000 > 500, '100px(약 19mm) 쭉 그으면 수백 쪽');
});

test('가로 훑기: 펼친 면 쪽으로 빠르게 끌면 고정, 바깥쪽은 빨라도 반영', () => {
  const at = (speed, dx = -10, side = 'right') => slideTarget(1000, dx, 10 / speed, 10, side === 'right' ? 0 : 2000, N, side);
  assert.equal(at(G.FINE_FAST), 1000);
  assert.equal(at(3), 1000);
  assert.equal(at(3, 10, 'left'), 1000);
  assert.ok(at(G.FINE_SLOW) < 1000);
  assert.ok(at(3, 10) > 1000 && at(3, -10, 'left') < 1000);
  let previous = -Infinity;
  for (const speed of [.05, .1, .15, .2, .3, 1]) { assert.ok(at(speed) >= previous); previous = at(speed); }
});

test('가로 훑기: 시간 없는 이벤트와 옆면 범위 제한', () => {
  assert.equal(slideTarget(1000, 0, 10, 0, 0, N, 'right'), 1000);
  assert.equal(slideTarget(1000, 10, 0, 10, 0, N, 'right'), 1000);
  assert.equal(slideTarget(1000, 10, -1, 10, 0, N, 'right'), 1000);
  assert.equal(slideTarget(1000, -10000, 100000, 10000, 800, N, 'right'), 802);
  assert.equal(slideTarget(1000, 10000, 100000, 10000, 800, N, 'right'), lastLeft(N));
  assert.equal(slideTarget(500, -10000, 100000, 10000, 800, N, 'left'), 0);
  assert.equal(slideTarget(500, 10000, 100000, 10000, 800, N, 'left'), 798);
});

test('펼칠 면: 목표 쪽이 보이고 넘기는 방향으로 한 장 이상 움직인다', () => {
  assert.equal(targetLeft(383, 0, 'right', N), 382);   // ㄴ 시작(홀수 쪽)은 오른쪽 면에 보인다
  assert.equal(targetLeft(732, 0, 'right', N), 732);   // 짝수 쪽은 왼쪽 면에 보인다
  assert.equal(targetLeft(1.2, 0, 'right', N), 2);
  assert.equal(targetLeft(2547, 0, 'right', N), 2546);
  assert.equal(targetLeft(999.5, 1000, 'left', N), 998);
  assert.equal(targetLeft(1, 1000, 'left', N), 0);
});

test('색인 탭을 잡으면 그 자음의 첫 지면', () => {
  const chips = tabChips(0, sections, layout(0, N));
  const n = chips[1]; // ㄴ
  const hit = hitTest(n.x + n.w / 2, n.y + n.h / 2, 0, N, sections);
  assert.equal(hit.kind, 'tab');
  assert.equal(hit.target, 382);
  // 뒤쪽을 펼쳤을 때 ㄴ 탭은 왼쪽 옆면에 있다.
  const back = tabChips(1500, sections, layout(1500, N))[1];
  assert.equal(back.side, 'left');
  assert.equal(hitTest(back.x + 5, back.y + 5, 1500, N, sections).target, 382);
});

test('색인 사이를 잡으면 구간 안쪽, 위치에 따라 다른 지면', () => {
  const lay = layout(0, N);
  const y = midY(8); // ㄴ·ㄷ 탭과 다른 줄
  const at = (q) => hitTest(xOfPage(q, 0, lay), y, 0, N, sections);
  const a = at(420), b = at(440), c = at(460); // ㄴ(383~497) 앞·가운데·뒤
  for (const h of [a, b, c]) { assert.equal(h.kind, 'bundle'); assert.equal(h.snapped, false); }
  assert.ok(383 < a.target && a.target < b.target && b.target < c.target && c.target < 498);
});

test('스냅: 색인 시작 위치 가까이 잡으면 첫 지면으로 맞춘다', () => {
  const lay = layout(0, N);
  const x = xOfPage(498, 0, lay); // ㄷ 시작
  const near = hitTest(x + 2, midY(9), 0, N, sections);
  assert.equal(near.kind, 'bundle');
  assert.equal(near.snapped, true);
  assert.equal(near.target, 498);
  assert.equal(hitTest(xOfPage(600, 0, lay), midY(9), 0, N, sections).snapped, false); // ㄷ 가운데
});

test('한 장 넘김에는 스냅이 없고 끝에서는 넘길 수 없다', () => {
  const L = 380, lay = layout(L, N); // ㄴ 시작 바로 앞
  const hit = hitTest(lay.rightX0 - 40, midY(5), L, N, sections);
  assert.deepEqual(hit, { kind: 'page', side: 'right', target: 382 });
  assert.equal(hitTest(layout(0, N).leftX1 + 40, midY(5), 0, N, sections).kind, 'none');
  const end = lastLeft(N);
  assert.equal(hitTest(layout(end, N).rightX0 - 40, midY(5), end, N, sections).kind, 'none');
  assert.equal(hitTest(700, midY(5), 1000, N, sections).kind, 'none'); // 지면 가운데
});
