import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryRefresh, readMemorySnapshot, revisionKey, protectionEntered} from '../src/memoryRefresh.js';

const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r}); return {promise, resolve}; };
function fixture() {
  let revision = {profile: '/profiles/main', revision: '1'};
  let memories = [{id: 'one', content: 'old'}];
  let paused = false;
  let time = 0;
  const applied = [], errors = [];
  const reads = {revision: 0, snapshot: 0};
  const hooks = {
    readRevision: async () => {reads.revision++; return revision},
    readSnapshot: async () => {reads.snapshot++; return {status: {data_dir: revision.profile, unlocked: true}, listProfile: revision.profile, memories}},
    apply: (...args) => applied.push(args),
    reportError: value => errors.push(value),
    isPaused: () => paused,
    now: () => time,
  };
  return {hooks, applied, errors, reads, make: () => createMemoryRefresh(hooks),
    revision: value => {revision = value}, memories: value => {memories = value},
    pause: value => {paused = value}, advance: value => {time += value}};
}

test('first poll loads a guarded snapshot; unchanged polls do not read any plaintext', async () => {
  const f = fixture(), c = f.make();
  assert.equal(await c.refresh(), 'applied');
  assert.equal(await c.refresh(), 'unchanged');
  assert.equal(f.reads.snapshot, 1);
  assert.equal(f.reads.revision, 3);
});

test('a write after initial paint and before first timer is not lost to baseline initialization', async () => {
  const f = fixture(), c = f.make();
  await c.refresh({force: true, keepView: false});
  f.revision({profile: '/profiles/main', revision: '2'});
  f.memories([{id: 'one', content: 'updated'}]);
  await c.refresh();
  assert.equal(f.applied.length, 2);
  assert.equal(f.applied[1][0].memories[0].content, 'updated');
  assert.deepEqual(f.applied[1][1], {keepView: true, profileChanged: false});
});

test('opaque revisions detect same-count older edits, tombstones, purge and an empty store', async () => {
  const f = fixture(), c = f.make();
  await c.refresh();
  for (const [revision, rows] of [['old-row-sync', [{id: 'one', updatedAt: '1999', content: 'new'}]],
    ['tombstone', []], ['restore', [{id: 'one'}]], ['purge', []]]) {
    f.revision({profile: '/profiles/main', revision}); f.memories(rows);
    assert.equal(await c.refresh(), 'applied');
    assert.deepEqual(f.applied.at(-1)[0].memories, rows);
  }
});

test('profile changes refresh even with the same revision and request view reset', async () => {
  const f = fixture(), c = f.make();
  await c.refresh();
  f.revision({profile: '/profiles/team', revision: '1'});
  await c.refresh();
  assert.equal(f.applied.at(-1)[1].profileChanged, true);
});

test('polls are single-flight and never queue overlapping list loads', async () => {
  const f = fixture(), wait = deferred();
  f.hooks.readSnapshot = () => wait.promise;
  const c = f.make();
  const first = c.refresh(); await Promise.resolve();
  assert.equal(await c.refresh(), 'waiting');
  wait.resolve({status: {data_dir: '/profiles/main'}, memories: []});
  assert.equal(await first, 'applied');
  assert.equal(f.applied.length, 1);
});

test('opening an editor while revision is pending prevents list read and repaint', async () => {
  const f = fixture(), wait = deferred();
  f.hooks.readRevision = () => wait.promise;
  const c = f.make(), pending = c.refresh();
  f.pause(true);
  wait.resolve({profile: '/profiles/main', revision: '1'});
  assert.equal(await pending, 'discarded');
  assert.equal(f.reads.snapshot, 0);
  assert.equal(f.applied.length, 0);
});

test('opening a dialog while list is pending preserves editor/view state', async () => {
  const f = fixture(), wait = deferred();
  f.hooks.readSnapshot = () => wait.promise;
  const c = f.make(), pending = c.refresh(); await Promise.resolve();
  f.pause(true);
  wait.resolve({status: {data_dir: '/profiles/main'}, memories: []});
  assert.equal(await pending, 'discarded');
  assert.equal(f.applied.length, 0);
});

test('an editor opened and closed during a read still invalidates that response', async () => {
  const f = fixture(), wait = deferred();
  f.hooks.readSnapshot = () => wait.promise;
  const c = f.make(), pending = c.refresh(); await Promise.resolve();
  f.pause(true); c.invalidate(); f.pause(false);
  wait.resolve({status: {data_dir: '/profiles/main'}, memories: []});
  assert.equal(await pending, 'discarded');
  assert.equal(f.applied.length, 0);
});

test('a write or profile switch during load is discarded and retried without advancing baseline', async () => {
  for (const changed of [{profile: '/profiles/main', revision: '2'}, {profile: '/profiles/team', revision: '1'}]) {
    const f = fixture(); const normal = f.hooks.readSnapshot;
    f.hooks.readSnapshot = async () => {const snapshot = await normal(); f.revision(changed); return snapshot};
    const c = f.make();
    assert.equal(await c.refresh(), 'changed-during-read');
    assert.equal(f.applied.length, 0);
    f.hooks.readSnapshot = normal;
    // The controller captured the wrapper; on the next read it sets the already-current token.
    assert.equal(await c.refresh(), 'applied');
  }
});

test('list with a mismatched status profile is never applied', async () => {
  const f = fixture();
  f.hooks.readSnapshot = async () => ({status: {data_dir: '/profiles/wrong'}, memories: []});
  assert.equal(await f.make().refresh(), 'changed-during-read');
  assert.equal(f.applied.length, 0);
});

test('newer explicit refresh supersedes an in-flight read and only the latest paints', async () => {
  const f = fixture(), wait = deferred(); let count = 0;
  f.hooks.readSnapshot = async () => ++count === 1 ? wait.promise : {status: {data_dir: '/profiles/main'}, memories: [{id: 'new'}]};
  const c = f.make(), old = c.refresh(); await Promise.resolve();
  const newer = c.refresh({force: true});
  const latest = c.refresh({force: true});
  wait.resolve({status: {data_dir: '/profiles/main'}, memories: [{id: 'old'}]});
  assert.equal(await old, 'discarded'); assert.equal(await newer, 'discarded');
  assert.equal(await latest, 'applied');
  assert.equal(count, 2); assert.equal(f.applied.length, 1);
  assert.equal(f.applied[0][0].memories[0].id, 'new');
});

test('disposing prevents late completion, including React StrictMode cleanup', async () => {
  const f = fixture(), wait = deferred();
  f.hooks.readSnapshot = () => wait.promise;
  const c = f.make(), pending = c.refresh(); await Promise.resolve();
  c.dispose(); wait.resolve({status: {data_dir: '/profiles/main'}, memories: []});
  assert.equal(await pending, 'discarded');
  assert.equal(f.applied.length, 0);
  assert.equal(await c.refresh({force: true}), 'paused');
});

test('failed refresh retains the view, backs off, and retries the same revision', async () => {
  const f = fixture(); let failing = true;
  f.hooks.readSnapshot = async () => {if (failing) throw new Error('read failed'); return {status: {data_dir: '/profiles/main'}, memories: []}};
  const c = f.make();
  assert.equal(await c.refresh(), 'failed');
  assert.equal(f.applied.length, 0); assert.match(f.errors.at(-1), /read failed/);
  assert.equal(await c.refresh(), 'waiting');
  f.advance(5000); failing = false;
  assert.equal(await c.refresh(), 'applied'); assert.equal(f.errors.at(-1), '');
});

test('old CLI has explicit warning and manual fallback, never repeated plaintext polling', async () => {
  const f = fixture();
  f.hooks.readRevision = async () => {throw new Error("unrecognized subcommand 'memory-revision'")};
  const c = f.make();
  assert.equal(await c.refresh({force: true}), 'applied');
  assert.match(f.errors.at(-1), /升级 CLI.*手动刷新/);
  const count = f.reads.snapshot;
  assert.equal(await c.refresh(), 'failed');
  assert.equal(await c.refresh(), 'waiting');
  assert.equal(f.reads.snapshot, count);
  assert.equal(await c.refresh({force: true}), 'applied');
  assert.equal(f.reads.snapshot, count + 1);
});

test('invalid revision also allows explicit manual fallback with warning', async () => {
  const f = fixture(); f.hooks.readRevision = async () => ({revision: 9});
  assert.equal(await f.make().refresh({force: true}), 'applied');
  assert.match(f.errors.at(-1), /升级 CLI/);
  assert.throws(() => revisionKey({profile: '/a', revision: 9}));
});

test('legacy snapshot guards profile/session switches and reads no list when locked', async () => {
  let calls = 0;
  const invoke = async () => ({data_dir: ++calls === 1 ? '/a' : '/b', unlocked: true});
  await assert.rejects(readMemorySnapshot(invoke, async () => [], {legacy: true}), /已切换/);
  let listed = false;
  const snapshot = await readMemorySnapshot(async () => ({data_dir: '/a', unlocked: false}), async () => {listed = true});
  assert.equal(listed, false); assert.deepEqual(snapshot.memories, []);
});

test('mount and dialog close do not invalidate boot, even when preferences stays open', async () => {
  assert.equal(protectionEntered({}, {editor: null, preferences: false, showGate: false}), false);
  assert.equal(protectionEntered({preferences: true, showGate: true}, {preferences: true, showGate: false}), false);
  assert.equal(protectionEntered({preferences: true, showGate: false}, {preferences: true, showGate: true}), true);
  const f = fixture(), c = f.make();
  const pending = c.refresh({force: true});
  if (protectionEntered({preferences: true, showGate: true}, {preferences: true, showGate: false})) c.invalidate();
  assert.equal(await pending, 'applied');
});

test('A to B to A profile switch cannot paint a list produced by B', async () => {
  const f = fixture();
  f.hooks.readSnapshot = async () => ({status: {data_dir: '/profiles/main', unlocked: true},
    listProfile: '/profiles/team', memories: [{id: 'from-team'}]});
  assert.equal(await f.make().refresh(), 'changed-during-read');
  assert.equal(f.applied.length, 0);
});
