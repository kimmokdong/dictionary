import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TABS, tabIndex, addWord, removeWord, parseCollection, serializeCollection, tabCounts, isComplete } from '../src/collection.js';

const entry = { id: '10', w: '눈', hn: 1, seq: 7 };
const word = { w: '눈', hn: 1, seq: 7, from: 'star', at: 1000 };

test('도감 초성: 쌍자음·분해된 한글과 실제 색인의 모든 표제어가 같은 칸이다', () => {
  for (const [w, tab] of [['까치', 0], ['딸기', 2], ['뿌리', 5], ['씨앗', 6], ['짜다', 8], ['가', 0], ['abc', -1]]) assert.equal(tabIndex(w), tab);
  const index = JSON.parse(fs.readFileSync('data/build/normal/index.json', 'utf8'));
  assert.deepEqual(index.sections.map((s) => s.tab), TABS);
  const counts = TABS.map(() => 0);
  for (const file of fs.readdirSync('data/build/entries')) {
    for (const e of JSON.parse(fs.readFileSync(`data/build/entries/${file}`, 'utf8'))) counts[tabIndex(e.w)]++;
  }
  assert.deepEqual(counts, index.sections.map((s) => s.entries));
});

test('도감 담기·중복·빼기: 첫 출처와 시각 유지, 어깨번호별 ID 구별, 원본 보존', () => {
  const empty = {}, first = addWord(empty, entry, 'star', 1000);
  assert.deepEqual(empty, {}); assert.deepEqual(first, { 10: word });
  assert.equal(addWord(first, entry, 'baseform', 2000), first);
  const both = addWord(first, { ...entry, id: '11', hn: 2 }, 'quickfind', 2000);
  assert.equal(tabCounts(both)[1], 2);
  assert.deepEqual(removeWord(both, '10'), { 11: { ...word, hn: 2, from: 'quickfind', at: 2000 } });
  assert.equal(removeWord(first, '없는 ID'), first); assert.ok(first['10']);
  assert.deepEqual(addWord({}, { ...entry, id: '__proto__' }, 'star', 1000), {});
  assert.deepEqual(addWord({}, entry, 'other', 1000), {});
});

test('도감 저장: 왕복과 손상 항목 복구, 잘못된 버전·형식·수치 제거', () => {
  assert.deepEqual(JSON.parse(serializeCollection({ 10: word })), { version: 1, words: { 10: word } });
  assert.deepEqual(parseCollection(serializeCollection({ 10: word })), { 10: word });
  for (const value of [null, '', '깨진 JSON', 'null', '[]', '{"version":2,"words":{}}', '{"version":1}', '{"version":1,"words":[]}', '{"version":1,"words":"값"}']) assert.deepEqual(parseCollection(value), {});
  const bad = [null, [], {}, { ...word, w: '' }, { ...word, w: 'abc' }, { ...word, w: 1 },
    { ...word, hn: -1 }, { ...word, hn: 1.5 }, { ...word, seq: -1 }, { ...word, seq: '7' },
    { ...word, seq: Number.MAX_SAFE_INTEGER + 1 }, { ...word, from: 'toString' }, { ...word, from: null }, { ...word, from: ['star'] },
    { ...word, at: -1 }, { ...word, at: '1000' }, { ...word, at: Infinity }];
  const words = Object.fromEntries(bad.map((w, i) => [String(i + 20), w]));
  Object.assign(words, { 10: { ...word, extra: '버림' }, bad: word, '__proto__': word });
  assert.deepEqual(parseCollection(serializeCollection(words)), { 10: word });
  for (const from of ['star', 'quickfind', 'openonce', 'baseform']) assert.equal(parseCollection(serializeCollection({ 10: { ...word, from } }))[10].from, from);
});

test('도감 완성: 낱말 수와 무관하게 14칸 모두 모아야 한다', () => {
  assert.equal(isComplete({}), false);
  let words = {};
  [...'가나다라마바사아자차카타파하'].forEach((w, i) => { words = addWord(words, { id: String(i), w, hn: 0, seq: i }, 'star', 1); });
  assert.deepEqual(tabCounts(words), TABS.map(() => 1)); assert.equal(isComplete(words), true);
  assert.equal(isComplete(removeWord(words, '13')), false);
});
