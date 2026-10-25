// Bridge the tree UI to the real memory store through Tauri invoke.
// Native writes await explicit list/create/update/delete/attach calls instead of diffing snapshots.
// This bridge provides no demo data when Tauri is unavailable.

const invoke = window.__TAURI__?.core?.invoke;
export const isNative = Boolean(invoke);

function invokeError(e) {
  if (typeof e === 'string') return e;
  if (e && typeof e.message === 'string') return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}

async function call(cmd, args) {
  if (!isNative) throw new Error('当前不是本地客户端');
  try {
    return await invoke(cmd, args);
  } catch (e) {
    throw new Error(invokeError(e));
  }
}

function kindOf(value) {
  if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase();
  return 'context';
}

function unwrapEntry(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.entry && typeof value.entry === 'object') return value.entry;
  if (typeof value.id === 'string' && value.id) return value;
  return null;
}

/** CLI 回执兼容：旧 CLI 直接吐条目数组，新 CLI 吐 envelope（items=标题行、details=全量条目）。
 *  统一取数组，details 优先——它是完整条目，score/superseded_by 只在那一层才有。 */
export function unwrapRows(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.details) && value.details.length) return value.details;
    if (Array.isArray(value.items) && value.items.length) return value.items;
  }
  return [];
}

function pickMeta(value) {
  return value && typeof value === 'object' ? value : {};
}

function pickScore(outer, row) {
  const a = pickMeta(outer).score;
  const b = pickMeta(row).score;
  return typeof a === 'number' ? a : (typeof b === 'number' ? b : null);
}

function pickSupersededBy(outer, row) {
  const a = pickMeta(outer).superseded_by;
  const b = pickMeta(row).superseded_by;
  return typeof a === 'string' && a ? a : (typeof b === 'string' && b ? b : null);
}

/** Normalize array and legacy CSV tags to an array before rendering or searching. */
function toTagList(tags) {
  if (Array.isArray(tags)) return tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim());
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

export function toMemory(e) {
  const row = unwrapEntry(e);
  if (!row) return null;
  const content = row.content || '';
  const parent = row.parent_id || row.parentId || '';
  return {
    id: row.id,
    title: row.title || (row.id || '').slice(0, 8),
    summary: content.split('\n').find(l => l.trim())?.slice(0, 100) || '',
    content,
    type: kindOf(row.kind || row.type),
    collection: null,
    tags: toTagList(row.tags),
    source: row.computer || row.source || 'respire',
    createdAt: row.created_at || row.createdAt || '',
    updatedAt: row.updated_at || row.updatedAt || '',
    timeLabel: '',
    pinned: false,
    parentId: parent || null,
    relatedIds: [],
    importance: row.importance || 'normal',
    // recall 回执才有的归因字段：检索相关度与取代关系，展示"为什么排这里"。
    score: pickScore(e, row),
    supersededBy: pickSupersededBy(e, row),
  };
}

export async function boot() {
  if (!isNative) return null;
  const list = unwrapRows(await call('list', { limit: 100000 }));
  return list.map(toMemory).filter(Boolean);
}

export async function searchMemories(query) {
  const rows = unwrapRows(await call('search', { q: query, limit: 20 }));
  return rows.map(toMemory).filter(Boolean);
}

export async function readMemory(id) {
  const raw = await call('show', { id });
  const row = unwrapEntry(raw?.entry ? raw : raw?.details?.entry ? raw.details : raw);
  const memory = toMemory(row);
  if (!memory?.id || memory.id !== id) throw new Error('读取未返回对应记忆');
  return memory;
}

export async function createMemory({ title, content, type, tags, parent, importance }) {
  const args = {
    content,
    title,
    kind: type || 'context',
    tags: Array.isArray(tags) ? tags.join(',') : (tags || ''),
    force: true,
  };
  if (parent) args.parent = parent;
  if (importance) args.importance = importance;
  const created = await call('create', args);
  if (created?.status === 'candidates') throw new Error('未写入：存在相似候选');
  const id = created?.id || created?.summary?.id || created?.entry?.id;
  if (!id) throw new Error('创建未返回记忆 ID');
  // A normalized write receipt carries only the result fields; read the entry back for its body.
  return readMemory(id);
}

export async function updateMemory(id, { title, content, type, tags, importance }) {
  const args = {
    id,
    title,
    content,
    kind: type || 'context',
    tags: Array.isArray(tags) ? tags.join(',') : (tags || ''),
  };
  if (importance) args.importance = importance;
  const updated = await call('update', args);
  const memory = toMemory(updated);
  if (!memory?.id) throw new Error('更新未返回记忆');
  return memory;
}

export async function deleteMemory(id) {
  const result = await call('delete', { id });
  if (result && result.deleted === false) throw new Error('未删除');
  return result;
}

export async function purgeMemory(id) {
  return call('purge', { id });
}

export async function attachMemory(id, parent) {
  return call('attach', { id, parent });
}

export async function restoreMemory(id) {
  const restored = await call('restore', { id });
  if (restored?.restored === false) throw new Error('未恢复');
  // Same as create: the receipt has the id, the body comes from a follow-up read.
  const memory = await readMemory(id);
  if (!memory?.id || memory.id !== id) throw new Error('恢复未返回对应记忆');
  return memory;
}
