import test from 'node:test';
import assert from 'node:assert/strict';
import { G, layout, xOfPage, pageAtX, targetLeft, tabChips, hitTest, lastLeft, fineWeight, followEdge } from '../src/geometry.js';

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

test('옆면 따라가기: 보통 빠르기면 손가락 아래 쪽을 그대로 따라간다', () => {
  const k = G.EDGE_SPAN / N;
  assert.equal(followEdge(0, 30, 0.5, k), 0);        // 차이 없으면 그대로
  assert.equal(followEdge(0, -30, G.FINE_FAST, k), 0);
  // 미세 조정으로 생긴 차이는 ATTACH_PX만큼 움직이면 1/e로 줄어 손가락 아래로 돌아온다
  assert.ok(Math.abs(followEdge(100, G.ATTACH_PX, 1, k) - 100 / Math.E) < 1e-9);
  let off = 100; for (let i = 0; i < 60; i++) off = followEdge(off, 1, 1, k);
  assert.ok(Math.abs(off) < 2);
});

test('옆면 따라가기: 아주 천천히 움직이면 FINE_PX마다 한 장만 움직인다', () => {
  const k = G.EDGE_SPAN / N;
  for (const dx of [G.FINE_PX, -G.FINE_PX]) {
    const off = followEdge(0, dx, G.FINE_SLOW, k);
    assert.ok(Math.abs(dx / k + off - Math.sign(dx) * 2) < 1e-9); // 손가락 아래 변화 + 차이 변화 = 2쪽
  }
  assert.equal(fineWeight(0), 1);
  assert.equal(fineWeight(G.FINE_SLOW), 1);
  assert.equal(fineWeight(G.FINE_FAST), 0);
  assert.ok(Math.abs(fineWeight((G.FINE_SLOW + G.FINE_FAST) / 2) - 0.5) < 1e-9);
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
