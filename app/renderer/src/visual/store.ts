/**
 * visual/store.ts — VisualStore
 * 唯一 runtime source：主题选择、用户预设、实时调参。
 * 编辑官方主题 → 自动复制为 Custom Copy（source: user），官方主题永不落盘。
 *
 * 持久化纪律（修正 3）：setParam 只改内存并 emit；写入 IPC 由 debounce(500ms) 汇聚，
 * Save / SaveAs / Rename / Duplicate / Delete / Preset 切换 时立即写盘。
 */
import type { VisualFile, VisualTheme } from './types';
import { cloneTheme, getBuiltinTheme, listThemes, makeCustomBase } from './registry';
import * as persist from './persist';

type Listener = () => void;

interface Snapshot {
  activeThemeId: string;
  activeName: string;
  activeSource: 'builtin' | 'user';
  revision: number;
}

let activeThemeId = 'aqua';
let presets: VisualTheme[] = [];
let snapshot: Snapshot = { activeThemeId: 'aqua', activeName: 'Aqua', activeSource: 'builtin', revision: 0 };
const listeners = new Set<Listener>();
let seq = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  snapshot = {
    activeThemeId,
    activeName: getActiveMeta().name,
    activeSource: getActiveMeta().source,
    revision: snapshot.revision + 1,
  };
  listeners.forEach((l) => l());
}

/* ---------- 持久化（debounce 汇聚） ---------- */
function toFile(): VisualFile {
  return { version: 1, activeThemeId, activePresetId: isUserPreset(activeThemeId) ? activeThemeId : null, presets };
}
function schedulePersist() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => flush(), 500);
}
async function flush() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  await persist.saveVisual(toFile());
}

/* ---------- 查询 ---------- */
function isUserPreset(id: string): boolean { return presets.some((p) => p.id === id); }
function getActiveMeta(): { id: string; name: string; source: 'builtin' | 'user' } {
  const p = presets.find((x) => x.id === activeThemeId);
  if (p) return { id: p.id, name: p.name, source: 'user' };
  const b = getBuiltinTheme(activeThemeId);
  return { id: activeThemeId, name: b?.name ?? 'Custom', source: 'builtin' };
}
function themeOf(id: string): VisualTheme {
  const p = presets.find((x) => x.id === id);
  if (p) return cloneTheme(p);
  const b = getBuiltinTheme(id);
  if (b) return b;
  return makeCustomBase();
}
function getActiveTheme(): VisualTheme {
  return themeOf(activeThemeId);
}

function listPresets(): { id: string; name: string; description?: string; source: 'builtin' | 'user' }[] {
  return [
    ...listThemes(),
    ...presets.map((p) => ({ id: p.id, name: p.name, source: 'user' as const })),
  ];
}

/* ---------- 操作 ---------- */
async function apply(id: string): Promise<void> {
  activeThemeId = id;
  await flush();
  emit();
}

function ensureEditable(): VisualTheme {
  const p = presets.find((x) => x.id === activeThemeId);
  if (p) return p;
  const base = themeOf(activeThemeId);
  const id = `custom-copy-${++seq}`;
  const name = `Custom Copy · ${base.name}`;
  const copy = { ...cloneTheme(base), id, name, source: 'user' as const };
  presets.unshift(copy);
  activeThemeId = id;
  schedulePersist();
  return presets[0];
}

type MutableObj = { [k: string]: unknown };

function setPath(target: MutableObj, path: string, value: unknown): void {
  const seg = path.split('.');
  let o = target;
  for (let i = 0; i < seg.length - 1; i++) o = o[seg[i]] as MutableObj;
  o[seg[seg.length - 1]] = value;
}

function setParam(path: string, value: unknown): void {
  setPath(ensureEditable() as unknown as MutableObj, path, value);
  schedulePersist();
  emit();
}

function setParamMany(entries: [string, unknown][]): void {
  const p = ensureEditable() as unknown as MutableObj;
  for (const [path, value] of entries) setPath(p, path, value);
  schedulePersist();
  emit();
}

async function saveAs(name: string): Promise<string> {
  const p = ensureEditable();
  const t = cloneTheme(p);
  const id = `user-${Date.now().toString(36)}`;
  t.id = id; t.name = name; t.source = 'user';
  presets.unshift(t);
  activeThemeId = id;
  await flush();
  emit();
  return id;
}

async function renamePreset(id: string, name: string): Promise<void> {
  const p = presets.find((x) => x.id === id);
  if (!p) return;
  p.name = name;
  await flush();
  emit();
}

async function duplicatePreset(id: string): Promise<string | null> {
  let srcTheme: VisualTheme | null = null;
  let srcName = '';
  const p = presets.find((x) => x.id === id);
  if (p) { srcTheme = p; srcName = p.name; }
  else { const b = getBuiltinTheme(id); if (b) { srcTheme = b; srcName = b.name; } }
  if (!srcTheme) return null;
  const t = cloneTheme(srcTheme);
  const nid = `user-${Date.now().toString(36)}`;
  t.id = nid; t.name = `${srcName} 副本`; t.source = 'user';
  presets.unshift(t);
  await flush();
  emit();
  return nid;
}

async function removePreset(id: string): Promise<void> {
  presets = presets.filter((x) => x.id !== id);
  if (activeThemeId === id) { activeThemeId = 'aqua'; }
  await flush();
  emit();
}

async function resetActive(): Promise<void> {
  activeThemeId = 'aqua';
  await flush();
  emit();
}

async function importFromFile(): Promise<VisualTheme | null> {
  const t = await persist.importTheme();
  if (!t) return null;
  const id = `user-${Date.now().toString(36)}`;
  t.id = id; t.source = 'user';
  if (!t.name) t.name = '导入主题';
  presets.unshift(t);
  activeThemeId = id;
  await flush();
  emit();
  return t;
}

/* ---------- 初始化（含旧 visualMode 迁移） ---------- */
async function init(): Promise<void> {
  const file = await persist.loadVisual();
  if (file && Array.isArray(file.presets)) {
    presets = file.presets.filter((p) => p && p.id && p.scene && p.ui).map(cloneTheme);
    if (file.activePresetId && presets.some((p) => p.id === file.activePresetId)) activeThemeId = file.activePresetId;
    else if (file.activeThemeId) activeThemeId = file.activeThemeId;
    if (!getBuiltinTheme(activeThemeId) && !isUserPreset(activeThemeId)) activeThemeId = 'aqua';
  } else {
    // 首次启动：旧 settings.visualMode → 新主题 id 迁移（向后兼容，迁移后旧字段不再是视觉来源）
    await migrateFromVisualMode();
  }
  emit();
}

async function migrateFromVisualMode(): Promise<void> {
  try {
    const st = await window.aurora.getSettings();
    const mode = st.visualMode || 'aqua';
    const map: Record<string, string> = { cinema: 'aqua', aurora: 'aqua', minimal: 'aqua', glass: 'aqua', oled: 'aqua' };
    if (mode === 'custom') {
      const copy = makeCustomBase();
      copy.id = `user-${Date.now().toString(36)}`;
      copy.name = 'Custom';
      copy.source = 'user';
      presets = [copy];
      activeThemeId = copy.id;
    } else {
      activeThemeId = map[mode] ?? 'aqua';
    }
    await flush();
  } catch {
    activeThemeId = 'aqua';
  }
}

export const VisualStore = {
  init,
  on(cb: Listener) { listeners.add(cb); return () => listeners.delete(cb); },
  getSnapshot(): Snapshot { return snapshot; },
  subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); },

  get activeThemeId() { return activeThemeId; },
  isUserPreset,
  getActiveMeta,
  getActiveTheme,
  themeOf,
  listPresets,
  apply,
  setParam,
  setParamMany,
  saveAs,
  renamePreset,
  duplicatePreset,
  removePreset,
  resetActive,
  importFromFile,
  exportActive: () => persist.exportTheme(getActiveTheme()),
  flush,
};
