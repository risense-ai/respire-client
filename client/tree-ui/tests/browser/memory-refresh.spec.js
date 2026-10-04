import {test, expect} from '@playwright/test';

const entry = {id: '11111111-1111-4111-8111-111111111111', title: 'First memory', content: 'Original body',
  kind: 'context', importance: 'important', tags: [], parent_id: '', created_at: '2026-09-16T01:00:00Z', updated_at: '2026-09-16T01:00:00Z'};
const envelope = (command, summary, details = null) => ({command, status: 'ok', summary, details, items: [], errors: [], actions: []});
async function runtime(page, {legacy = false} = {}) {
  const state = {profile: '/synthetic/main', revision: 1, rows: [{...entry}], calls: [], beforeList: null};
  await page.clock.install();
  await page.route('**/api/invoke', async route => {
    const {cmd, args} = route.request().postDataJSON();
    state.calls.push(cmd);
    let result;
    switch (cmd) {
      case 'memory_revision':
        if (legacy) return route.fulfill({status: 400, json: {error: "unrecognized subcommand 'memory-revision'"}});
        result = envelope('memory-revision', {profile: state.profile, revision: String(state.revision)}); break;
      case 'status': {
        const status = {data_dir: state.profile, unlocked: true, offline: true, session: {}, local_total: state.rows.length, local_alive: state.rows.length};
        result = legacy ? status : envelope('status', status); break;
      }
      case 'list':
        if (state.beforeList) await state.beforeList();
        result = legacy ? state.rows : envelope('list', {count: state.rows.length, profile: state.profile}, state.rows); break;
      case 'show': result = legacy ? state.rows.find(row => row.id === args.id) : envelope('show', {id: args.id}, {entry: state.rows.find(row => row.id === args.id)}); break;
      case 'update': {
        const row = state.rows.find(row => row.id === args.id);
        Object.assign(row, {title: args.title, content: args.content, kind: args.kind, importance: args.importance ?? row.importance});
        state.revision++;
        result = legacy ? row : envelope('update', {id: row.id, action: 'written'}, row); break;
      }
      case 'config_get': result = {data_dir: state.profile}; break;
      case 'space_list': result = {spaces: []}; break;
      case 'agent_config': result = {}; break;
      case 'diary_mode_get': result = {diary_mode: 'concise'}; break;
      case 'inject_targets': result = []; break;
      default: result = {};
    }
    await route.fulfill({json: result});
  });
  await page.goto('/');
  await expect(page.getByRole('treeitem', {name: /First memory/})).toBeVisible();
  return state;
}

test('StrictMode boot, unchanged poll, same-count external edit and deletion', async ({page}) => {
  const state = await runtime(page);
  await expect(page.getByText('记忆自动刷新已启用')).toBeVisible();
  const reads = state.calls.filter(cmd => cmd === 'list').length;
  await page.clock.fastForward(5100);
  await expect.poll(() => state.calls.filter(cmd => cmd === 'memory_revision').length).toBeGreaterThan(2);
  expect(state.calls.filter(cmd => cmd === 'list').length).toBe(reads);
  state.rows[0].title = 'External older edit'; state.revision++;
  await page.clock.fastForward(5100);
  await expect(page.getByRole('treeitem', {name: /External older edit/})).toBeVisible();
  state.rows = []; state.revision++;
  await page.clock.fastForward(5100);
  await expect(page.getByRole('treeitem', {name: /External older edit/})).toHaveCount(0);
});

test('old CLI boots without a second click and keeps explicit manual-refresh fallback', async ({page}) => {
  const state = await runtime(page, {legacy: true});
  await expect(page.getByText(/自动刷新暂不可用，请升级 CLI/)).toBeVisible();
  const reads = state.calls.filter(cmd => cmd === 'list').length;
  state.rows[0].title = 'Manual legacy update';
  await page.clock.fastForward(11000);
  expect(state.calls.filter(cmd => cmd === 'list').length).toBe(reads);
  await page.getByRole('button', {name: '手动刷新'}).click();
  await expect(page.getByRole('treeitem', {name: /Manual legacy update/})).toBeVisible();
});

test('active editor survives an external revision and importance saves both ways', async ({page}) => {
  const state = await runtime(page);
  await page.getByRole('treeitem', {name: /First memory/}).click();
  await expect(page.getByRole('heading', {name: 'First memory', exact: true, level: 1})).toBeVisible();
  await page.getByRole('treeitem', {name: /First memory/}).press('F2');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('名称', {exact: true}).fill('Unsaved local title');
  state.rows[0].title = 'External revision'; state.revision++;
  await page.clock.fastForward(5100);
  await expect(dialog.getByLabel('名称', {exact: true})).toHaveValue('Unsaved local title');
  await dialog.getByLabel('重要性', {exact: true}).selectOption('trivial');
  await dialog.getByRole('button', {name: '保存', exact: true}).click();
  await expect(dialog).toHaveCount(0);
  expect(state.rows[0].importance).toBe('trivial');
  await expect(page.getByRole('heading', {name: 'Unsaved local title', exact: true, level: 1})).toBeVisible();
  await page.getByRole('button', {name: '节点操作'}).click();
  await page.getByRole('button', {name: /编辑记忆/}).click();
  await page.getByRole('dialog').getByLabel('重要性', {exact: true}).selectOption('important');
  await page.getByRole('dialog').getByRole('button', {name: '保存', exact: true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.rows[0].importance).toBe('important');
});

test('opening and closing a dialog invalidates an already pending list', async ({page}) => {
  const state = await runtime(page);
  let release, started;
  const waiting = new Promise(resolve => {release = resolve});
  const began = new Promise(resolve => {started = resolve});
  state.beforeList = async () => {started(); await waiting};
  state.rows[0].title = 'Pending snapshot'; state.revision++;
  await page.clock.fastForward(5100); await began;
  await page.getByRole('button', {name: '外观与数据'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', {name: '关闭'}).click();
  release(); state.beforeList = null;
  await expect(page.getByRole('treeitem', {name: /First memory/})).toBeVisible();
  await page.clock.fastForward(5100);
  await expect(page.getByRole('treeitem', {name: /Pending snapshot/})).toBeVisible();
});
