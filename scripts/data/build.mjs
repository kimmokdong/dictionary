// data/raw → data/build : 선별·뜻 삭제·정렬 → 예문 수정 → 조판 → 쪽 묶음 파일.
import fs from 'node:fs';
import path from 'node:path';
import { selectEntries } from './select.mjs';
import { paginate, missingGlyphs } from './typeset.mjs';
import { TABS } from './sort.mjs';
import { hasNoteInfo } from './notes.mjs';
import { applyExampleEdits } from './edits.mjs';
import { linkGame } from './games.mjs';

const OUT = 'data/build';
const config = JSON.parse(fs.readFileSync('data/layout.config.json', 'utf8'));
const write = (file, data) => {
  const p = path.join(OUT, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data));
};
const pad = (n) => String(n).padStart(4, '0');
const label = (e) => e.w + (e.hn ? `(${e.hn})` : '');

const { entries, notes, unmatched, stats, removedSenses, removedEntries, missingRemovals } = selectEntries(config);
const games = [['quick-find', '낱말 빨리 찾기'], ['open-once', '한 번에 펼치기']].map(([file, name]) =>
  [file, linkGame(name, JSON.parse(fs.readFileSync(`data/games/${file}.json`, 'utf8')), entries)]);
fs.rmSync(OUT, { recursive: true, force: true });
for (const [file, data] of games) write(`games/${file}.json`, data);
const { examplesEdited, skipped } = applyExampleEdits(entries, undefined, removedSenses);
write('report/unmatched.txt', unmatched.join('\n') + '\n');
write('report/edits.txt', `적용: ${examplesEdited}개\n건너뜀: ${skipped.length}개\n` +
  skipped.map((s) => `${s.key}\t${s.reason}\t수정본 원문: ${s.original}\t실제 원문: ${s.actual ?? '(없음)'}\n`).join('') +
  `\n뜻 삭제: ${stats.sensesRemoved}개\n표제어 제거: ${stats.entriesRemoved}개\n삭제 키 미발견: ${stats.removeMissing}개\n` +
  missingRemovals.map((r) => `${r.key}\t${r.word}\t삭제 키 없음\t${r.reason}\n`).join('') +
  '\n제거한 표제어 (항목 ID·낱말)\n' + removedEntries.map((e) => `${e.id}\t${e.w}\n`).join(''));

// 표제어 상세
for (let i = 0; i < entries.length; i += config.entriesPerChunk) {
  const chunk = entries.slice(i, i + config.entriesPerChunk).map((e) => ({
    seq: e.seq, id: e.id, w: e.w, hn: e.hn, ohn: e.ohn, pos: e.pos, grade: e.grade,
    origin: e.origin || undefined, senses: e.senses,
  }));
  write(`entries/entries-${pad(i / config.entriesPerChunk)}.json`, chunk);
  write(`notes/notes-${pad(i / config.entriesPerChunk)}.json`, notes.slice(i, i + config.entriesPerChunk));
}

const summary = { builtAt: new Date().toISOString(), ...stats, examplesEdited, examplesEditSkipped: skipped.length, sizes: {} };
for (const [name, fontSize] of Object.entries(config.sizes)) {
  const { pages, entryPage, overflow, lineH } = paginate(entries, config, fontSize);

  // 길잡이 낱말: 그 쪽에서 시작하는 첫·마지막 표제어. 없으면 이어지는 표제어.
  const guides = pages.map((lines) => {
    const heads = lines.filter((l) => l.h);
    const src = heads.length ? heads : lines;
    return [label(entries[src[0].e]), label(entries[src.at(-1).e])];
  });

  for (let i = 0; i < pages.length; i += config.pagesPerChunk) {
    write(`${name}/pages-${pad(i / config.pagesPerChunk)}.json`,
      pages.slice(i, i + config.pagesPerChunk).map((l, j) => ({ n: i + j + 1, g: guides[i + j], l })));
  }

  const sections = TABS.map((tab, t) => {
    const idx = entries.filter((e) => e.tab === t).map((e) => entryPage[e.seq]);
    if (!idx.length) return { tab, start: 0, end: 0, pages: 0, entries: 0 };
    const start = idx[0];
    const next = entries.find((e) => e.tab > t);
    const end = next ? entryPage[next.seq] - 1 : pages.length;
    return { tab, start, end, pages: end - start + 1, entries: idx.length };
  });

  write(`${name}/index.json`, {
    size: name, fontSize, lineHeight: lineH, textWidth: config.textWidth, textHeight: config.textHeight,
    entryGap: lineH * config.entryGapLines, indent: config.indentEm * fontSize, kinds: config.kinds,
    pageCount: pages.length, pagesPerChunk: config.pagesPerChunk, entriesPerChunk: config.entriesPerChunk,
    sections, entryPage, guides,
  });
  summary.sizes[name] = {
    fontSize, pageCount: pages.length, overflowLines: overflow,
    sections: Object.fromEntries(sections.map((s) => [s.tab, s.pages])),
  };
}

summary.missingGlyphs = Object.fromEntries([...missingGlyphs].sort((a, b) => b[1] - a[1]));
const dirSize = (d) => fs.readdirSync(d, { withFileTypes: true })
  .reduce((n, f) => n + (f.isDirectory() ? dirSize(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size), 0);
summary.outputBytes = Object.fromEntries(
  ['entries', 'notes', ...Object.keys(config.sizes)].map((d) => [d, dirSize(path.join(OUT, d))]));
summary.notes = { entriesWithInfo: notes.filter(hasNoteInfo).length, totalBytes: summary.outputBytes.notes };
write('report/summary.json', JSON.stringify(summary, null, 2));

write('ATTRIBUTION.md', `# 출처와 라이선스

이 사전 데이터는 아래 두 자료를 가공해 만들었다.

1. **한국어기초사전** — 국립국어원. 뜻풀이, 예문, 품사, 비슷한말·반대말의 출처.
   라이선스: 크리에이티브 커먼즈 저작자표시-동일조건변경허락 2.0 대한민국 (CC BY-SA 2.0 KR).
   https://krdict.korean.go.kr (2026-10-19 전체 내려받기본)
2. **국어 기초 어휘 선정 및 어휘 등급화 목록** — 국립국어원(2024). 낱말 선별과 등급의 출처.
   공공누리 제1유형(출처 표시).
   https://www.korean.go.kr

가공 내용: 등급 목록 ${config.grades.join('·')}등급에 있고 한국어기초사전에도 있는 낱말 ${entries.length}개를 골라
가나다순으로 다시 배열했다. 뜻풀이는 원문 그대로이며, 예문은 뜻마다 최대 ${config.examplesPerSense}개만 실었다.
지면 예문 중 ${examplesEdited.toLocaleString('ko-KR')}개는 초등학생 눈높이에 맞게 고쳐 썼고, 원문과 수정본은 \`data/edits/\`에 보존한다.
초등학생에게 맞지 않는 뜻 일부(${stats.sensesRemoved}개)를 뺐다.
어깨번호는 수록된 낱말끼리 다시 매겼다. 외국어 대역, 발음 음원, 이미지는 싣지 않았다.
쪽지용 발음·활용·예문·관용구·속담·파생어를 원문 그대로 추가 수록

이 폴더의 가공 데이터는 CC BY-SA 2.0 KR 조건으로 공개한다.
`);

write('README.md', `# data/build 스키마

\`npm run build:data\`가 만든다. 직접 고치지 않는다.

## entries/entries-NNNN.json
정렬 순서대로 ${config.entriesPerChunk}개씩. \`seq\`(정렬 순번, 0부터)로 참조한다. NNNN = floor(seq / ${config.entriesPerChunk}).

| 필드 | 뜻 |
|---|---|
| seq | 정렬 순번 |
| id | 한국어기초사전 표제어 ID |
| w | 표제어 |
| hn | 다시 매긴 어깨번호 (0이면 표시 안 함) |
| ohn | 기초사전 원래 어깨번호 |
| pos | 품사 |
| grade | 기초 어휘 등급 (1 학령 전, 2 초1~2, 3 초3~4, 4 초5~6) |
| origin | 원어 (있을 때만) |
| senses[] | \`id\`, \`def\` 뜻풀이, \`ex[]\` 예문, \`rel[]\` 관련어(\`type\` 유의어/반대말, \`w\`) |

## notes/notes-NNNN.json
entries와 같은 순서로 ${config.entriesPerChunk}개씩. NNNN = floor(seq / ${config.entriesPerChunk}). 조판에는 사용하지 않는다.

- \`seq\`, \`w\`, \`hn\`, \`pos\`, \`grade\`: entries와 같은 표제어 정보
- \`pronunciation[]\`: 발음 표기(표제어와 같은 발음은 생략)
- \`forms[]\`: 활용의 \`w\` 표기, \`short[]\` 준말 표기. 최대 4개
- \`origin\`: 원자료의 원어(있을 때만)
- \`senses[]\`: 지면과 같은 뜻 순번 \`n\`(1부터), \`sentences[]\` 문장 최대 2개, \`dialogue[]\` 대화 1개의 발화별 원문
- \`phrases[]\`: 같은 기초사전 ID의 관용구·속담 최대 5개. \`type\`, \`w\` 표현, \`def\` 첫 뜻풀이
- \`derived[]\`: 파생어 표기 최대 5개

지면에 실린 예문은 제외한다. 빈 배열은 해당 정보가 없음을 뜻한다.
report/summary.json의 \`notes.entriesWithInfo\`는 정보가 있는 항목 수, \`notes.totalBytes\`는 notes 전체 바이트 수다.

## games/quick-find.json · games/open-once.json
\`data/games/quick-find.json\`(낱말 빨리 찾기)과 \`data/games/open-once.json\`(한 번에 펼치기)의 문제 세트에 \`seq\`(entries 정렬 순번)를 추가한다.
한 번에 펼치기는 8세트·세트당 10문제이며 \`level\`은 쉬움(색인 사용) 또는 어려움(색인 없이)이다.
문제의 \`id\` 또는 \`w\`가 사전과 맞지 않으면 기존 빌드 결과를 지우기 전에 실패한다.
원본 문제 파일은 수정하지 않는다.

## {normal|large|xlarge}/index.json
\`pageCount\`, \`fontSize\`, \`lineHeight\`, \`entryGap\`, \`indent\`, \`textWidth\`, \`textHeight\`,
\`kinds\`(줄 조각 종류별 글꼴·배율), \`sections[]\`(색인 탭별 \`start\`/\`end\` 쪽과 쪽 수),
\`entryPage[seq]\`(표제어가 시작하는 쪽, 1부터), \`guides[쪽-1]\`(길잡이 낱말 [첫, 끝]).

## {size}/pages-NNNN.json
${config.pagesPerChunk}쪽씩. NNNN = floor((쪽-1) / ${config.pagesPerChunk}). 쪽마다:

- \`n\` 쪽 번호(1부터, 홀수가 오른쪽 면)
- \`g\` 길잡이 낱말 [첫, 끝]
- \`l[]\` 줄 목록. 줄마다:
  - \`e\` 이 줄이 속한 표제어의 seq
  - \`r\` 조각 목록 \`[종류, 글]\`. 종류: h 표제어, s 어깨번호, p 품사, n 뜻번호, d 뜻풀이, l 꼬리표, x 예문, r 관련어
  - \`h\`: 1이면 표제어가 시작하는 줄, \`i\`: 1이면 들여 쓰는 줄, \`g\`: 1이면 줄 앞에 항목 간격(\`entryGap\`)

## 앱이 지켜야 할 것
줄바꿈은 여기서 확정했다. 앱은 줄을 한 줄씩 \`white-space: pre\`로 그리고 다시 줄바꿈하지 않는다.
글꼴은 \`assets/fonts\`의 Pretendard를 쓰고 \`font-kerning: none; letter-spacing: 0\`으로 둔다.
`);

console.log(JSON.stringify(summary, null, 2));
console.log(`예문 수정: 적용 ${examplesEdited}개, 건너뜀 ${skipped.length}개 (data/build/report/edits.txt)`);
console.log(`뜻 삭제: ${stats.sensesRemoved}개, 표제어 제거 ${stats.entriesRemoved}개, 삭제 키 미발견 ${stats.removeMissing}개`);
for (const r of missingRemovals) console.log(`삭제 키 없음: ${r.key}\t${r.word}\t${r.reason}`);
