import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ROOT_ID, DIARY_ID, realTree} from '../src/treeModel.js';

let stored = {
  id: 'memory-1', title: 'A memory', content: 'Body', kind: 'context',
  importance: 'important', created_at: '2026-09-16T01:00:00Z', tags: [],
};
const calls = [];
globalThis.window = {__TAURI__: {core: {invoke: async (command, args) => {
  calls.push({command, args});
  if (Object.hasOwn(args, 'importance')) stored = {...stored, importance: args.importance};
  return stored;
}}}};
const {updateMemory} = await import('../src/bridge.js');

for (const importance of ['trivial', 'important']) {
  test(`update forwards ${importance} and moves the saved row to the correct tree`, async () => {
    const memory = await updateMemory(stored.id, {title: stored.title, importance});
    assert.equal(calls.at(-1).command, 'update');
    assert.equal(calls.at(-1).args.importance, importance);
    assert.equal(memory.importance, importance);
    const nodes = realTree([memory]);
    const parent = nodes.find(node => node.id === memory.id).parentId;
    if (importance === 'trivial') assert.equal(nodes.find(node => node.id === parent).parentId, DIARY_ID);
    else assert.equal(parent, ROOT_ID);
  });
}

test('omitted importance leaves the stored importance unchanged', async () => {
  stored = {...stored, importance: 'trivial'};
  const memory = await updateMemory(stored.id, {title: 'Renamed'});
  assert.equal(Object.hasOwn(calls.at(-1).args, 'importance'), false);
  assert.equal(memory.importance, 'trivial');
});

test('native update accepts and forwards the optional importance field', async () => {
  const native = await readFile(new URL('../../src-tauri/src/main.rs', import.meta.url), 'utf8');
  const update = native.slice(native.indexOf('async fn update('), native.indexOf('async fn delete('));
  assert.match(update, /importance: Option<String>/);
  assert.match(update, /update_args\(id, title, content, tags, kind, importance\)/);
});
