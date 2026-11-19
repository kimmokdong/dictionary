// data/build 검증. 먼저 `npm run build:data`를 실행해야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sortKey, compareEntries, tabIndex, TABS } from '../scripts/data/sort.mjs';
import { textWidth, entrySegments } from '../scripts/data/typeset.mjs';
import { selectEntries, finalizeEntries } from '../scripts/data/select.mjs';
import { applyExampleEdits, loadExampleEdits, loadSenseRemovals } from '../scripts/data/edits.mjs';

const OUT = 'data/build';
const config = JSON.parse(fs.readFileSync('data/layout.config.json', 'utf8'));
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const readDir = (d) => fs.readdirSync(path.join(OUT, d)).filter((f) => /-\d+\.json$/.test(f)).sort()
  .flatMap((f) => readJson(path.join(d, f)));
const entries = readDir('entries');
const label = (e) => e.w + (e.hn ? `(${e.hn})` : '');

test('자모 순서: 쌍자음, 복합 모음, 받침, 글자 수', () => {
  const expected = ['가', '가게', '각', '간', '개', '고', '과', '괴', '구', '까', '까치', '나', '다', '따', '라',
    '바', '빠', '사', '싸', '아', '애', '야', '와', '의', '이', '자', '짜', '차', '하'];
  const shuffled = [...expected].reverse().map((w) => ({ key: sortKey(w), ohn: 0, id: w }));
  assert.deepEqual(shuffled.sort(compareEntries).map((e) => e.id), expected);
  assert.equal(TABS[tabIndex('까치')], 'ㄱ');
  assert.equal(TABS[tabIndex('쌀')], 'ㅅ');
  assert.equal(TABS[tabIndex('힘')], 'ㅎ');
});

test('수록 표제어: 정렬 순서, 중복 없음, 어깨번호', () => {
  assert.ok(entries.length > 20000);
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
  entries.forEach((e, i) => {
    assert.equal(e.seq, i);
    assert.ok(config.grades.includes(e.grade));
    if (!i) return;
    const p = entries[i - 1];
    const c = compareEntries({ key: sortKey(p.w), ohn: p.ohn, id: p.id }, { key: sortKey(e.w), ohn: e.ohn, id: e.id });
    assert.ok(c < 0, `${label(p)} → ${label(e)}`);
    if (p.w === e.w) assert.equal(e.hn, p.hn + 1); else assert.ok(e.hn <= 1);
  });
});

for (const size of Object.keys(config.sizes)) {
  test(`조판 불변식 (${size})`, () => {
    const index = readJson(`${size}/index.json`);
    const pages = readDir(size);
    assert.equal(pages.length, index.pageCount);
    let nextSeq = 0;
    pages.forEach((page, pi) => {
      assert.equal(page.n, pi + 1);
      assert.ok(page.l.length > 0, `빈 쪽 ${page.n}`);
      let y = 0;
      const heads = [];
      for (const line of page.l) {
        y += (line.g ? index.entryGap : 0) + index.lineHeight;
        const w = line.r.reduce((s, [k, t]) => s + textWidth(index.kinds, k, t, index.fontSize), 0);
        assert.ok(w <= index.textWidth - (line.i ? index.indent : 0), `폭 초과 ${page.n}쪽: ${line.r.map((r) => r[1]).join('')}`);
        if (line.h) {
          assert.equal(line.e, nextSeq, `${page.n}쪽 표제어 순서`);
          assert.equal(index.entryPage[line.e], page.n);
          assert.equal(line.r[0][1], entries[line.e].w);
          heads.push(line.e);
          nextSeq++;
        } else assert.ok(line.e === nextSeq - 1, `${page.n}쪽 이어지는 줄`);
      }
      assert.ok(y <= index.textHeight + 1e-6, `높이 초과 ${page.n}쪽`);
      const src = heads.length ? heads : [page.l[0].e];
      assert.deepEqual(page.g, [label(entries[src[0]]), label(entries[src.at(-1)])]);
      assert.deepEqual(index.guides[pi], page.g);
    });
    assert.equal(nextSeq, entries.length);

    // 색인 구간이 1쪽부터 마지막 쪽까지 빈틈·겹침 없이 덮는다.
    let expectStart = 1;
    for (const s of index.sections.filter((s) => s.pages)) {
      assert.equal(s.start, expectStart, `${s.tab} 시작 쪽`);
      assert.equal(s.pages, s.end - s.start + 1);
      const first = pages[s.start - 1].l[0];
      assert.ok(first.h && TABS[tabIndex(entries[first.e].w)] === s.tab, `${s.tab} 구간 첫 쪽`);
      expectStart = s.end + 1;
    }
    assert.equal(expectStart, index.pageCount + 1);
  });
}

test('뜻풀이는 원문대로, 예문은 검증한 수정본만 적용된다', () => {
  const { entries: expected, removedSenses } = selectEntries(config);
  const edits = loadExampleEdits();
  const { examplesEdited, skipped } = applyExampleEdits(expected, edits, removedSenses);
  assert.deepEqual(skipped, []);
  assert.equal(examplesEdited, edits.filter(({ key }) => !removedSenses.has(key.slice(0, key.lastIndexOf('-')))).length);
  assert.equal(entries.length, expected.length);
  entries.forEach((e, i) => {
    assert.equal(e.id, expected[i].id);
    assert.deepEqual(e.senses, expected[i].senses, e.w);
  });
  const summary = readJson('report/summary.json');
  assert.equal(summary.examplesEdited, examplesEdited);
  assert.equal(summary.examplesEditSkipped, 0);
});

test('뜻 삭제: 일부·전부 삭제, 없는 키 보고, 어깨번호·순번·뜻번호 재부여', () => {
  const entry = (id, w, ohn, ids) => ({ id, w, ohn, key: sortKey(w), hn: ohn, seq: 99,
    senses: ids.map((id) => ({ id, def: `원문 뜻 ${id}`, ex: [], rel: [] })) });
  const removals = ['10-1', '20-1', '30-1', '99-1'].map((key) => ({ key, word: '낱말', reason: '' }));
  const result = finalizeEntries([
    entry('50', '눈', 4, ['1']), entry('40', '눈', 3, ['1']), entry('30', '눈', 1, ['1']),
    entry('20', '가', 1, ['1']), entry('10', '가', 2, ['1', '3', '5']),
  ], removals);
  assert.deepEqual(result.entries.map(({ id, hn, seq }) => ({ id, hn, seq })), [
    { id: '10', hn: 0, seq: 0 }, { id: '40', hn: 1, seq: 1 }, { id: '50', hn: 2, seq: 2 },
  ]);
  assert.deepEqual(result.entries[0].senses.map((s) => s.id), ['3', '5']);
  assert.deepEqual([...result.removedSenses].sort(), ['10-1', '20-1', '30-1']);
  assert.deepEqual(result.removedEntries, [{ id: '30', w: '눈' }, { id: '20', w: '가' }]);
  assert.deepEqual(result.missingRemovals, [removals.at(-1)]);
  assert.deepEqual(entrySegments(result.entries[0]).filter((s) => s.k === 'n').map((s) => s.t), ['①', '②']);
  const empty = finalizeEntries([entry('1', '가', 1, ['1'])], [{ key: '1-1' }]);
  assert.deepEqual(empty.entries, []);
  assert.equal(empty.removedEntries.length, 1);
});

test('생성 데이터: 삭제 목록의 뜻과 빈 항목이 없고 삭제 통계·미발견 0이 맞다', () => {
  const removals = loadSenseRemovals();
  const remaining = new Set(entries.flatMap((e) => e.senses.map((s) => `${e.id}-${s.id}`)));
  assert.ok(removals.length > 0);
  for (const { key } of removals) assert.ok(!remaining.has(key), `삭제되지 않은 뜻 ${key}`);
  assert.ok(entries.every((e) => e.senses.length > 0));
  const summary = readJson('report/summary.json');
  assert.equal(summary.sensesRemoved, removals.length);
  assert.equal(summary.removeMissing, 0);
  assert.ok(summary.entriesRemoved > 0); // 목록이 바뀌면 수가 달라진다
  assert.equal(summary.entries, entries.length);
});

test('예문 수정: 실제로 삭제한 뜻만 조용히 무시하고 미발견 키는 보고한다', () => {
  const { entries, removedSenses, missingRemovals } = finalizeEntries([
    { id: '10', w: '가', key: '가', ohn: 0, senses: [
      { id: '1', ex: ['지울 예문.'] }, { id: '3', ex: ['남길 예문.'] },
    ] },
    { id: '20', w: '나', key: '나', ohn: 0, senses: [{ id: '1', ex: ['지울 항목.'] }] },
  ], ['10-1', '20-1', '99-1'].map((key) => ({ key })));
  assert.equal(missingRemovals.length, 1);
  const { examplesEdited, skipped } = applyExampleEdits(entries, [
    ...['10-1-0', '20-1-0', '99-1-0'].map((key) => ({ key, original: '원문.', replacement: '수정.' })),
    { key: '10-3-0', original: '남길 예문.', replacement: '고친 예문.' },
    { key: '10-3-1', original: '원문.', replacement: '수정.' },
  ], removedSenses);
  assert.equal(examplesEdited, 1);
  assert.deepEqual(skipped.map((s) => s.key), ['99-1-0', '10-3-1']);
  assert.deepEqual(entries[0].senses[0].ex, ['고친 예문.']);
});

test('예문 수정: 키·뜻·순번으로 적용하고 원문 불일치·없는 키는 건너뛴다', () => {
  const entries = [{ id: '10', w: '낱말', senses: [{ id: '2', def: '원문 뜻풀이', ex: ['첫 예문.', '둘째 예문.'] }] }];
  const { examplesEdited, skipped } = applyExampleEdits(entries, [
    { key: '10-2-1', original: '둘째 예문.', replacement: '고친 예문.' },
    { key: '10-2-0', original: '다른 원문.', replacement: '바뀌면 안 됨.' },
    ...['99-2-0', '10-9-0', '10-2-2'].map((key) => ({ key, original: '첫 예문.', replacement: '없는 예문.' })),
  ]);
  assert.equal(examplesEdited, 1);
  assert.deepEqual(skipped, [
    { key: '10-2-0', reason: '원문 불일치', original: '다른 원문.', actual: '첫 예문.' },
    ...['99-2-0', '10-9-0', '10-2-2'].map((key) => ({ key, reason: '없는 키', original: '첫 예문.' })),
  ]);
  assert.deepEqual(entries, [{ id: '10', w: '낱말', senses: [{ id: '2', def: '원문 뜻풀이', ex: ['첫 예문.', '고친 예문.'] }] }]);
});

test('예문 수정: 끝 공백은 ␣ 하나로 대조하고 앞·가운데 공백은 보존한다', () => {
  const ex = ['예문. ', '예문.\t  \r\n', '  앞  공백. ', '끝 공백 없음.', '끝 공백 있음. '];
  const entries = [{ id: '1', senses: [{ id: '1', ex }] }];
  const { examplesEdited, skipped } = applyExampleEdits(entries, [
    { key: '1-1-0', original: '예문.␣', replacement: '수정 0.' },
    { key: '1-1-1', original: '예문.␣', replacement: '수정 1.' },
    { key: '1-1-2', original: '  앞  공백.␣', replacement: '수정 2.' },
    { key: '1-1-3', original: '끝 공백 없음.␣', replacement: '바뀌면 안 됨.' },
    { key: '1-1-4', original: '끝 공백 있음.', replacement: '바뀌면 안 됨.' },
  ]);
  assert.equal(examplesEdited, 3);
  assert.equal(skipped.length, 2);
  assert.ok(skipped.every((s) => s.reason === '원문 불일치'));
  assert.deepEqual(ex, ['수정 0.', '수정 1.', '수정 2.', '끝 공백 없음.', '끝 공백 있음. ']);
});
