// Appearance preferences: UI/body fonts, UI scale, body size, and line height.
//
// Store one JSON object under the stable respire-appearance localStorage key; missing fields use defaults.
// Font families use --ui-font and --read-font in styles.css and tree-workspace.css.
// UI scale uses the document's zoom style and scales spacing with text.
// Body size and line height use --read-size and --read-lh independently of UI scaling.
// System font enumeration is provided by the list_system_fonts Tauri command.

export const APPEARANCE_KEY = 'respire-appearance';

/** Default UI font stack; keep it aligned with --ui-font in styles.css. */
export const UI_FONT_STACK = '"LXGW Marker Gothic","霞鹜漫黑","SF Pro Text","PingFang SC","Microsoft YaHei",sans-serif';
/** The body font stack favors readability and falls back to the UI families. */
export const READ_FONT_STACK = '"LXGW Marker Gothic","霞鹜漫黑","Source Han Serif SC","Noto Serif CJK SC","Songti SC",serif';

/** UI scale options enlarge both text and spacing. */
export const UI_SCALES = [
  { value: 0.9, label: '紧凑 90%' },
  { value: 1, label: '标准 100%' },
  { value: 1.1, label: '放大 110%' },
  { value: 1.25, label: '大 125%' },
  { value: 1.4, label: '特大 140%' },
];

export const READ_SIZE_RANGE = [12, 30];
export const READ_LH_RANGE = [1.4, 2.8];

export const DEFAULT_APPEARANCE = {
  uiFont: '',       // An empty value or the localized system-default sentinel selects the default stack.
  readFont: '',
  uiScale: 1,
  readSize: 14,
  readLh: 2.15,
};

/** Read preferences, restore defaults for invalid values, and clamp numeric fields. */
export function loadAppearance() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(APPEARANCE_KEY)); } catch { raw = null; }
  return normalizeAppearance(raw && typeof raw === 'object' ? raw : {});
}

/** Normalize types and clamp values before applying or saving preferences. */
export function normalizeAppearance(src = {}) {
  return {
    uiFont: typeof src.uiFont === 'string' ? src.uiFont : '',
    readFont: typeof src.readFont === 'string' ? src.readFont : '',
    uiScale: clamp(src.uiScale, [0.8, 1.6], DEFAULT_APPEARANCE.uiScale),
    readSize: clamp(src.readSize, READ_SIZE_RANGE, DEFAULT_APPEARANCE.readSize),
    readLh: clamp(src.readLh, READ_LH_RANGE, DEFAULT_APPEARANCE.readLh),
  };
}

function clamp(value, [min, max], fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

export function saveAppearance(value) {
  try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(value)); return true; } catch { return false; }
}

/** Convert a font family to CSS: preserve explicit stacks; otherwise quote the family and append fallback fonts. */
export function fontStack(family, fallback) {
  const name = String(family || '').trim();
  if (!name || name === '系统默认') return fallback;
  if (name.includes(',')) return name;
  return `"${name.replace(/"/g, '')}",${fallback}`;
}

/** Apply normalized CSS variables and zoom. Compensate viewport heights with calc(100dvh / var(--ui-scale)) to prevent vertical overflow. */
export function applyAppearance(value, root = document.documentElement) {
  const v = normalizeAppearance(value);
  root.style.setProperty('--ui-font', fontStack(v.uiFont, UI_FONT_STACK));
  root.style.setProperty('--read-font', fontStack(v.readFont, READ_FONT_STACK));
  root.style.setProperty('--read-size', `${v.readSize}px`);
  root.style.setProperty('--read-lh', String(v.readLh));
  root.style.setProperty('--ui-scale', String(v.uiScale));
  // Clear zoom at scale 1 to avoid changing percentage positioning in descendants.
  if (Math.abs(v.uiScale - 1) < 0.001) root.style.removeProperty('zoom');
  else root.style.setProperty('zoom', String(v.uiScale));
}
