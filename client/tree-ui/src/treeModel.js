import { collections } from './data.js';

export const ROOT_ID = 'tree-root';

export function isRealId(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(id);
}

export function nodeById(nodes = [], id) {
  return nodes.find(node => node.id === id);
}

export function pathFor(nodes = [], id) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const seen = new Set();
  const path = [];
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = byId.get(current.parentId);
  }
  return path.reverse();
}

export function subtreeIds(nodes = [], id) {
  if (!nodeById(nodes, id)) return [];
  const children = new Map();
  nodes.forEach(node => {
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node.id);
  });
  const seen = new Set();
  const pending = [id];
  while (pending.length) {
    const current = pending.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    // Reverse the stack input to preserve the original sibling order.
    pending.push(...(children.get(current) || []).slice().reverse());
  }
  return [...seen];
}

export function memoriesInScope(nodes = [], memories = [], id = ROOT_ID) {
  const includedNodes = new Set(subtreeIds(nodes, id));
  const memoryIds = new Set(nodes
    .filter(node => includedNodes.has(node.id) && node.kind === 'memory')
    .map(node => node.memoryId));
  return memories.filter(memory => memoryIds.has(memory.id));
}

export function canMove(nodes = [], id, targetId) {
  if (id === ROOT_ID || id === targetId) return false;
  if (!nodeById(nodes, id) || !nodeById(nodes, targetId)) return false;
  return !subtreeIds(nodes, id).includes(targetId);
}

export function moveNode(nodes = [], id, targetId) {
  if (!canMove(nodes, id, targetId)) return nodes;
  return nodes.map(node => node.id === id ? { ...node, parentId: targetId } : node);
}

export function initialTree(memories = []) {
  const nodes = [
    { id: ROOT_ID, parentId: null, title: '个人记忆', kind: 'tree' },
    ...collections.map(collection => ({
      id: `tree-${collection.id}`,
      parentId: ROOT_ID,
      title: collection.name,
      kind: 'tree',
    })),
  ];
  const collectionIds = new Set(collections.map(collection => collection.id));
  const collectionFor = memory => collectionIds.has(memory?.collection)
    ? memory.collection
    : (Array.isArray(memory?.contextIds) ? memory.contextIds.find(contextId => collectionIds.has(contextId)) : null) ?? null;
  const reserved = new Set(nodes.map(node => node.id));
  const byMemory = new Map();
  memories.forEach(memory => {
    if (typeof memory?.id === 'string' && memory.id && !reserved.has(memory.id) && !byMemory.has(memory.id)) {
      byMemory.set(memory.id, memory);
    }
  });
  const fallbackParent = memory => {
    const collectionId = collectionFor(memory);
    return collectionId ? `tree-${collectionId}` : ROOT_ID;
  };

  byMemory.forEach(memory => {
    const parent = byMemory.get(memory.parentId);
    const collectionId = collectionFor(memory);
    const validParent = parent && parent.id !== memory.id && collectionId && collectionFor(parent) === collectionId;
    nodes.push({
      id: memory.id,
      parentId: validParent ? parent.id : fallbackParent(memory),
      title: memory.title || '未命名记忆',
      kind: 'memory',
      memoryId: memory.id,
    });
  });

  // Imported parent links may contain a cycle. Break only the invalid edge,
  // retaining the rest of the original hierarchy whenever possible.
  const byNode = new Map(nodes.map(node => [node.id, node]));
  nodes.filter(node => node.kind === 'memory').forEach(node => {
    const seen = new Set([node.id]);
    let parent = byNode.get(node.parentId);
    while (parent) {
      if (seen.has(parent.id)) {
        node.parentId = fallbackParent(byMemory.get(node.memoryId));
        break;
      }
      seen.add(parent.id);
      parent = byNode.get(parent.parentId);
    }
  });
  return nodes;
}

let generatedCount = 0;
export function makeNodeId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `tree-${uuid}`;
  generatedCount += 1;
  return `tree-${Date.now().toString(36)}-${generatedCount.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Build the real-memory hierarchy from parentId and attach orphaned entries to the root.
export const DIARY_ID = 'diary-book';

// Convert UTC timestamps to local dates before grouping entries.
function localDayOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// CLI diary titles identify the authoritative local calendar date.
function activityDayOf(title) {
  return /^活动轨迹 (\d{4}-\d{2}-\d{2})$/.exec(title || '')?.[1] || '';
}

// Group trivial entries under the diary instead of the classification tree.
export function realTree(memories = []) {
  const nodes = [{ id: ROOT_ID, parentId: null, title: '记忆树', kind: 'tree' }];
  const ids = new Set(memories.map(m => m.id));
  const byId = new Map(memories.map(m => [m.id, m]));
  const diaryDays = new Map();
  const rest = [];
  memories.forEach(m => {
    if (m.importance === 'trivial') {
      const day = activityDayOf(m.title) || localDayOf(m.createdAt || m.updatedAt) || '未知日期';
      if (!diaryDays.has(day)) diaryDays.set(day, []);
      diaryDays.get(day).push(m);
      return;
    }
    rest.push(m);
  });
  // Order dates and entries newest first.
  const days = [...diaryDays.keys()].sort().reverse();
  nodes.push({ id: DIARY_ID, parentId: ROOT_ID, title: `日记本`, kind: 'tree' });
  days.forEach(day => nodes.push({ id: `diary-${day}`, parentId: DIARY_ID, title: day, kind: 'tree' }));
  rest.forEach(m => {
    const parent = m.parentId && ids.has(m.parentId) ? m.parentId : ROOT_ID;
    nodes.push({
      id: m.id,
      parentId: parent,
      title: m.title || (m.id || '').slice(0, 8),
      kind: 'memory',
      memoryId: m.id,
      tags: m.tags || [],
    });
  });
  days.forEach(day => diaryDays.get(day)
    .slice()
    .sort((a, b) => (b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || ''))
    .forEach(m => nodes.push({
    id: m.id,
    parentId: `diary-${day}`,
    title: m.title || (m.id || '').slice(0, 8),
    kind: 'memory',
    memoryId: m.id,
  })));
  // Hide empty leaves and empty taxonomy headings.
  // Retain nodes with children so visibility filtering cannot discard descendants.
  const kidCount = new Map();
  nodes.forEach(n => {
    if (n.parentId && n.parentId !== ROOT_ID) kidCount.set(n.parentId, (kidCount.get(n.parentId) || 0) + 1);
  });
  const hidden = new Set(nodes.filter(n => {
    if (n.kind !== 'memory' || (kidCount.get(n.id) || 0) > 0) return false;
    const raw = byId.get(n.id);
    if (!raw) return false;
    const title = (raw.title || '').trim();
    const body = (raw.content || '').trim();
    if (!title && !body) return true;
    if ((raw.tags || []).includes('词库纲')) return true;
    return Boolean(title) && body.startsWith(title + '：') && body.split('\n\n').length <= 2 && body.length < 260;
  }).map(n => n.id));
  return hidden.size ? nodes.filter(n => !hidden.has(n.id)) : nodes;
}
