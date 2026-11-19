// 쪽지는 원자료에서 지면에 없는 정보만 모은다. 조판 항목에는 섞지 않는다.
const al = (x) => Array.isArray(x) ? x : x ? [x] : [];
const values = (o, att) => al(o?.feat).filter((f) => f.att === att).map((f) => f.val);
const feat = (o, att) => values(o, att)[0];

export function collectNotes(entries, rawEntries) {
  const selected = new Map(entries.map((e) => [e.id, e]));
  const notes = new Map(entries.map((e) => [e.id, {
    seq: e.seq, w: e.w, hn: e.hn, pos: e.pos, grade: e.grade,
    pronunciation: [], forms: [], senses: [], phrases: [], derived: [],
  }]));
  for (const raw of rawEntries) {
    const entry = selected.get(raw.val), note = notes.get(raw.val);
    if (!entry) continue;
    const type = feat(raw, 'lexicalUnit');
    if (type === '관용구' || type === '속담') {
      const w = feat(al(raw.Lemma)[0], 'writtenForm'), def = feat(al(raw.Sense)[0], 'definition');
      if (w && def && note.phrases.length < 5) note.phrases.push({ type, w, def });
      continue;
    }
    if (type !== '단어') continue;
    const forms = al(raw.WordForm);
    note.pronunciation = [...new Set(forms.filter((f) => feat(f, 'type') === '발음')
      .flatMap((f) => values(f, 'pronunciation')))].filter((p) => p !== entry.w);
    note.forms = forms.filter((f) => feat(f, 'type') === '활용').slice(0, 4).map((f) => ({
      w: feat(f, 'writtenForm'),
      short: al(f.FormRepresentation).filter((r) => feat(r, 'type') === '준말').flatMap((r) => values(r, 'writtenForm')),
    })).filter((f) => f.w);
    const origin = feat(raw, 'origin');
    if (origin) note.origin = origin;
    const printed = new Set(entry.senses.flatMap((s) => s.ex));
    note.senses = entry.senses.flatMap((sense, i) => {
      const rawSense = al(raw.Sense).find((s) => s.val === sense.id);
      const examples = al(rawSense?.SenseExample);
      const sentences = [...new Set(examples.filter((x) => feat(x, 'type') === '문장')
        .flatMap((x) => values(x, 'example')))].filter((s) => !printed.has(s)).slice(0, 2);
      const dialogue = examples.filter((x) => feat(x, 'type') === '대화')
        .map((x) => values(x, 'example')).find((lines) => lines.length && !lines.some((s) => printed.has(s))) ?? [];
      return sentences.length || dialogue.length ? [{ n: i + 1, sentences, dialogue }] : [];
    });
    note.derived = [...new Set(al(raw.RelatedForm).filter((r) => feat(r, 'type') === '파생어')
      .flatMap((r) => values(r, 'writtenForm')))].slice(0, 5);
  }
  return entries.map((e) => notes.get(e.id));
}

export const hasNoteInfo = (note) => !!(note.origin || note.pronunciation.length || note.forms.length ||
  note.senses.length || note.phrases.length || note.derived.length);
