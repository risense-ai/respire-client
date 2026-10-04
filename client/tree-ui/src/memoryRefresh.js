// A revision is opaque and profile-scoped. Never compare timestamps, counts or DB mtimes.
export function revisionKey(value) {
  if (!value || typeof value.profile !== 'string' || !value.profile
    || typeof value.revision !== 'string' || !value.revision) {
    throw new Error('CLI 未提供记忆修订标识，请升级 CLI 后重试');
  }
  return JSON.stringify([value.profile, value.revision]);
}

const errorText = error => error?.message || String(error);

// Pure single-flight controller. The owner supplies live pause state and invalidates
// requests when edits/navigation begin, so a late read cannot repaint newer local work.
export function createMemoryRefresh({readRevision, readSnapshot, apply, reportError,
  isPaused = () => false, now = Date.now}) {
  let disposed = false;
  let epoch = 0;
  let running = null;
  let appliedKey = null;
  let appliedProfile = null;
  let failures = 0;
  let retryAt = 0;
  let legacyMode = false;

  async function refresh({force = false, keepView = true} = {}) {
    if (disposed || isPaused({force})) return 'paused';
    if (!force && (running || now() < retryAt)) return 'waiting';
    if (force) epoch++;
    const request = epoch;
    if (running) await running;
    const current = () => !disposed && request === epoch && !isPaused({force});
    if (!current()) return 'discarded';
    const work = (async () => {
      try {
        let revision;
        let legacyError;
        try {
          revision = await readRevision();
          revisionKey(revision);
        } catch (error) {
          if (!force) throw error;
          revision = null;
          legacyError = error;
        }
        if (!current()) return 'discarded';
        const key = revision ? revisionKey(revision) : null;
        if (!force && key === appliedKey) {
          failures = 0;
          reportError('');
          return 'unchanged';
        }
        const snapshot = await readSnapshot({legacy: !revision});
        if (!current()) return 'discarded';
        const profile = snapshot.status?.data_dir;
        if (typeof profile !== 'string' || !profile) throw new Error('CLI 未返回当前空间标识');
        if (revision) {
          if (snapshot.status.unlocked && (typeof snapshot.listProfile !== 'string' || !snapshot.listProfile)) {
            throw new Error('CLI 未提供列表空间标识，请升级 CLI 后重试');
          }
          const after = await readRevision();
          if (!current()) return 'discarded';
          if (key !== revisionKey(after) || profile !== revision.profile
            || (snapshot.status.unlocked && snapshot.listProfile !== revision.profile)) {
            // Do not advance the baseline. The next poll must retry this change.
            reportError('读取期间记忆库或空间已变化，稍后自动重试。');
            return 'changed-during-read';
          }
        }
        apply(snapshot, {keepView, profileChanged: appliedProfile !== null && appliedProfile !== profile});
        appliedKey = key;
        appliedProfile = profile;
        failures = 0;
        retryAt = 0;
        legacyMode = !!legacyError;
        reportError(legacyError
          ? '自动刷新暂不可用，请升级 CLI；仍可手动刷新。' + errorText(legacyError)
          : '');
        return 'applied';
      } catch (error) {
        if (!current()) return 'discarded';
        // Bounded backoff; foreground manual refresh always bypasses it.
        retryAt = now() + Math.min(60000, 5000 * 2 ** Math.min(failures++, 4));
        reportError((legacyMode ? '自动刷新暂不可用，请升级 CLI；仍可手动刷新。' : '自动刷新失败，现有内容已保留，可手动重试：') + errorText(error));
        return 'failed';
      }
    })();
    running = work;
    try { return await work; }
    finally { if (running === work) running = null; }
  }

  return {
    refresh,
    invalidate() { epoch++; },
    dispose() { disposed = true; epoch++; },
  };
}

// Only called for initial/manual reads or a changed token, never just for detection.
export async function readMemorySnapshot(invoke, list, {legacy = false} = {}) {
  const status = await invoke('status');
  if (!status || typeof status.unlocked !== 'boolean') throw new Error('CLI 状态返回无效');
  const result = status.unlocked ? await list() : {memories: []};
  const memories = Array.isArray(result) ? result : result?.memories;
  const listProfile = Array.isArray(result) ? null : result?.profile;
  if (!Array.isArray(memories)) throw new Error('记忆列表读取失败');
  if (legacy) {
    const after = await invoke('status');
    const identity = value => JSON.stringify([value?.data_dir, value?.unlocked, value?.session?.user]);
    if (identity(status) !== identity(after)) throw new Error('读取期间空间或会话已切换，请重试');
  }
  return {status, memories, listProfile};
}

// Leaving a dialog must not cancel an explicit refresh started by its close handler.
export function protectionEntered(previous, current) {
  return Object.entries(current).some(([key, value]) => value && value !== previous[key]);
}
