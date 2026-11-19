// 예문 수정 결과(data/edits/out/*.tsv)를 원본 묶음과 대조해 검사한다.
// 사용: node scripts/data/check-edits.mjs [b01 b02 ...]
import fs from 'node:fs';

const KINDS = ['소재', '어려움', '어색함', '형식'];
const names = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync('data/edits/out').filter((f) => f.endsWith('.tsv')).map((f) => f.slice(0, -4));

// 표제어가 들어갔는지: 어간 전체, 안 되면 어간 앞 글자(불규칙 활용 대비)를 찾는다.
export function hasHeadword(word, text) {
  const stem = word.replace(/\d+$/, '').replace(/다$/, '');
  return text.replace(/\s/g, '').includes(stem.replace(/\s/g, '')) || text.includes(stem.slice(0, Math.max(1, stem.length - 1)));
}

let total = 0, bad = 0;
const byKind = Object.fromEntries(KINDS.map((k) => [k, 0]));
for (const name of names) {
  const src = new Map(fs.readFileSync(`data/edits/batches/${name}.tsv`, 'utf8').trim().split('\n')
    .map((l) => l.split('\t')).map(([k, w, p, d, x]) => [k, { w, x }]));
  const lines = fs.readFileSync(`data/edits/out/${name}.tsv`, 'utf8').split('\n').filter((l) => l.trim());
  const seen = new Set();
  for (const line of lines) {
    total++;
    const [key, orig, next, kind, ...rest] = line.split('\t');
    const s = src.get(key), problems = [];
    if (!s) problems.push('없는 키');
    else {
      if (orig !== s.x) problems.push('원문 불일치');
      if (!hasHeadword(s.w, next ?? '')) problems.push('표제어 없음');
    }
    if (seen.has(key)) problems.push('중복'); seen.add(key);
    if (!next || !next.trim()) problems.push('빈 예문');
    else if (!/[.?!]$/.test(next)) problems.push('마침표 없음');
    if (next && next.length > 45) problems.push(`길이 ${next.length}`);
    if (!KINDS.includes(kind) || rest.length) problems.push('구분·칸 오류');
    else byKind[kind]++;
    if (problems.length) { bad++; console.log(`${name}\t${key}\t${s?.w ?? ''}\t${next}\t${problems.join(', ')}`); }
  }
  console.error(`${name}: 원본 ${src.size}줄, 수정 ${lines.length}줄 (${(lines.length / src.size * 100).toFixed(1)}%)`);
}
console.error(`합계 수정 ${total}줄, 문제 ${bad}줄`, byKind);
