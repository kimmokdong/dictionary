export function pick(bank, n, random = Math.random) {
  if (!Number.isInteger(n) || n < 0 || n > bank.length) throw new RangeError('뽑을 개수는 문제 은행 크기 이하의 정수여야 합니다.');
  const items = [...bank];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (items.length - i));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, n);
}

export function randomSet(source, kind, key) {
  const bank = source.sets.flatMap((s) => s.items.map((item) => ({ ...item, level: s.level })));
  return { set: key, level: key === 'random-notab' ? '어려움' : '쉬움', items: pick(bank, kind === 'openonce' ? 10 : 5) };
}
