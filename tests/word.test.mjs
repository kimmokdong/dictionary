import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { firstEntry, spreadForEntry, nearestEntry, entryHtml } from '../src/word.js';

const readIndex = (size) => JSON.parse(fs.readFileSync(`data/build/${size}/index.json`, 'utf8'));

test('단계 전환: 첫 쪽·중간·마지막에서 첫 표제어가 새 펼침에 보인다', () => {
  const indexes = ['normal', 'large', 'xlarge'].map(readIndex);
  for (const old of indexes) for (const left of [0, 600, old.pageCount & ~1]) {
    const seq = firstEntry(old, left);
    for (const next of indexes) {
      const target = spreadForEntry(next, seq);
      assert.equal(target % 2, 0);
      assert.ok(next.entryPage[seq] === target || next.entryPage[seq] === target + 1);
      assert.ok(target >= 0 && target <= next.pageCount);
    }
  }
});

test('이어지는 줄보다 새로 시작하는 첫 표제어 우선, 이어지는 줄만 있으면 해당 항목', () => {
  assert.equal(firstEntry({ entryPage: [1, 2, 4, 4, 5, 8] }, 4), 2);
  assert.equal(firstEntry({ entryPage: [1, 2, 9] }, 6), 1);
  assert.equal(spreadForEntry({ entryPage: [1, 2, 3, 4] }, 2), 2);
});

test('낱말 판정: 모든 줄 내부·줄 사이·20px 여유와 바깥 빈 곳', () => {
  const lines = [{ entry: 0, top: 50, bottom: 72 }, { entry: 0, top: 72, bottom: 94 }, { entry: 1, top: 100, bottom: 122 }];
  assert.equal(nearestEntry(lines, 60), 0);
  assert.equal(nearestEntry(lines, 90), 0);
  assert.equal(nearestEntry(lines, 95), 0);
  assert.equal(nearestEntry(lines, 99), 1);
  assert.equal(nearestEntry(lines, 142), 1);
  assert.equal(nearestEntry(lines, 143), null);
  assert.equal(nearestEntry([], 60), null);
});

test('쪽지: 원문 보존·HTML 이스케이프·어깨번호·학년·추가 정보', () => {
  const entry = { w: '<눈>', hn: 2, pos: '명사', grade: 3,
    pronunciation: ['눈'], forms: [], origin: '原', derived: ['눈길'],
    senses: [{ n: 2, sentences: ['예문 <그대로>.'], dialogue: ['원문 & 가.', '원문 나.'] }],
    phrases: [{ type: '관용구', w: '눈에 들다', def: '뜻 & 원문.' }] };
  const html = entryHtml(entry);
  for (const text of ['&lt;눈&gt;<sup>2</sup>', '명사 · 3~4학년', '뜻 &amp; 원문.', '예문 &lt;그대로&gt;.', '② 예문', '원문 &amp; 가.', '눈길']) assert.ok(html.includes(text));
  assert.ok(!html.includes('비슷한말') && !html.includes('반대말'));
});

test('쪽지: 추가 정보가 없으면 지면 안내만 보인다', () => {
  const html = entryHtml({ w: '가', pos: '조사', grade: 1, pronunciation: [], forms: [], senses: [], phrases: [], derived: [] });
  assert.ok(html.includes('이 낱말은 지면에 실린 내용이 전부예요.'));
});
