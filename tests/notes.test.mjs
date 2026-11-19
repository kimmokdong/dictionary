import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectNotes, hasNoteInfo } from '../scripts/data/notes.mjs';

const feat = (pairs) => ({ feat: Object.entries(pairs).map(([att, val]) => ({ att, val })) });
const example = (type, ...lines) => ({ feat: [{ att: 'type', val: type }, ...lines.map((val) => ({ att: 'example', val }))] });
const entry = { seq: 0, id: '1', w: '낱말', hn: 0, pos: '명사', grade: 2,
  senses: [{ id: '2', ex: ['지면 문장.'] }, { id: '5', ex: [] }] };

test('notes: 지면·중복 예문 제외, 뜻 순번·대화 원문과 개수 제한', () => {
  const raw = { val: '1', ...feat({ lexicalUnit: '단어', origin: '原語' }),
    Sense: [{ val: '2', SenseExample: [example('문장', '지면 문장.'), example('문장', '  원문 & 첫째.  '),
      example('문장', '  원문 & 첫째.  '), example('문장', '둘째.'), example('문장', '셋째.'),
      example('대화', '가 원문.', '나 원문.'), example('대화', '제외 가.', '제외 나.')] },
    { val: '5', SenseExample: example('문장', '다음 뜻.') }],
    WordForm: [feat({ type: '발음', pronunciation: '낱말' }), feat({ type: '발음', pronunciation: '난말' }),
      ...Array.from({ length: 6 }, (_, i) => ({ ...feat({ type: '활용', writtenForm: `활용${i}` }),
        FormRepresentation: feat({ type: '준말', writtenForm: `준말${i}` }) }))],
    RelatedForm: Array.from({ length: 7 }, (_, i) => feat({ type: '파생어', writtenForm: `파생${i}` })),
  };
  const [note] = collectNotes([entry], [raw]);
  assert.deepEqual(note.senses, [{ n: 1, sentences: ['  원문 & 첫째.  ', '둘째.'], dialogue: ['가 원문.', '나 원문.'] },
    { n: 2, sentences: ['다음 뜻.'], dialogue: [] }]);
  assert.deepEqual(note.pronunciation, ['난말']);
  assert.equal(note.forms.length, 4);
  assert.deepEqual(note.forms[0], { w: '활용0', short: ['준말0'] });
  assert.equal(note.derived.length, 5);
  assert.equal(note.origin, '原語');
  assert.ok(hasNoteInfo(note));
  assert.deepEqual(entry.senses[0].ex, ['지면 문장.']);
});

test('notes: 같은 ID의 관용구·속담만 최대 5개, 첫 뜻풀이 연결', () => {
  const phrase = (id, i) => ({ val: id, ...feat({ lexicalUnit: i % 2 ? '속담' : '관용구' }),
    Lemma: feat({ writtenForm: `표현${i}` }), Sense: [feat({ definition: `첫 뜻${i}` }), feat({ definition: '둘째 뜻' })] });
  const [note] = collectNotes([entry], [phrase('다른 ID', 0), ...Array.from({ length: 7 }, (_, i) => phrase('1', i))]);
  assert.equal(note.phrases.length, 5);
  assert.deepEqual(note.phrases[1], { type: '속담', w: '표현1', def: '첫 뜻1' });
  assert.ok(hasNoteInfo(note));
  assert.ok(!hasNoteInfo(collectNotes([entry], [])[0]));
});

test('notes: 삭제한 뜻의 예문은 제외하고 남은 뜻 순번을 다시 매긴다', () => {
  const filtered = { ...entry, senses: [entry.senses[1]] };
  const [note] = collectNotes([filtered], [{ val: '1', ...feat({ lexicalUnit: '단어' }), Sense: [
    { val: '2', SenseExample: example('문장', '삭제한 뜻의 예문.') },
    { val: '5', SenseExample: example('문장', '남은 뜻의 예문.') },
  ] }]);
  assert.deepEqual(note.senses, [{ n: 1, sentences: ['남은 뜻의 예문.'], dialogue: [] }]);
});

test('생성 notes: 순번·묶음·통계·지면 예문 중복과 개수 검증', () => {
  const files = fs.readdirSync('data/build/notes').sort();
  let count = 0, withInfo = 0, bytes = 0;
  for (const [c, file] of files.entries()) {
    const text = fs.readFileSync(`data/build/notes/${file}`);
    bytes += text.length;
    const notes = JSON.parse(text);
    const entries = JSON.parse(fs.readFileSync(`data/build/entries/entries-${String(c).padStart(4, '0')}.json`, 'utf8'));
    assert.equal(notes.length, entries.length);
    notes.forEach((note, i) => {
      assert.equal(note.seq, count++);
      assert.equal(note.w, entries[i].w);
      assert.ok(note.forms.length <= 4 && note.derived.length <= 5 && note.phrases.length <= 5);
      const printed = entries[i].senses.flatMap((s) => s.ex);
      for (const s of note.senses) {
        assert.ok(s.n >= 1 && s.n <= entries[i].senses.length && s.sentences.length <= 2);
        for (const text of [...s.sentences, ...s.dialogue]) assert.ok(!printed.includes(text));
      }
      if (hasNoteInfo(note)) withInfo++;
    });
  }
  const summary = JSON.parse(fs.readFileSync('data/build/report/summary.json', 'utf8'));
  assert.equal(count, summary.entries);
  assert.deepEqual(summary.notes, { entriesWithInfo: withInfo, totalBytes: bytes });
});
