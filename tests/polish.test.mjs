import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decompose, jamoSlots, sortKey } from '../scripts/data/sort.mjs';
import { orderComparison, entryHtml } from '../src/word.js';
import { collectNotes } from '../scripts/data/notes.mjs';
import { starCount, progressStates, mapHtml, resultActions, resultHeading } from '../src/game-ui.js';

test('자모 풀이: 쌍자음·겹받침·복합 모음을 한 자리로, 정렬과 같은 정규화', () => {
  assert.deepEqual(decompose('가방'), [...'ㄱㅏㅂㅏㅇ']);
  assert.deepEqual(decompose('까닭'), [...'ㄲㅏㄷㅏㄺ']);
  assert.deepEqual(decompose('괜찮다'), [...'ㄱㅙㄴㅊㅏㄶㄷㅏ']);
  assert.deepEqual(decompose('가- 방'), decompose('가방'));
  assert.deepEqual(jamoSlots('가'), ['ㄱ', 'ㅏ', '']);
});

test('첫 차이와 설명: 같은 낱말·길이·빈 받침 자리·쌍자음·겹받침', () => {
  const cmp = orderComparison('가발', '가방');
  assert.equal(cmp.slot, 5); assert.equal(cmp.common, 4);
  assert.equal(cmp.text, "'가발'과 '가방'은 넷째 자모까지 같아요. 다섯째에서 'ㄹ'이 'ㅇ'보다 먼저라서 '가발'이 앞에 와요.");
  assert.equal(orderComparison('눈', '눈').slot, -1);
  assert.equal(orderComparison('눈', '눈').text, '글자가 똑같아서 어깨번호 차례로 놓여요.');
  assert.match(orderComparison('가', '가게').text, /먼저 끝나서/);
  assert.match(orderComparison('가능하다', '가다').text, /^'가능하다'와 '가다'는.*'가능하다'가 앞에/);
  assert.match(orderComparison('가게', '각').text, /받침 없는 '가'.*받침 'ㄱ'/);
  assert.match(orderComparison('가', '까').text, /첫째에서 'ㄱ'이 'ㄲ'/);
  assert.match(orderComparison('달', '닭').text, /셋째에서 'ㄹ'이 'ㄺ'/);
  for (const [a, b] of [['가게', '각'], ['가', '까'], ['달', '닭'], ['괴다', '교가']]) assert.ok(sortKey(a) < sortKey(b));
});

test('관련어: 빌드 때 첫 동음이의어의 seq를 연결하고 없는 말은 텍스트', () => {
  const base = { hn: 0, pos: '명사', grade: 1, senses: [] };
  const entries = [{ ...base, seq: 0, id: '1', w: '가', senses: [{ id: 's', ex: [], rel: [
    { type: '유의어', w: ' 나 ' }, { type: '반대말', w: '없는말' }, { type: '유의어', w: '가' },
  ] }] }, { ...base, seq: 1, id: '2', w: '나' }, { ...base, seq: 2, id: '3', w: '나' }];
  const note = collectNotes(entries, [])[0];
  assert.equal(note.related[0].seq, 1); assert.equal(note.related[1].seq, undefined); assert.equal(note.related[2].seq, 0);
  const html = entryHtml(note, { after: entries[1] });
  assert.match(html, /data-seq="0"/); assert.match(html, /data-seq="1"/);
  assert.match(html, /반대말<\/h3><p>없는말<\/p>/);
  assert.equal((html.match(/class="order-pair"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /phrase-cards/);
  assert.equal((entryHtml(note, { before: entries[0] }).match(/class="order-pair"/g) ?? []).length, 1);
});

test('생성 관련어: 모든 링크는 수록 표제어 첫 순번이고 조판 자료는 바꾸지 않는다', () => {
  const entries = fs.readdirSync('data/build/entries').sort().flatMap((f) => JSON.parse(fs.readFileSync(`data/build/entries/${f}`, 'utf8')));
  const notes = fs.readdirSync('data/build/notes').sort().flatMap((f) => JSON.parse(fs.readFileSync(`data/build/notes/${f}`, 'utf8')));
  const first = new Map();
  const normalize = (w) => w.normalize('NFC').replace(/\s+/g, '');
  for (const e of entries) if (!first.has(normalize(e.w))) first.set(normalize(e.w), e.seq);
  let links = 0;
  for (const note of notes) for (const r of note.related) {
    assert.equal(r.seq, first.get(normalize(r.w)));
    if (r.seq !== undefined) links++;
  }
  assert.ok(links > 1000);
});

test('별 기준 경계: 최고 기록의 형식과 저장 키를 바꾸지 않고 계산', () => {
  assert.equal(starCount('quickfind'), 0);
  assert.deepEqual([0, 1, 4, 5].map((found) => starCount('quickfind', { found, totalMs: 200001 })), [0, 1, 1, 2]);
  assert.equal(starCount('quickfind', { found: 5, totalMs: 200000 }), 3);
  assert.deepEqual([0, 29, 30, 59, 60, 84, 85, 100].map((n) => starCount('openonce', n)), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual([0, 4, 5, 9, 10, 13, 14, 15].map((score) => starCount('baseform', { score })), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('진행 점: 첫 문제·맞힘·놓침·피드백·마지막 완료', () => {
  assert.deepEqual(progressStates(3, [], 0), ['current', 'waiting', 'waiting']);
  assert.deepEqual(progressStates(3, [true, false], 2), ['correct', 'missed', 'current']);
  assert.deepEqual(progressStates(3, [true], null), ['correct', 'waiting', 'waiting']);
  assert.deepEqual(progressStates(3, [true, false, true], null), ['correct', 'missed', 'correct']);
});

test('지도와 결과: 잠금 없음·저장 별·다음 스테이지 경계·도장', () => {
  const html = mapHtml('openonce', '한 번에 펼치기', '', { sets: [{ set: 1, level: '쉬움' }, { set: 2, level: '어려움' }] }, { 1: 85 });
  assert.match(html, /모험 지도/); assert.match(html, /별 3개/); assert.match(html, /별 0개/);
  assert.doesNotMatch(html, /disabled|세트/);
  assert.match(resultActions(true), /다음 스테이지 →/); assert.doesNotMatch(resultActions(false), /next-stage/);
  assert.match(resultHeading('openonce', 1, '100점', 100, true), /최고 기록 갱신!/);
});
