// Contexts describe a memory from several perspectives; they are not containers.
const fixtureContexts = {
  'mem-01': ['product', 'research'],
  'mem-02': ['product', 'coding'],
  'mem-03': ['product', 'coding', 'life'],
  'mem-04': ['coding', 'product'],
  'mem-09': ['research', 'product'],
  'mem-10': ['product', 'research'],
  'mem-12': ['life', 'coding'],
  'mem-14': ['research', 'product'],
  'mem-15': ['product', 'coding'],
  'mem-16': ['product', 'coding'],
};

const stringIds = value => Array.isArray(value)
  ? [...new Set(value.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))]
  : [];

export function getContextIds(memory) {
  if (!memory) return [];
  // An explicit empty array means the user removed all contexts.
  if (Array.isArray(memory.contextIds)) return stringIds(memory.contextIds).filter(id => ['product','coding','research','life'].includes(id));
  const legacy = typeof memory.collection === 'string' && memory.collection.trim()
    ? memory.collection.trim() : null;
  return stringIds([...(legacy ? [legacy] : []), ...(fixtureContexts[memory.id] || [])]);
}

export function normalizeMemory(memory) {
  const contextIds = getContextIds(memory);
  return {
    ...memory,
    contextIds,
    // Older settings/export consumers still read this field.
    collection: memory?.collection ?? contextIds[0] ?? '',
  };
}

export function getRelatedMemories(memory, memories = []) {
  if (!memory?.id) return [];
  const outgoing = new Set(stringIds(memory.relatedIds));
  if (memory.parentId) outgoing.add(memory.parentId);
  return memories.filter(candidate => candidate?.id && candidate.id !== memory.id && (
    outgoing.has(candidate.id) ||
    stringIds(candidate.relatedIds).includes(memory.id) ||
    candidate.parentId === memory.id
  ));
}

export const eventInfo = {
  formed: { label: '新形成', color: '#b98770' },
  updated: { label: '记忆更新', color: '#ad7e8b' },
  connected: { label: '新关联', color: '#8f83ae' },
  used: { label: '被 AI 使用', color: '#6a9991' },
};

const eventDetails = {
  formed: '记录了一段新的记忆',
  updated: '更新了记忆内容',
  connected: '建立了新的关联',
  used: '使用了这段记忆',
};

export function createEvent(memory, kind, extras = {}) {
  if (!memory?.id) throw new TypeError('A memory id is required to create an event.');
  if (!eventInfo[kind]) throw new TypeError(`Unknown memory event kind: ${kind}`);
  const date = new Date(extras.at ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new TypeError('An event requires a valid timestamp.');
  const at = date.toISOString();
  const unique = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return {
    id: extras.id ?? `event-${memory.id}-${kind}-${unique}`,
    memoryId: memory.id,
    kind,
    at,
    // A source is evidence supplied by the caller, never inferred from memory.source.
    source: extras.source ?? '手动记录',
    snapshot: {title: memory.title, summary: memory.summary, type: memory.type},
    detail: extras.detail ?? (kind === 'updated' && memory.type === 'preference'
      ? '更新了这条偏好' : eventDetails[kind]),
    ...(extras.relatedMemoryId ? { relatedMemoryId: extras.relatedMemoryId } : {}),
  };
}

export function seedEvents(memories = [], now = new Date()) {
  const clock = new Date(now);
  if (Number.isNaN(clock.getTime())) throw new TypeError('A valid current date is required.');
  const byId = new Map(memories.map(memory => [memory.id, memory]));
  const events = [];
  const represented = new Set();
  const todayMinutes = clock.getHours() * 60 + clock.getMinutes();
  const atDay = (daysAgo, hour, minute = 0) => {
    const at = new Date(clock);
    at.setDate(at.getDate() - daysAgo);
    const minutes = daysAgo === 0
      ? Math.floor((hour * 60 + minute) * Math.min(1, todayMinutes / 642))
      : hour * 60 + minute;
    at.setHours(0, minutes, 0, 0);
    return at.toISOString();
  };
  const add = (id, kind, daysAgo, hour, minute, extras) => {
    const memory = byId.get(id);
    if (!memory) return;
    const at = atDay(daysAgo, hour, minute);
    const relatedMemoryId = byId.has(extras?.relatedMemoryId) ? extras.relatedMemoryId : undefined;
    // Do not keep a sample relationship whose other endpoint has been deleted.
    if (kind === 'connected' && !relatedMemoryId) return;
    events.push(createEvent(memory, kind, {
      ...extras,
      relatedMemoryId,
      at,
      id: `sample-${id}-${kind}-${at.slice(0, 10)}`,
    }));
    represented.add(id);
  };

  add('mem-01', 'formed', 0, 10, 42, {
    source: 'Claude · Codex · ChatGPT',
    detail: '从 3 个 AI 的对话中，形成了一个持续演化的产品理念',
  });
  add('mem-03', 'updated', 0, 9, 56, {
    source: 'Claude',
    detail: '偏好更新 · 喜欢先看到可以运行的版本，再讨论抽象设计',
  });
  add('mem-02', 'used', 0, 9, 31, {
    source: 'Codex',
    detail: '设计桌面界面时，参考了「内容优先」这项判断',
  });
  add('mem-02', 'connected', 0, 9, 12, {
    source: '示例关联',
    detail: '「内容优先」与「先行动，再解释」指向了相同的协作偏好',
    relatedMemoryId: 'mem-03',
  });
  add('mem-04', 'used', 1, 16, 28, {
    source: 'Codex',
    detail: '继续九月迭代时，找回了项目背景与之前的决定',
  });

  memories.filter(memory => !represented.has(memory.id)).forEach((memory, index) => {
    const daysAgo = 1 + Math.floor(index / 3);
    const kind = index % 3 === 0 ? 'updated' : 'formed';
    add(memory.id, kind, daysAgo, 14 - (index % 3) * 2, 18, {
      source: memory.source || '手动记录',
      detail: kind === 'updated'
        ? (memory.type === 'preference' ? '结合新的经历，更新了这条偏好' : '在已有理解上，补充了新的进展')
        : (memory.type === 'decision' ? '逐渐形成了一项可以复用的判断' : '留下了一段可以继续生长的记忆'),
    });
  });
  return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

const localDayKey = date => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export function groupEvents(events = [], now = new Date()) {
  const clock = new Date(now);
  const today = localDayKey(clock);
  const previousDay = new Date(clock);
  previousDay.setDate(previousDay.getDate() - 1);
  const yesterday = localDayKey(previousDay);
  const groups = new Map();
  [...events]
    .filter(event => event && Number.isFinite(Date.parse(event.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .forEach(event => {
      const date = new Date(event.at);
      const key = localDayKey(date);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: key === today ? '今天' : key === yesterday ? '昨天' : `${date.getMonth() + 1} 月 ${date.getDate()} 日`,
          dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase(),
          events: [],
        });
      }
      groups.get(key).events.push(event);
    });
  return [...groups.values()];
}
