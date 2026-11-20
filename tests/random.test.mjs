import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pick, randomSet } from '../src/random.js';
import { mapHtml, resultHeading, setName } from '../src/game-ui.js';
import { parseBests as quickBests } from '../src/quickfind.js';
import { parseBests as baseBests, summarize } from '../src/baseform.js';
import { parseBests as openBests } from '../src/openonce.js';

test('무작위 뽑기: 지정 개수·중복 없음·원본 보존·주입한 난수로 결정적 결과', () => {
  const bank = Object.freeze(['가', '나', '다', '라']);
  assert.deepEqual(pick(bank, 3, () => .5), ['다', '가', '라']);
  assert.deepEqual(pick(bank, 3, () => .5), pick(bank, 3, () => .5));
  assert.deepEqual(pick(bank, 3, () => 0), ['가', '나', '다']);
  assert.deepEqual(pick(bank, 3, () => .999), ['라', '가', '나']);
  for (const n of [0, 1, 3, 4]) {
    const selected = pick(bank, n);
    assert.equal(selected.length, n);
    assert.equal(new Set(selected).size, n);
    assert.ok(selected.every((item) => bank.includes(item)));
  }
  assert.deepEqual(bank, ['가', '나', '다', '라']);
  assert.deepEqual(pick([], 0), []);
});

test('무작위 뽑기: 은행 초과·음수·소수 등 잘못된 개수는 오류', () => {
  for (const n of [4, -1, .5, NaN, Infinity, '1']) assert.throws(() => pick([1, 2, 3], n), RangeError);
  assert.throws(() => pick([], 1), RangeError);
});

test('무작위 도전: 빌드된 전체 은행 사용·원래 단계 표시·스테이지 불변·색인 규칙 분리', () => {
  for (const [kind, file, size, n] of [['quickfind', 'quick-find', 60, 5], ['baseform', 'base-form', 45, 5], ['openonce', 'open-once', 80, 10]]) {
    const text = fs.readFileSync(`data/build/games/${file}.json`, 'utf8'), source = JSON.parse(text);
    const bank = source.sets.flatMap((s) => s.items.map((item) => ({ ...item, level: s.level })));
    assert.equal(bank.length, size);
    for (const key of kind === 'openonce' ? ['random', 'random-notab'] : ['random']) {
      const set = randomSet(source, kind, key);
      assert.equal(set.set, key);
      assert.equal(set.level, key === 'random-notab' ? '어려움' : '쉬움');
      assert.equal(set.items.length, n);
      assert.equal(new Set(set.items.map((item) => item.id)).size, n);
      for (const item of set.items) assert.deepEqual(item, bank.find((q) => q.id === item.id));
    }
    assert.deepEqual(source, JSON.parse(text));
  }
});

const serialize = (sets) => JSON.stringify({ version: 1, sets });
const quick = { found: 5, totalMs: 12345 };
const base = summarize(Array.from({ length: 5 }, () => ({ hints: 0, wrong: 0, flips: 1, revealed: false })));

test('무작위 기록: 기존 스테이지 키와 무작위 키를 함께 보존', () => {
  for (const [parse, sets] of [
    [quickBests, { 1: quick, 12: { found: 0, totalMs: 500000 }, random: quick }],
    [baseBests, { 1: base, 9: base, random: base }],
    [openBests, { 1: 0, 8: 100, random: 85, 'random-notab': 60 }],
  ]) assert.deepEqual(parse(serialize(sets)), sets);
});

test('무작위 기록: 잘못된 키·손상된 무작위 값은 버리고 기존 기록 보존', () => {
  for (const bad of [null, 5, { ...quick, found: 6 }, { ...quick, totalMs: -1 }, { ...quick, totalMs: 500001 }, { found: '5', totalMs: 10 }]) {
    assert.deepEqual(quickBests(serialize({ 1: quick, random: bad, 'random-notab': quick, random2: quick })), { 1: quick });
  }
  for (const bad of [null, 15, { ...base, score: 14 }, { ...base, records: [] }, { ...base, records: [null, ...base.records.slice(1)] }]) {
    assert.deepEqual(baseBests(serialize({ 1: base, random: bad, 'random-notab': base, random2: base })), { 1: base });
  }
  for (const bad of [null, -1, 101, 1.5, '90', {}]) {
    assert.deepEqual(openBests(serialize({ 1: 100, random: bad, 'random-notab': bad, random2: 100 })), { 1: 100 });
  }
  for (const parse of [quickBests, baseBests, openBests]) {
    for (const sets of [[], null, '손상']) assert.deepEqual(parse(serialize(sets)), {});
  }
});

test('무작위 지도·결과 이름: 어려움 아래 표지판·독립 기록과 별·색인별 이름', () => {
  for (const [kind, best] of [['quickfind', quick], ['baseform', base], ['openonce', 100]]) {
    const html = mapHtml(kind, '놀이', '', { sets: [{ set: 1, level: '어려움' }] }, { 1: best, random: best, 'random-notab': best });
    assert.ok(html.indexOf('data-set="random"') > html.indexOf('data-set="1"'));
    assert.match(html, /data-set="random"[^]*별 3개[^]*최고/);
    assert.doesNotMatch(html, /disabled/);
    assert.equal(html.includes('data-set="random-notab"'), kind === 'openonce');
    assert.match(resultHeading(kind, 'random', '결과', best, true), /무작위 도전/);
    assert.doesNotMatch(resultHeading(kind, 'random', '결과', best, true), /스테이지 random/);
  }
  assert.equal(setName('quickfind', 'random'), '무작위 도전');
  assert.equal(setName('baseform', 9), '스테이지 9');
  assert.equal(setName('openonce', 'random'), '무작위 도전 · 색인 사용');
  assert.equal(setName('openonce', 'random-notab'), '무작위 도전 · 색인 없이');
});
