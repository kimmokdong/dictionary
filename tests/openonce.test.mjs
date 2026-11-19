import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spreadDistance, scoreForDistance, feedbackText, parseBests, serializeBests, resultPraise } from '../src/openonce.js';
import { linkGame } from '../scripts/data/games.mjs';

test('펼친 두 면의 거리: 양쪽 안·앞·뒤와 한 면뿐인 처음·끝', () => {
  assert.equal(spreadDistance(100, 100, 200), 0);
  assert.equal(spreadDistance(101, 100, 200), 0);
  assert.equal(spreadDistance(98, 100, 200), 2);
  assert.equal(spreadDistance(104, 100, 200), 3);
  assert.equal(spreadDistance(1, 0, 200), 0);
  assert.equal(spreadDistance(10, 0, 200), 9);
  assert.equal(spreadDistance(200, 200, 200), 0);
  assert.equal(spreadDistance(198, 200, 200), 2);
});

test('점수: 모든 구간의 양쪽 경계', () => {
  for (const [distance, score] of [[0, 10], [1, 8], [20, 8], [21, 6], [60, 6], [61, 4],
    [150, 4], [151, 2], [400, 2], [401, 1], [9999, 1]]) assert.equal(scoreForDistance(distance), score);
});

test('결과 문구: 정답·앞쪽·뒤쪽을 가까운 실제 면으로 안내한다', () => {
  assert.equal(feedbackText(100, 100, 200), '딱 맞혔어요!');
  assert.equal(feedbackText(101, 100, 200), '딱 맞혔어요!');
  assert.equal(feedbackText(99, 100, 200), '목표는 앞쪽으로 1쪽');
  assert.equal(feedbackText(102, 100, 200), '목표는 뒤쪽으로 1쪽');
  assert.equal(feedbackText(2, 0, 200), '목표는 뒤쪽으로 1쪽');
  assert.equal(feedbackText(199, 200, 200), '목표는 앞쪽으로 1쪽');
  assert.match(resultPraise([{ distance: 0 }, { distance: 20 }, { distance: 21 }]).join(' '), /2문제를 20쪽 안/);
  assert.match(resultPraise([{ distance: 401 }]).join(' '), /짐작.*끝까지/);
});

test('기록 저장: 버전·세트·점수 검증과 손상된 값 복구', () => {
  const sets = { 1: 0, 4: 78, 8: 100 };
  assert.deepEqual(JSON.parse(serializeBests(sets)), { version: 1, sets });
  assert.deepEqual(parseBests(serializeBests(sets)), sets);
  for (const value of [null, '', '깨진 JSON', 'null', '[]', '{"version":2,"sets":{}}',
    '{"version":1}', '{"version":1,"sets":null}', '{"version":1,"sets":[]}', '{"version":1,"sets":"값"}']) {
    assert.deepEqual(parseBests(value), {});
  }
  assert.deepEqual(parseBests(JSON.stringify({ version: 1, sets: { ...sets,
    0: 100, 9: 10, '01': 20, 2: -1, 3: 101, 5: 2.5, 6: '90', 7: null,
  } })), sets);
});

test('한 번에 펼치기 연결: 잘못된 ID·표기는 놀이 이름과 함께 실패한다', () => {
  const source = { version: 1, sets: [{ set: 8, items: [{ id: '10', w: '눈' }] }] };
  assert.throws(() => linkGame('한 번에 펼치기', source, []), /한 번에 펼치기 8세트.*10/);
  assert.throws(() => linkGame('한 번에 펼치기', source, [{ id: '10', w: '비', seq: 1 }]), /사전과 맞지/);
});

test('생성 문제: 한 번에 펼치기 8세트·80문제의 ID·낱말·순번이 모두 맞는다', () => {
  const source = JSON.parse(fs.readFileSync('data/games/open-once.json', 'utf8'));
  const built = JSON.parse(fs.readFileSync('data/build/games/open-once.json', 'utf8'));
  const entries = fs.readdirSync('data/build/entries').sort().flatMap((file) =>
    JSON.parse(fs.readFileSync(`data/build/entries/${file}`, 'utf8')));
  assert.deepEqual(built, linkGame('한 번에 펼치기', source, entries));
  assert.equal(built.sets.length, 8);
  assert.equal(built.sets.flatMap((s) => s.items).length, 80);
  for (const set of built.sets) {
    assert.equal(set.items.length, 10);
    assert.equal(set.level, set.set <= 4 ? '쉬움' : '어려움');
    for (const item of set.items) {
      assert.ok(Number.isInteger(item.seq));
      assert.equal(entries[item.seq].id, item.id);
      assert.equal(entries[item.seq].w, item.w);
    }
  }
});
