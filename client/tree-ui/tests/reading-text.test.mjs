import test from 'node:test';
import assert from 'node:assert/strict';
import {splitReadingBlocks} from '../src/readingText.js';

test('空正文返回空数组（渲染层据此显示占位）', () => {
  assert.deepEqual(splitReadingBlocks(''), []);
  assert.deepEqual(splitReadingBlocks('   \n  '), []);
  assert.deepEqual(splitReadingBlocks(null), []);
});

test('整段无空行的【标记】正文按标记切行（CLI 常见形态）', () => {
  const text = '记忆梳理三诊断法（2026-09-16）【前因】哥哥令梳理。【行为】跑了四件套。【后果】六病下降。';
  const blocks = splitReadingBlocks(text);
  assert.equal(blocks.length, 1);
  const block = blocks[0];
  assert.equal(block.marked, true, '含【标记】的多行块须标 marked');
  const tags = block.lines.filter(l => l.tag).map(l => l.tag);
  assert.deepEqual(tags, ['前因', '行为', '后果']);
  // Preserve content before the first label as a plain line.
  assert.match(block.lines[0].text, /记忆梳理三诊断法（2026-09-16）$/);
  assert.equal(block.lines[0].tag, null);
  assert.equal(block.lines.find(l => l.tag === '行为').text, '跑了四件套。');
});

test('空行分段：两段各自成块，段内多行平铺', () => {
  const blocks = splitReadingBlocks('第一段第一行\n第一段第二行\n\n第二段');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].marked, false);
  assert.deepEqual(blocks[0].lines.map(l => l.text), ['第一段第一行', '第一段第二行']);
  assert.deepEqual(blocks[1].lines.map(l => l.text), ['第二段']);
});

test('单行含标记不算标记块（marked 需多行，与网页端判据一致）', () => {
  const blocks = splitReadingBlocks('【前因】一句话。');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].marked, false);
});

test('CRLF 归一：Windows 换行不产生多余空行', () => {
  const blocks = splitReadingBlocks('甲\r\n\r\n乙');
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map(b => b.lines[0].text), ['甲', '乙']);
});

test('标记长度受限：超长【…】不当作标记切分（防正文误切）', () => {
  const long = '【' + '甲'.repeat(20) + '】正文';
  const blocks = splitReadingBlocks(long);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].lines.length, 1, '超长标记不应被切出新行');
});
