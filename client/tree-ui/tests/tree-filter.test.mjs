import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOT_ID,DIARY_ID,realTree} from '../src/treeModel.js';

const base = (over = {}) => ({
  id: over.id || 'm1', title: '标题', content: '正文', importance: 'normal',
  parentId: null, tags: [], createdAt: '2026-09-16T01:00:00Z', updatedAt: '2026-09-16T01:00:00Z', ...over,
});

test('空纲过滤：无子的词库纲与大类纲隐藏，有子者一律保留', () => {
  // Cover empty taxonomy headings and empty ordinary leaves.
  const emptyCategory = base({id: 'cat-empty', title: '兴趣娱乐', content: '兴趣娱乐：娱乐之事。', tags: ['词库纲', '人域']});
  const filledCategory = base({id: 'cat-filled', title: '编程开发', content: '编程开发：代码项目、技术栈。', tags: ['词库纲', '人域']});
  const child = base({id: 'cat-child', parentId: 'cat-filled', title: 'respire 客户端'});
  const contentless = base({id: 'ghost', title: '', content: ''});
  const normal = base({id: 'real', title: '真记忆', content: '有正文。'});
  const nodes = realTree([emptyCategory, filledCategory, child, contentless, normal]);
  const ids = new Set(nodes.map(n => n.id));
  assert.equal(ids.has('cat-empty'), false, '无子空纲须隐藏');
  assert.equal(ids.has('ghost'), false, '无正文且无子须隐藏');
  assert.equal(ids.has('cat-filled'), true, '有子的纲须保留');
  assert.equal(ids.has('cat-child'), true);
  assert.equal(ids.has('real'), true);
});

test('空纲过滤不牵连子代：纲有子即显示，即便正文是纲目说明式', () => {
  const cat = base({id: 'cat', title: '健康医疗', content: '健康医疗：身体与就医之事。', tags: ['词库纲']});
  const kid = base({id: 'kid', parentId: 'cat', title: '体检记录'});
  const ids = new Set(realTree([cat, kid]).map(n => n.id));
  assert.equal(ids.has('cat'), true);
  assert.equal(ids.has('kid'), true);
});

test('琐事按日归档到日记本，且不混入分类树', () => {
  const trivial = base({id: 't1', title: '活动轨迹 2026-09-15', content: '【08:00】干活', importance: 'trivial'});
  const nodes = realTree([trivial, base({id: 'm1'})]);
  const byId = new Map(nodes.map(n => [n.id, n]));
  assert.equal(byId.get('t1').parentId, 'diary-2026-09-15', '轨迹条须挂到当日节点');
  assert.equal(byId.get('diary-2026-09-15').parentId, DIARY_ID);
  assert.equal(byId.get('m1').parentId, ROOT_ID);
});

test('孤儿挂根：父不在库中的记忆归到记忆树根下', () => {
  const nodes = realTree([base({id: 'orphan', parentId: 'missing'})]);
  assert.equal(nodes.find(n => n.id === 'orphan').parentId, ROOT_ID);
});
