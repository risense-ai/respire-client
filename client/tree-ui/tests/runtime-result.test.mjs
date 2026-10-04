import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryResult} from '../src/runtimeResult.js';
const envelope = (command, summary, details = null, extra = {}) => ({command, status: 'ok', summary, details, items: [], errors: [], actions: [], ...extra});

test('current CLI envelopes normalize the exact memory/status contract fields', () => {
  const status = {unlocked: true, data_dir: '/profile'};
  const row = {id: 'id', content: 'body', importance: 'trivial'};
  assert.deepEqual(memoryResult('status', envelope('status', status)), status);
  assert.deepEqual(memoryResult('list', envelope('list', {count: 1}, [row])), [row]);
  assert.deepEqual(memoryResult('show', envelope('show', {id: 'id'}, {entry: row})), {entry: row});
  assert.deepEqual(memoryResult('update', envelope('update', {id: 'id', action: 'written'}, row)), row);
  assert.deepEqual(memoryResult('create', envelope('remember', {id: 'id', action: 'created'})), {id: 'id', action: 'created'});
  const revision = {profile: '/profile', revision: 'opaque'};
  assert.deepEqual(memoryResult('memory_revision', envelope('memory-revision', revision)), revision);
});

test('legacy values and arbitrary memory content cannot be mistaken for envelopes', () => {
  for (const value of [[], {unlocked: false}, {id: 'id', command: 'status', status: 'ok', content: 'body'}, {entry: {id: 'id'}}]) {
    assert.equal(memoryResult('status', value), value);
  }
  const config = envelope('config', {addr: 'example'});
  assert.equal(memoryResult('config_get', config), config, 'unrelated contracts stay outside this change');
});

test('non-ok envelopes, mismatched commands and explicit legacy errors propagate', () => {
  for (const status of ['fail', 'warn', 'pending', 'skip']) {
    assert.throws(() => memoryResult('update', envelope('update', {}, null, {status, errors: ['write failed']})), /write failed/);
  }
  assert.throws(() => memoryResult('status', envelope('list', {})), /不匹配/);
  assert.throws(() => memoryResult('update', {ok: false}), /失败/);
  assert.throws(() => memoryResult('status', {error: 'cannot read'}), /cannot read/);
});

test('sync and memory mutation refresh flows normalize only their known envelopes', () => {
  for (const [command, cli, summary] of [['sync', 'sync', {pulled: 2, pushed: 1}],
    ['restore', 'restore', {id: 'id', restored: true}], ['delete', 'forget', {deleted: true}],
    ['purge', 'purge', {purged: true}], ['attach', 'attach', {child: 'id', parent: 'parent'}]]) {
    assert.deepEqual(memoryResult(command, envelope(cli, summary)), summary);
  }
});
