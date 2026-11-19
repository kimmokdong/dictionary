// 문제 원본은 그대로 두고 확정된 사전 순번만 연결한다.
export function linkQuickFind(source, entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return { ...source, sets: source.sets.map((set) => ({ ...set, items: set.items.map((item) => {
    const entry = byId.get(item.id);
    if (!entry || entry.w !== item.w) throw new Error(`낱말 빨리 찾기 ${set.set}세트: ID ${item.id} (${item.w})가 사전과 맞지 않습니다.`);
    return { ...item, seq: entry.seq };
  }) })) };
}
