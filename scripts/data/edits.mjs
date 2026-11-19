// 검토한 예문만 키와 원문이 모두 맞을 때 지면 예문에 덮어쓴다.
import fs from 'node:fs';

export function loadSenseRemovals() {
  const seen = new Set();
  return fs.readFileSync('data/edits/remove-senses.tsv', 'utf8').split(/\r?\n/).flatMap((line, i) => {
    if (!line.trim()) return [];
    const [key, word, reason, ...rest] = line.split('\t');
    if (!/^\d+-\d+$/.test(key) || !word?.trim() || reason === undefined || rest.length || seen.has(key)) {
      throw new Error(`뜻 삭제 목록 형식 오류: remove-senses.tsv:${i + 1}`);
    }
    seen.add(key);
    return [{ key, word, reason }];
  });
}

export function loadExampleEdits() {
  return fs.readdirSync('data/edits/out').filter((f) => /^b\d+\.tsv$/.test(f)).sort().flatMap((file) =>
    fs.readFileSync(`data/edits/out/${file}`, 'utf8').split(/\r?\n/).flatMap((line, i) => {
      if (!line.trim()) return [];
      const [key, original, replacement, kind, ...rest] = line.split('\t');
      if (!/^\d+-\d+-\d+$/.test(key) || !original || !replacement?.trim() || !kind || rest.length) {
        throw new Error(`예문 수정본 형식 오류: ${file}:${i + 1}`);
      }
      return [{ key, original, replacement }];
    }));
}

export function applyExampleEdits(entries, edits = loadExampleEdits(), removedSenses = new Set()) {
  const examples = new Map();
  for (const entry of entries) for (const sense of entry.senses) {
    sense.ex.forEach((text, j) => examples.set(`${entry.id}-${sense.id}-${j}`, { sense, j }));
  }
  let examplesEdited = 0;
  const skipped = [];
  for (const { key, original, replacement } of edits) {
    if (removedSenses.has(key.slice(0, key.lastIndexOf('-')))) continue;
    const target = examples.get(key);
    if (!target) {
      skipped.push({ key, reason: '없는 키', original });
      continue;
    }
    const text = target.sense.ex[target.j];
    const trimmed = text.replace(/\s+$/, '');
    const actual = trimmed + (text !== trimmed ? '␣' : '');
    if (actual !== original) {
      skipped.push({ key, reason: '원문 불일치', original, actual });
      continue;
    }
    target.sense.ex[target.j] = replacement;
    examplesEdited++;
  }
  return { examplesEdited, skipped };
}
