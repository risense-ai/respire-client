import test from 'node:test';
import assert from 'node:assert/strict';

// bridge.js 在模块顶层读 window.__TAURI__；Node 测试里先补一个空壳再导入。
globalThis.window = {};
const {unwrapRows, toMemory} = await import('../src/bridge.js');

const entry = (over = {}) => ({
  id: '9b88a7dd-0000-0000-0000-000000000000',
  title: '定界：serve-web 属 client 块',
  content: '第一行正文\n第二行',
  kind: 'context',
  tags: ['架构'],
  computer: 'fslong-hasee/linux',
  created_at: '2026-10-25T02:00:00Z',
  updated_at: '2026-10-25T02:10:00Z',
  parent_id: '',
  importance: 'important',
  ...over,
});

test('unwrapRows：旧 CLI 直接吐数组时原样返回', () => {
  const rows = [entry()];
  assert.deepEqual(unwrapRows(rows), rows);
});

test('unwrapRows：新 CLI envelope 取 details（全量条目），不是 items 标题行', () => {
  const envelope = {
    items: [{name: '9b88a7dd', status: 'ok', value: '定界：serve-web 属 client 块'}],
    details: [{score: 0.42, entry: entry(), superseded_by: 'ffff0000'}],
  };
  const rows = unwrapRows(envelope);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entry.id, entry().id);
});

test('unwrapRows：只有 items 时退化用 items，空值返回空数组', () => {
  assert.deepEqual(unwrapRows({items: [{id: 'a'}]}), [{id: 'a'}]);
  assert.deepEqual(unwrapRows(null), []);
  assert.deepEqual(unwrapRows({}), []);
});

test('toMemory：保留检索相关度与取代关系（详情行）', () => {
  const memory = toMemory({score: 0.42, entry: entry(), superseded_by: 'ffff0000'});
  assert.equal(memory.id, entry().id);
  assert.equal(memory.score, 0.42);
  assert.equal(memory.supersededBy, 'ffff0000');
  assert.equal(memory.summary, '第一行正文');
  assert.equal(memory.importance, 'important');
});

test('toMemory：标题行形态（无 entry）也不丢分', () => {
  const memory = toMemory({id: 'cccc0000', title: '标题行', score: 0.99, superseded_by: 'eeee0000'});
  assert.equal(memory.title, '标题行');
  assert.equal(memory.score, 0.99);
  assert.equal(memory.supersededBy, 'eeee0000');
});

test('toMemory：无相关度字段时为 null，不编造数值', () => {
  const memory = toMemory(entry());
  assert.equal(memory.score, null);
  assert.equal(memory.supersededBy, null);
});
