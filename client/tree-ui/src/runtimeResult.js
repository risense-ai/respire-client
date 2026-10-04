// Normalize only the memory/status contracts used by editing and refresh.
// Older CLIs return bare values; current CLIs return explicit ResultEnvelope objects.
const commands = {
  status: ['status', 'summary'],
  list: ['list', 'details'],
  show: ['show', 'details'],
  create: ['remember', 'summary'],
  update: ['update', 'details'],
  memory_revision: ['memory-revision', 'summary'],
  sync: ['sync', 'summary'],
  restore: ['restore', 'summary'],
  delete: ['forget', 'summary'],
  purge: ['purge', 'summary'],
  attach: ['attach', 'summary'],
};

export function memoryResult(command, value) {
  const contract = commands[command];
  if (!contract || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  // Require the envelope's structural markers, never infer from memory body text.
  const envelope = isMemoryEnvelope(value);
  if (!envelope) {
    if (value.ok === false || typeof value.error === 'string') {
      throw new Error(value.error || 'CLI 操作失败');
    }
    return value;
  }
  if (value.command !== contract[0]) throw new Error(`CLI 返回了不匹配的命令：${value.command}`);
  if (value.status !== 'ok') throw new Error(value.errors.join('；') || `CLI ${value.command}: ${value.status}`);
  return value[contract[1]];
}

export function isMemoryEnvelope(value) {
  return !!value && typeof value === 'object' && typeof value.command === 'string' && typeof value.status === 'string'
    && Object.hasOwn(value, 'summary') && Object.hasOwn(value, 'details')
    && Array.isArray(value.items) && Array.isArray(value.errors) && Array.isArray(value.actions);
}
