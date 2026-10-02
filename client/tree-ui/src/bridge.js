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
  };
}

export async function boot() {
  if (!isNative) return null;
  const list = await call('list', { limit: 100000 });
  if (!Array.isArray(list)) throw new Error('list 返回不是数组');
  return list.map(toMemory).filter(Boolean);
}

export async function searchMemories(query) {
  const results = await call('search', { q: query, limit: 20 });
  if (!Array.isArray(results)) throw new Error('搜索返回不是数组');
  return results.map(toMemory).filter(Boolean);
}

export async function readMemory(id) {
  const memory = toMemory(await call('show', { id }));
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
  const memory = toMemory(created);
  if (!memory?.id) throw new Error('创建未返回记忆 ID');
  return memory;
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
  const memory = toMemory(await call('restore', { id }));
  if (!memory?.id || memory.id !== id) throw new Error('恢复未返回对应记忆');
  return memory;
}
