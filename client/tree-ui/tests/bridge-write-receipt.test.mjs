import test from 'node:test';
import assert from 'node:assert/strict';

// 写回执经 Rust 归一化后只有结果字段（remember/restore 的 summary），
// 正文靠桥接层回读 show。这里用假 invoke 复刻两条真实回执形态。
const calls = [];
const receipts = {};
globalThis.window = {
  __TAURI__: {
    core: {
      invoke: async (cmd, args) => {
        calls.push({cmd, args});
        const r = receipts[cmd];
        if (typeof r === 'function') return r(args);
        if (r instanceof Error) throw r;
        return r;
      },
    },
  },
};
const {createMemory, restoreMemory, updateMemory, deleteMemory} = await import('../src/bridge.js');

const entry = (over = {}) => ({
  id: '753da84d-0000-0000-0000-000000000000',
  title: 'nginx 反代 504 修复',
  content: '调大 proxy_read_timeout 到 300s',
  kind: 'context',
  tags: [],
  computer: 'fslong-hasee/linux',
  created_at: '2026-10-25T05:00:00Z',
  parent_id: '',
  importance: 'important',
  ...over,
});

test.beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(receipts)) delete receipts[k];
});

test('createMemory：写回执只有 id，回读 show 拿正文', async () => {
  // 实测 rsrs 1.0.16 remember --json 的归一化形态：summary 展开，无条目正文。
  receipts.create = {action: 'created', id: entry().id, index_state: 'pending', parent: ''};
  receipts.show = {id: entry().id, title: entry().title, ancestors: [], children: [], entry: entry()};
  const memory = await createMemory({title: entry().title, content: entry().content});
  assert.equal(memory.id, entry().id);
  assert.equal(memory.title, entry().title);
  assert.equal(memory.content, entry().content);
  const read = calls.find(c => c.cmd === 'show');
  assert.equal(read.args.id, entry().id, '应回读 show 取正文');
});

test('createMemory：回执不带 id 时报错而不是静默成功', async () => {
  receipts.create = {action: 'created', index_state: 'pending'};
  await assert.rejects(() => createMemory({title: 'x', content: 'y'}), /创建未返回记忆 ID/);
});

test('restoreMemory：恢复回执只报结果，正文同样回读', async () => {
  receipts.restore = {id: entry().id, restored: true};
  receipts.show = {id: entry().id, ancestors: [], children: [], entry: entry()};
  const memory = await restoreMemory(entry().id);
  assert.equal(memory.id, entry().id);
  assert.equal(memory.title, entry().title);
});

test('restoreMemory：CLI 报未恢复时抛错', async () => {
  receipts.restore = {id: entry().id, restored: false};
  await assert.rejects(() => restoreMemory(entry().id), /未恢复/);
});

test('updateMemory：回执已并入条目正文，无需再回读', async () => {
  // 实测 update 的 details 是裸条目，与 summary 合并后正文在顶层。
  receipts.update = {action: 'written', id: entry().id, ...entry({title: '改过的标题'})};
  const memory = await updateMemory(entry().id, {title: '改过的标题'});
  assert.equal(memory.title, '改过的标题');
  assert.equal(calls.some(c => c.cmd === 'show'), false);
});

test('deleteMemory：以回执的 deleted 字段为准', async () => {
  // Tauri 命令名是 delete（CLI 侧叫 forget）。
  receipts.delete = {deleted: true, id: entry().id};
  assert.equal((await deleteMemory(entry().id)).deleted, true);
  receipts.delete = {deleted: false, id: entry().id};
  await assert.rejects(() => deleteMemory(entry().id), /未删除/);
});
