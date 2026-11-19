import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { timerStage, summarize, betterRecord, parseBests, serializeBests, resultPraise } from '../src/quickfind.js';
import { linkGame } from '../scripts/data/games.mjs';

test('놀이 타이머: 30·60·100초 경계와 남은 시간', () => {
  assert.deepEqual(timerStage(0), { remaining: 100, tab: false, guide: false, expired: false });
  assert.deepEqual(timerStage(29999), { remaining: 71, tab: false, guide: false, expired: false });
  assert.deepEqual(timerStage(30000), { remaining: 70, tab: true, guide: false, expired: false });
  assert.equal(timerStage(59999).guide, false);
  assert.deepEqual(timerStage(60000), { remaining: 40, tab: true, guide: true, expired: false });
  assert.equal(timerStage(99999).expired, false);
  assert.deepEqual(timerStage(100000), { remaining: 0, tab: true, guide: true, expired: true });
  assert.equal(timerStage(200000).remaining, 0);
});

test('놀이 기록: 찾은 수 우선, 같을 때만 시간 비교, 시간 초과는 100초', () => {
  const summary = summarize([{ elapsedMs: 1234, timeout: false }, { elapsedMs: null, timeout: true }]);
  assert.deepEqual(summary, { found: 1, totalMs: 101234 });
  assert.ok(betterRecord(summary));
  assert.ok(betterRecord({ found: 4, totalMs: 450000 }, { found: 3, totalMs: 100000 }));
  assert.equal(betterRecord({ found: 3, totalMs: 1000 }, { found: 4, totalMs: 450000 }), false);
  assert.ok(betterRecord({ found: 4, totalMs: 1000 }, { found: 4, totalMs: 1001 }));
  assert.equal(betterRecord(summary, summary), false);
});

test('놀이 저장: 버전·세트·수치 검증과 손상된 저장값 복구', () => {
  const sets = { 1: { found: 3, totalMs: 201234 }, 12: { found: 5, totalMs: 15000 } };
  assert.deepEqual(parseBests(serializeBests(sets)), sets);
  for (const value of [null, '', '깨진 JSON', 'null', '{"version":2,"sets":{}}']) assert.deepEqual(parseBests(value), {});
  assert.deepEqual(parseBests(JSON.stringify({ version: 1, sets: {
    ...sets, 0: { found: 5, totalMs: 1 }, 13: { found: 1, totalMs: 1 },
    2: { found: 6, totalMs: 1 }, 3: { found: 1, totalMs: -1 }, 4: { found: 1, totalMs: 500001 },
    5: { found: 1.5, totalMs: 100 }, 6: null,
  } })), sets);
});

test('놀이 칭찬: 색인 사용·다시 도전한 과정을 말하고 순위를 매기지 않는다', () => {
  assert.match(resultPraise([{ usedIndex: true, wrong: 2 }]).join(' '), /색인.*틀려도/);
  const praise = resultPraise([{ usedIndex: false, wrong: 0, timeout: true }]);
  assert.equal(praise.length, 2);
  assert.match(praise.join(' '), /책장.*끝까지/);
  assert.doesNotMatch(praise.join(' '), /순위|느려|실패/);
});

test('문제 연결: ID·표기 일치와 원본 보존, 없는 ID와 다른 표기는 실패', () => {
  const source = { version: 1, sets: [{ set: 1, items: [{ id: '10', w: '눈', hint: '날씨' }] }] };
  const entries = [{ id: '10', seq: 7, w: '눈' }];
  const linked = linkGame('낱말 빨리 찾기', source, entries);
  assert.deepEqual(linked.sets[0].items[0], { id: '10', w: '눈', hint: '날씨', seq: 7 });
  assert.equal(source.sets[0].items[0].seq, undefined);
  assert.throws(() => linkGame('낱말 빨리 찾기', source, []), /낱말 빨리 찾기 1세트.*10/);
  assert.throws(() => linkGame('낱말 빨리 찾기', source, [{ ...entries[0], w: '다른 낱말' }]), /사전과 맞지/);
});

test('생성 문제: 원본 12세트·60문제 모두 정확한 entries 순번에 연결된다', () => {
  const source = JSON.parse(fs.readFileSync('data/games/quick-find.json', 'utf8'));
  const built = JSON.parse(fs.readFileSync('data/build/games/quick-find.json', 'utf8'));
  const entries = fs.readdirSync('data/build/entries').sort().flatMap((file) =>
    JSON.parse(fs.readFileSync(`data/build/entries/${file}`, 'utf8')));
  assert.deepEqual(built, linkGame('낱말 빨리 찾기', source, entries));
  assert.equal(built.sets.length, 12);
  assert.equal(built.sets.flatMap((s) => s.items).length, 60);
  for (const set of built.sets) {
    assert.equal(set.items.length, 5);
    for (const item of set.items) {
      assert.equal(entries[item.seq].id, item.id);
      assert.equal(entries[item.seq].w, item.w);
    }
  }
});
