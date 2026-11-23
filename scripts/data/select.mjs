// 등급 목록(1~4등급)에 있고 한국어기초사전에도 있는 낱말을 골라 정렬한다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { sortKey, compareEntries, tabIndex } from './sort.mjs';
import { collectNotes } from './notes.mjs';
import { loadSenseRemovals } from './edits.mjs';

const require = createRequire(import.meta.url);
const RAW = 'data/raw';
const al = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const feats = (o) => Object.fromEntries(al(o?.feat).map((f) => [f.att, f.val]));
const featAll = (o, att) => al(o?.feat).filter((f) => f.att === att).map((f) => f.val);
const norm = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, '');

function loadVocab(grades) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(path.join(RAW, 'nikl-vocab/vocab.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames.at(-1)], { header: 1 });
  const out = [];
  for (const r of rows.slice(1)) {
    const grade = parseInt(r[0], 10);
    if (!r[1] || !grades.includes(grade)) continue;
    // "동사형용사"는 구분 기호가 빠진 표기라 따로 푼다.
    const pos = norm(r[3]).replace('동사형용사', '동사/형용사').split('/').filter(Boolean);
    out.push({ grade, word: norm(r[1]), pos, origin: norm(r[5]), kind: norm(r[4]) });
  }
  return out;
}

function krdictFiles() {
  const dir = path.join(RAW, 'krdict/extracted');
  if (!fs.existsSync(dir) || !fs.readdirSync(dir).some((f) => f.endsWith('.json'))) {
    const AdmZip = require('adm-zip');
    new AdmZip(path.join(RAW, 'krdict/krdict_json.zip')).extractAllTo(dir, true);
  }
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
}

function* krdictEntries() {
  for (const file of krdictFiles()) {
    yield* JSON.parse(fs.readFileSync(file, 'utf8')).LexicalResource.Lexicon.LexicalEntry;
  }
}

function pickExamples(sense, max) {
  const ex = al(sense.SenseExample).map((x) => ({ type: feats(x).type, text: featAll(x, 'example') }));
  const one = (type) => ex.find((x) => x.type === type && x.text.length === 1)?.text[0];
  // 짧은 구 하나와 문장 하나를 우선한다. 대화형 예문은 쓰지 않는다.
  return [one('구'), one('문장')].filter(Boolean).slice(0, max);
}

function loadKrdict(examplesPerSense) {
  const byWord = new Map();
  let total = 0;
  for (const e of krdictEntries()) {
    total++;
    const f = feats(e);
    if (f.lexicalUnit !== '단어') continue; // 구·속담·관용구·문법 표현 제외
    const word = norm(feats(al(e.Lemma)[0]).writtenForm);
    const senses = al(e.Sense).map((s) => ({
      id: s.val,
      def: feats(s).definition,
      ex: pickExamples(s, examplesPerSense),
      rel: al(s.SenseRelation)
        .map((r) => feats(r))
        .filter((r) => r.type === '유의어' || r.type === '반대말')
        .map((r) => ({ type: r.type, w: r.lemma })),
    })).filter((s) => s.def);
    if (!senses.length) continue;
    const entry = {
      id: e.val, w: word, ohn: Number(f.homonym_number) || 0,
      pos: f.partOfSpeech, level: f.vocabularyLevel, origin: norm(f.origin), senses,
    };
    if (!byWord.has(word)) byWord.set(word, []);
    byWord.get(word).push(entry);
  }
  return { byWord, total };
}

// 뜻 삭제를 마친 뒤 남은 항목끼리 정렬하고 번호를 매긴다.
export function finalizeEntries(entries, removals = loadSenseRemovals()) {
  const pending = new Map(removals.map((r) => [r.key, r]));
  const removedSenses = new Set(), removedEntries = [];
  entries = entries.filter((e) => {
    e.senses = e.senses.filter((s) => {
      const key = `${e.id}-${s.id}`;
      if (!pending.delete(key)) return true;
      removedSenses.add(key);
      return false;
    });
    if (e.senses.length) return true;
    removedEntries.push({ id: e.id, w: e.w });
    return false;
  });
  entries.sort(compareEntries);

  // 어깨번호는 수록된 것끼리 1부터 다시 매긴다. 하나뿐이면 0(표시 안 함).
  for (let i = 0; i < entries.length; ) {
    let j = i;
    while (j < entries.length && entries[j].w === entries[i].w) j++;
    for (let k = i; k < j; k++) entries[k].hn = j - i > 1 ? k - i + 1 : 0;
    i = j;
  }
  entries.forEach((e, seq) => { e.seq = seq; });
  return { entries, removedSenses, removedEntries, missingRemovals: [...pending.values()] };
}

export function selectEntries(config) {
  const vocab = loadVocab(config.grades);
  const { byWord, total } = loadKrdict(config.examplesPerSense);
  const picked = new Map(); // 기초사전 ID → 항목
  const unmatched = [];
  const stats = { krdictTotal: total, byGrade: {}, posFallback: 0, narrowedByOrigin: 0, multiKept: 0, skippedNonHangul: 0 };

  for (const row of vocab) {
    const g = (stats.byGrade[row.grade] ??= { listed: 0, matched: 0 });
    g.listed++;
    const all = byWord.get(row.word) ?? [];
    let cand = all.filter((e) => row.pos.includes(norm(e.pos)));
    if (!cand.length && all.length) { cand = all; stats.posFallback++; } // 품사 표기가 서로 다른 경우
    if (!cand.length) { unmatched.push(`${row.grade}등급\t${row.word}\t${row.pos.join('/')}`); continue; }
    if (cand.length > 1) {
      // 원어(한자 등)가 같은 것, 고유어면 원어가 없는 것으로 좁힌다. 못 좁히면 모두 싣는다.
      const same = cand.filter((e) => e.origin === row.origin);
      if (same.length && same.length < cand.length) { cand = same; stats.narrowedByOrigin++; }
      if (cand.length > 1) stats.multiKept++;
    }
    g.matched++;
    for (const e of cand) {
      const prev = picked.get(e.id), exact = row.origin === e.origin;
      // 어종: 원어까지 같은 줄을 믿고, 원어로 못 가리는 줄끼리 어종이 다르면 비워 둔다.
      if (!prev) picked.set(e.id, { ...e, grade: row.grade, kind: row.kind || null, kindExact: exact });
      else {
        prev.grade = Math.min(prev.grade, row.grade);
        if (exact && !prev.kindExact) { prev.kind = row.kind || null; prev.kindExact = true; }
        else if (!prev.kindExact && prev.kind !== row.kind) prev.kind = null;
      }
    }
  }

  const entries = [];
  for (const e of picked.values()) {
    const tab = tabIndex(e.w);
    if (tab < 0) { stats.skippedNonHangul++; continue; }
    // 원어가 있는데 고유어이거나, 원어가 없는데 한자어·외래어면 다른 동형어의 어종일 수 있어 비운다.
    // 섞인 말(혼종어)로 적혔어도 원어가 한자뿐이면 한자어다(어휘 목록의 입력 실수: 관리실·번식·부채).
    const mixedButHanja = e.kind === '혼종어' && /^[一-鿿/▽]+$/.test(e.origin);
    const kind = mixedButHanja ? '한자어' : (e.kind === '고유어') === !e.origin || !['고유어', '한자어', '외래어'].includes(e.kind) ? e.kind : null;
    entries.push({ ...e, kind, key: sortKey(e.w), tab });
  }
  const result = finalizeEntries(entries);
  stats.sensesRemoved = result.removedSenses.size;
  stats.entriesRemoved = result.removedEntries.length;
  stats.removeMissing = result.missingRemovals.length;
  stats.entries = result.entries.length;
  stats.byKind = {};
  for (const e of result.entries) stats.byKind[e.kind ?? '없음'] = (stats.byKind[e.kind ?? '없음'] ?? 0) + 1;
  return { ...result, notes: collectNotes(result.entries, krdictEntries()), unmatched, stats };
}
