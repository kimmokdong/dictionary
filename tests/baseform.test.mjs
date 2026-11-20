import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scoreForHints, hintStage, classifyAnswer, summarize, parseBests, serializeBests, resultPraise } from '../src/baseform.js';
import { linkGame } from '../scripts/data/games.mjs';

const record = (hints = 0, revealed = false) => ({ hints, revealed, wrong: 0, flips: 2 });

test('기본형 점수: 힌트 0·1·2·3회는 3·2·1·1점, 정답 보기는 0점, 오답은 감점하지 않는다', () => {
  assert.deepEqual([0, 1, 2, 3].map((hints) => scoreForHints(hints)), [3, 2, 1, 1]);
  assert.equal(scoreForHints(3, true), 0);
  const records = [record(), record(1), record(2), record(3), { ...record(3, true), wrong: 10 }];
  assert.equal(summarize(records).score, 7);
  assert.equal(summarize(Array.from({ length: 5 }, () => record())).score, 15);
  assert.equal(summarize(Array.from({ length: 5 }, () => record(3, true))).score, 0);
  assert.deepEqual(summarize(records).records[4], { hints: 3, wrong: 10, flips: 2, revealed: true });
});

test('기본형 힌트: 단계별 문구·첫 글자·색인과 정답 보기 전환', () => {
  assert.deepEqual(hintStage('돋우다', 0), { text: '', tab: false, label: '힌트' });
  assert.deepEqual(hintStage('돋우다', 1), { text: "'-다'로 끝나는 모양으로 바꿔 봐요.", tab: false, label: '힌트' });
  assert.deepEqual(hintStage('돋우다', 2), { text: "첫 글자는 '돋'이에요.", tab: false, label: '힌트' });
  assert.deepEqual(hintStage('돋우다', 3), { text: "첫 글자는 '돋'이에요.", tab: true, label: '정답 보기' });
  assert.equal(hintStage('묻다', 2).text, "첫 글자는 '묻'이에요.");
});

test('기본형 판정: 정답 ID·동음이의어·다른 낱말을 구별한다', () => {
  const target = { w: '묻다', id: '69471' };
  assert.equal(classifyAnswer(target, { w: '묻다', id: '69471' }), 'correct');
  assert.equal(classifyAnswer(target, { w: '묻다', id: '다른 뜻' }), 'homonym');
  assert.equal(classifyAnswer(target, { w: '물다', id: '다른 낱말' }), 'other');
});

test('기본형 저장: 문제별 과정의 왕복, 버전·세트·점수·과정 손상값 복구', () => {
  const best = summarize(Array.from({ length: 5 }, () => record()));
  const zero = summarize(Array.from({ length: 5 }, () => record(3, true)));
  const sets = { 1: best, 9: zero };
  assert.deepEqual(JSON.parse(serializeBests(sets)), { version: 1, sets });
  assert.deepEqual(parseBests(serializeBests(sets)), sets);
  for (const text of [null, '', '깨진 JSON', 'null', '[]', '{"version":2,"sets":{}}', '{"version":1}',
    '{"version":1,"sets":null}', '{"version":1,"sets":[]}', '{"version":1,"sets":"값"}']) assert.deepEqual(parseBests(text), {});
  for (const bad of [null, 15, { ...best, score: -1 }, { ...best, score: 16 }, { ...best, score: 14 },
    { ...best, score: '15' }, { ...best, records: [] }, { ...best, records: [null, ...best.records.slice(1)] },
    ...[{ hints: -1 }, { hints: 4 }, { hints: 1.5 }, { wrong: -1 }, { wrong: '0' }, { wrong: 1.5 },
      { wrong: Number.MAX_SAFE_INTEGER + 1 }, { flips: -1 }, { flips: 0.5 }, { revealed: 'false' }, { revealed: true }]
      .map((patch) => ({ ...best, records: [{ ...record(), ...patch }, ...best.records.slice(1)] }))]) {
    assert.deepEqual(parseBests(serializeBests({ ...sets, 2: bad, 0: best, 10: best, '01': best })), sets);
  }
});

test('기본형 칭찬: 힌트 없이 찾은 수와 끝까지 살핀 과정을 말한다', () => {
  const praise = resultPraise([record(), record(1), record(), record(3, true), record(2)]);
  assert.equal(praise.length, 2);
  assert.match(praise.join(' '), /2문제를 힌트 없이.*끝까지 추적/);
  const aided = resultPraise([record(3, true)]).join(' ');
  assert.match(aided, /힌트와 풀이/);
  assert.doesNotMatch(aided, /힌트 없이|순위|실패|느려/);
});

test('기본형 연결: 없는 ID·다른 표기는 실패하며 문장·풀이를 바꾸지 않는다', () => {
  const source = { version: 1, sets: [{ set: 7, items: [{ before: '<앞> ', form: '돋워', after: ' 뒤 &',
    w: '돋우다', id: '48613', tip: '원래 풀이' }] }] };
  assert.throws(() => linkGame('기본형 탐정', source, []), /기본형 탐정 7세트.*48613/);
  assert.throws(() => linkGame('기본형 탐정', source, [{ id: '48613', w: '돋다', seq: 1 }]), /사전과 맞지/);
  const built = linkGame('기본형 탐정', source, [{ id: '48613', w: '돋우다', seq: 7 }]);
  assert.deepEqual(built.sets[0].items[0], { ...source.sets[0].items[0], seq: 7 });
  assert.equal(source.sets[0].items[0].seq, undefined);
});

test('생성 문제: 기본형 탐정 9세트·45문제의 문장 보존과 ID·표기·순번 일치', () => {
  const source = JSON.parse(fs.readFileSync('data/games/base-form.json', 'utf8'));
  const built = JSON.parse(fs.readFileSync('data/build/games/base-form.json', 'utf8'));
  const entries = fs.readdirSync('data/build/entries').sort().flatMap((file) =>
    JSON.parse(fs.readFileSync(`data/build/entries/${file}`, 'utf8')));
  assert.deepEqual(built, linkGame('기본형 탐정', source, entries));
  assert.equal(built.sets.length, 9);
  assert.equal(built.sets.flatMap((s) => s.items).length, 45);
  for (const set of built.sets) {
    assert.equal(set.items.length, 5);
    assert.equal(set.level, set.set <= 3 ? '쉬움' : set.set <= 6 ? '보통' : '어려움');
    for (const item of set.items) {
      assert.equal(entries[item.seq].id, item.id);
      assert.equal(entries[item.seq].w, item.w);
      for (const key of ['before', 'form', 'after', 'tip']) assert.equal(typeof item[key], 'string');
    }
  }
});
