import test from 'node:test';
import assert from 'node:assert/strict';
import {fontStack,normalizeAppearance,UI_FONT_STACK,READ_FONT_STACK,loadAppearance,saveAppearance,applyAppearance,DEFAULT_APPEARANCE,UI_SCALES,READ_SIZE_RANGE,READ_LH_RANGE} from '../src/appearance.js';

test('fontStack: 空族名与「系统默认」皆回落缺省栈', () => {
  assert.equal(fontStack('', UI_FONT_STACK), UI_FONT_STACK);
  assert.equal(fontStack('   ', READ_FONT_STACK), READ_FONT_STACK);
  assert.equal(fontStack('系统默认', UI_FONT_STACK), UI_FONT_STACK);
  assert.equal(fontStack(null, READ_FONT_STACK), READ_FONT_STACK);
});

test('fontStack: 单族名加引号并接缺省栈兜底，栈式输入原样用', () => {
  assert.equal(fontStack('Noto Sans CJK SC', UI_FONT_STACK), `"Noto Sans CJK SC",${UI_FONT_STACK}`);
  // Strip quotes from family names to prevent escaping the CSS stack.
  assert.equal(fontStack('Bad"Name', UI_FONT_STACK), `"BadName",${UI_FONT_STACK}`);
  assert.equal(fontStack('A, B, sans-serif', UI_FONT_STACK), 'A, B, sans-serif');
});

test('loadAppearance: 无存储时给缺省值，非法数值夹紧范围', () => {
  assert.deepEqual(loadAppearance(), DEFAULT_APPEARANCE);
  const root = {
    style: {
      props: new Map(),
      setProperty(k, v) { this.props.set(k, v); },
      removeProperty(k) { this.props.delete(k); },
    },
  };
  // Exercise numeric values outside their supported ranges.
  applyAppearance({uiFont: '', readFont: '', uiScale: 9, readSize: 999, readLh: 0.1}, root);
  assert.equal(root.style.props.get('--read-size'), `${READ_SIZE_RANGE[1]}px`);
  assert.equal(root.style.props.get('--read-lh'), String(READ_LH_RANGE[0]));
  assert.equal(root.style.props.get('zoom'), '1.6');
  // Scale 1 must clear zoom to preserve percentage positioning.
  applyAppearance({...DEFAULT_APPEARANCE, uiScale: 1}, root);
  assert.equal(root.style.props.has('zoom'), false);
});

test('applyAppearance: 字体族落到 CSS 变量、正文尺寸随设置联动', () => {
  const root = {
    style: {
      props: new Map(),
      setProperty(k, v) { this.props.set(k, v); },
      removeProperty(k) { this.props.delete(k); },
    },
  };
  applyAppearance({uiFont: 'Noto Sans CJK SC', readFont: 'Source Han Serif SC', uiScale: 1.25, readSize: 17, readLh: 2.4}, root);
  assert.equal(root.style.props.get('--ui-font'), `"Noto Sans CJK SC",${UI_FONT_STACK}`);
  assert.equal(root.style.props.get('--read-font'), `"Source Han Serif SC",${READ_FONT_STACK}`);
  assert.equal(root.style.props.get('--read-size'), '17px');
  assert.equal(root.style.props.get('--read-lh'), '2.4');
  assert.equal(root.style.props.get('zoom'), '1.25');
});

test('loadAppearance/saveAppearance: 无 localStorage 环境不抛异常（降级为缺省）', () => {
  assert.doesNotThrow(() => loadAppearance());
  assert.equal(saveAppearance(DEFAULT_APPEARANCE), false);
});

test('档位常量自洽：UI_SCALES 含 100%，范围上下限有序', () => {
  assert.ok(UI_SCALES.some(s => s.value === 1), 'UI_SCALES 须含标准 100% 档');
  assert.ok(READ_SIZE_RANGE[0] < READ_SIZE_RANGE[1]);
  assert.ok(READ_LH_RANGE[0] < READ_LH_RANGE[1]);
});

test('缩放补偿：--ui-scale 与 zoom 同步写，供 CSS calc 抵消 100dvh 被放大', () => {
  // Compensate scaled viewport height with calc(100dvh / var(--ui-scale)).
  // The scale variable and zoom must stay synchronized to avoid vertical overflow.
  const root = {
    style: {
      props: new Map(),
      setProperty(k, v) { this.props.set(k, v); },
      removeProperty(k) { this.props.delete(k); },
    },
  };
  for (const scale of [1, 1.25, 1.4]) {
    applyAppearance({...DEFAULT_APPEARANCE, uiScale: scale}, root);
    assert.equal(root.style.props.get('--ui-scale'), String(scale), `scale=${scale} 时 --ui-scale 须同步`);
  }
  applyAppearance({...DEFAULT_APPEARANCE, uiScale: 1}, root);
  assert.equal(root.style.props.has('zoom'), false, '标准档不留 zoom 属性');
  assert.equal(root.style.props.get('--ui-scale'), '1', '标准档仍留回退值 1');
});
