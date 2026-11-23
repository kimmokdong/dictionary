import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KINDS, MAX_SCORE, scoreForTries, summarize, originClue, parseBests, serializeBests, resultPraise } from '../src/wordkind.js';
import { starCount } from '../src/game-ui.js';
import { randomSet } from '../src/random.js';
import { kindHtml, kindInfo, kindParts, cleanOrigin, topic } from '../src/word.js';
import { linkGame } from '../scripts/data/games.mjs';

test('우리말 분류 점수: 한 번에 맞히면 2점, 두 번째에 맞히면 1점, 못 맞히면 0점', () => {
  assert.deepEqual([[1, true], [2, true], [2, false]].map(([tries, correct]) => scoreForTries(tries, correct)), [2, 1, 0]);
  const records = [{ tries: 1, correct: true }, { tries: 2, correct: true }, { tries: 2, correct: false }];
  assert.equal(summarize(records), 3);
  assert.match(resultPraise(records)[0], /3문제 중 1문제를 한 번에/);
});

test('우리말 분류 별: 16점 만점에서 8·12·15점이 별 1·2·3개', () => {
  assert.deepEqual([0, 7, 8, 11, 12, 14, 15, 16].map((score) => starCount('wordkind', score)), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('우리말 분류 기록: 스테이지 1~9와 random만, 0~16점 정수만 살린다', () => {
  const sets = { 1: 16, 9: 0, random: 12 };
  assert.deepEqual(parseBests(serializeBests(sets)), sets);
  assert.deepEqual(parseBests(JSON.stringify({ version: 1, sets: { 10: 3, 2: 17, 3: 1.5, 4: -1, random: '8' } })), {});
  assert.deepEqual(parseBests('{망가진'), {});
  assert.deepEqual(parseBests(JSON.stringify({ version: 2, sets })), {});
});

test('원어 단서와 조사', () => {
  assert.equal(originClue('葡萄'), '사전의 원어: 葡萄');
  assert.equal(originClue(undefined), '사전에 원어 표시가 없어요.');
  assert.equal(topic('포도'), "'포도'는");
  assert.equal(topic('휴지통'), "'휴지통'은");
});

test('쪽지 어종 띠: 어종과 원어, 쉬운 풀이를 함께 보이고 어종을 모르면 띠를 만들지 않는다', () => {
  assert.match(kindHtml({ w: '도서관', kind: '한자어', origin: '圖書館' }), /data-kind="한자어">한자어<\/span> <span class="kind-origin">원어 圖書館<\/span><\/p><p class="kind-note">한자 圖書館로 쓰는 말이에요/);
  assert.match(kindHtml({ w: '하늘', kind: '고유어' }), /순우리말이에요/);
  assert.equal(kindHtml({ w: '삼', origin: '蔘' }), '');
  assert.match(kindHtml({ w: 'x', kind: '외래어', origin: '<b>' }), /&lt;b&gt;/);
  // 어려운 용어는 쓰지 않는다
  for (const entry of [{ w: '숭고하다', kind: '혼종어', origin: '崇高하다' }, { w: '빵', kind: '고유어' }, { w: '담요', kind: '혼종어' }])
    assert.doesNotMatch(kindHtml(entry), /혼종어<|귀화어/);
});

test('원어 정리: 기호를 빼고 여러 표기 중 첫 표기에 우리말 끝을 붙인다', () => {
  assert.equal(cleanOrigin('感歎/感嘆하다'), '感歎하다');
  assert.equal(cleanOrigin('沙糖▽/砂糖▽'), '沙糖');
  assert.equal(cleanOrigin('←air conditioner'), 'air conditioner');
});

test('섞인 말 나누기: 한자·우리말·외국 글자 조각을 낱말 음절에 맞춘다', () => {
  const show = (w, o) => kindParts(w, o)?.map((p) => `${p.text}${p.src ? `(${p.src})` : ''}:${p.kind}`).join(' ');
  assert.equal(show('숭고하다', '崇高하다'), '숭고(崇高):한자어 하다:고유어');
  assert.equal(show('금메달', '金medal'), '금(金):한자어 메달(medal):외래어');
  assert.equal(show('물파스', '물←Pasta'), '물:고유어 파스(Pasta):외래어');
  assert.equal(show('감탄하다', '感歎/感嘆하다'), '감탄(感歎):한자어 하다:고유어');
  assert.equal(kindParts('관리실', '管理室'), null);
  assert.equal(kindParts('하다', '崇高하다'), null);
  assert.equal(kindParts('담요', undefined), null);
  assert.equal(kindInfo({ w: '숭고하다', kind: '혼종어', origin: '崇高하다' }).text, "'숭고'(崇高)는 한자어, '하다'는 고유어예요. 서로 다른 말이 합쳐진 낱말이에요.");
  assert.equal(kindInfo({ w: '숭고하다', kind: '혼종어', origin: '崇高하다' }).label, '한자어 + 고유어');
  assert.equal(kindInfo({ w: '담요', kind: '혼종어' }).label, '섞인 말');
});

test('외국에서 왔거나 한자에서 왔지만 우리말로 굳은 낱말은 뿌리를 풀어 준다', () => {
  assert.match(kindInfo({ w: '빵', kind: '고유어' }).text, /^포르투갈어 pão에서 들어왔지만, 오래 써서 우리말처럼 굳어진 말이에요\. 그래서 사전에서는 고유어로 봐요\.$/);
  assert.match(kindInfo({ w: '배추', kind: '고유어' }).text, /^한자 白菜\(백채\)에서 왔지만, 소리가 바뀌어/);
  assert.equal(kindInfo({ w: '하늘', kind: '고유어' }).text, '예부터 우리가 써 온 순우리말이에요.');
});

test('무작위 도전은 문제 은행에서 겹치지 않게 8개를 뽑는다', () => {
  const source = { sets: [1, 2].map((set) => ({ set, level: set === 1 ? '쉬움' : '어려움',
    items: Array.from({ length: 8 }, (_, i) => ({ w: `${set}-${i}`, kind: '고유어' })) })) };
  const set = randomSet(source, 'wordkind', 'random');
  assert.equal(set.items.length, 8);
  assert.equal(new Set(set.items.map((item) => item.w)).size, 8);
});

test('문제 자료: 9스테이지 × 8문제, 스테이지마다 외래어 2개, 어종은 세 가지 중 하나이고 빌드 결과와 같다', () => {
  const source = JSON.parse(fs.readFileSync('data/games/word-kind.json', 'utf8'));
  const built = JSON.parse(fs.readFileSync('data/build/games/word-kind.json', 'utf8'));
  assert.equal(source.sets.length, 9);
  for (const set of source.sets) {
    assert.equal(set.items.length, 8);
    assert.equal(set.items.filter((item) => item.kind === '외래어').length, 2);
    assert.ok(set.items.every((item) => KINDS.includes(item.kind)));
  }
  assert.equal(new Set(source.sets.flatMap((s) => s.items.map((item) => item.id))).size, 72);
  assert.equal(MAX_SCORE, 8 * 2);
  const notes = new Map();
  for (const file of fs.readdirSync('data/build/notes')) for (const note of JSON.parse(fs.readFileSync(`data/build/notes/${file}`, 'utf8'))) notes.set(note.seq, note);
  for (const item of built.sets.flatMap((s) => s.items)) assert.equal(notes.get(item.seq).kind, item.kind, item.w);
});

test('문제의 어종이 어휘 목록과 다르면 빌드가 멈춘다', () => {
  const source = { sets: [{ set: 1, items: [{ w: '포도', id: '1', kind: '고유어' }] }] };
  assert.throws(() => linkGame('우리말 분류', source, [{ id: '1', w: '포도', seq: 3, kind: '한자어' }]), /어종 고유어.*한자어/);
  assert.equal(linkGame('우리말 분류', source, [{ id: '1', w: '포도', seq: 3, kind: '고유어' }]).sets[0].items[0].seq, 3);
});
