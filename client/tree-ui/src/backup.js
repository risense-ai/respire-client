// Normalize desktop and CLI backups before any writes. Import appends copies.
export function parseBackup(data) {
  if (!Array.isArray(data) && (!data || data.format !== 'respire-tree' || data.version !== 1)) {
    throw new Error('不支持的备份格式或版本');
  }
  const source = Array.isArray(data) ? data : data.memories;
  if (!Array.isArray(source) || !source.length) throw new Error('备份没有记忆');
  const entries = source.map((m, index) => {
    const fail = () => { throw new Error(`第 ${index + 1} 条记忆格式无效`); };
    if (!m || typeof m.id !== 'string' || !m.id.trim() || typeof m.title !== 'string' ||
        typeof m.content !== 'string' || !m.content.trim()) fail();
    const parentId = m.parentId ?? m.parent_id ?? null;
    const type = m.type ?? m.kind ?? 'context';
    if ((parentId !== null && typeof parentId !== 'string') || typeof type !== 'string' ||
        !['context', 'decision', 'preference', 'task', 'emotion', 'time', 'skill', 'knowledge'].includes(type.toLowerCase()) ||
        (m.tags !== undefined && (!Array.isArray(m.tags) || !m.tags.every(t => typeof t === 'string'))) ||
        (m.importance !== undefined && !['normal', 'important', 'trivial'].includes(m.importance))) fail();
    return {...m, parentId: parentId || null, type: type.toLowerCase(), tags: m.tags ?? []};
  });
  const byId = new Map(entries.map(m => [m.id, m]));
  if (byId.size !== entries.length) throw new Error('备份包含重复记忆 ID');
  const ordered = [];
  const seen = new Set();
  for (const entry of entries) {
    const chain = [];
    const visiting = new Set();
    let node = entry;
    while (node && !seen.has(node.id)) {
      if (visiting.has(node.id)) throw new Error('备份父链存在环');
      visiting.add(node.id);
      chain.push(node);
      node = byId.get(node.parentId);
    }
    while (chain.length) {
      const next = chain.pop();
      seen.add(next.id);
      ordered.push(next);
    }
  }
  return {entries, ordered};
}
