/* ============================================================
   visual/store.js — 视觉状态 + 用户预设存档（原型用 localStorage 演示持久化）
   编辑官方主题 → 自动复制为 Custom Copy（source: user），官方永不覆盖
   ============================================================ */

window.VISUAL = window.VISUAL || {};

(function () {
  const LS_KEY = 'aurora-visual-presets-v1';
  const LS_ACTIVE = 'aurora-visual-active-v1';
  const LS_OVER = 'aurora-visual-overrides-v1';

  let presets = [];          // 用户预设 [{ id, name, theme }]
  let activeId = 'cinema';
  let overrides = {};        // 实时编辑覆盖 { 'lighting.intensity': .6, ... }（挂在 Custom 上）
  let seq = 0;
  const subs = new Set();

  /* ---------- 持久化 ---------- */
  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(presets));
      localStorage.setItem(LS_ACTIVE, activeId);
      localStorage.setItem(LS_OVER, JSON.stringify(overrides));
    } catch {}
  }
  function load() {
    try {
      presets = JSON.parse(localStorage.getItem(LS_KEY) || '[]') || [];
      activeId = localStorage.getItem(LS_ACTIVE) || 'cinema';
      overrides = JSON.parse(localStorage.getItem(LS_OVER) || '{}') || {};
    } catch {
      presets = []; activeId = 'cinema'; overrides = {};
    }
  }

  function notify() { subs.forEach((cb) => cb()); }
  function on(cb) { subs.add(cb); return () => subs.delete(cb); }

  /* ---------- 查询 ---------- */
  function listPresets() {
    const builtin = window.VISUAL.registry.list().map((t) => ({ id: t.id, name: t.name, description: t.description, source: t.source }));
    return [...builtin, ...presets.map((p) => ({ id: p.id, name: p.name, description: '我的预设', source: 'user' }))];
  }
  function getActiveMeta() {
    if (presets.find((p) => p.id === activeId)) return { id: activeId, name: presets.find((p) => p.id === activeId).name, source: 'user' };
    const b = window.VISUAL.registry.get(activeId);
    return { id: activeId, name: b ? b.name : 'Custom', source: 'builtin' };
  }
  function themeOf(id) {
    const p = presets.find((x) => x.id === id);
    if (p) return JSON.parse(JSON.stringify(p.theme));
    const b = window.VISUAL.registry.get(id);
    if (b) return JSON.parse(JSON.stringify(b));
    return window.VISUAL.registry.getFull('cinema');
  }
  function getActiveTheme() {
    const t = themeOf(activeId);
    t.id = 'custom'; t.source = 'user';
    // 应用实时覆盖
    for (const [path, v] of Object.entries(overrides)) {
      const seg = path.split('.');
      let o = t;
      for (let i = 0; i < seg.length - 1; i++) o = o[seg[i]];
      o[seg[seg.length - 1]] = v;
    }
    return t;
  }

  /* ---------- 操作 ---------- */
  function apply(id) {
    activeId = id;
    overrides = {};
    persist(); notify();
  }
  // 编辑官方主题 → 自动复制为用户预设并切到它
  function ensureEditable() {
    const p = presets.find((x) => x.id === activeId);
    if (p) return p;
    const base = themeOf(activeId);
    const id = 'custom-copy-' + (++seq);
    const name = 'Custom Copy · ' + (base.name || 'Custom');
    presets.unshift({ id, name, theme: { ...base, id, name, source: 'user' } });
    activeId = id;
    overrides = {};
    persist();
    return presets[0];
  }
  function setParam(path, v) {
    const p = ensureEditable();
    const seg = path.split('.');
    let o = p.theme;
    for (let i = 0; i < seg.length - 1; i++) o = o[seg[i]];
    o[seg[seg.length - 1]] = v;
    delete overrides[path];
    persist(); notify();
  }
  function saveAs(name) {
    const p = ensureEditable();
    const t = JSON.parse(JSON.stringify(p.theme));
    const id = 'user-' + Date.now().toString(36);
    t.id = id; t.name = name; t.source = 'user';
    presets.unshift({ id, name, theme: t });
    activeId = id;
    persist(); notify();
    return id;
  }
  function renamePreset(id, name) {
    const p = presets.find((x) => x.id === id);
    if (p) { p.name = name; p.theme.name = name; persist(); notify(); }
  }
  function duplicatePreset(id) {
    const src = presets.find((x) => x.id === id) || (() => { const b = window.VISUAL.registry.get(id); return b ? { id, name: b.name, theme: b } : null; })();
    if (!src) return;
    const t = JSON.parse(JSON.stringify(src.theme));
    const nid = 'user-' + Date.now().toString(36);
    t.id = nid; t.name = src.name + ' 副本'; t.source = 'user';
    presets.unshift({ id: nid, name: t.name, theme: t });
    persist(); notify();
    return nid;
  }
  function removePreset(id) {
    presets = presets.filter((x) => x.id !== id);
    if (activeId === id) { activeId = 'cinema'; overrides = {}; }
    persist(); notify();
  }
  function resetActive() {
    // 重置 = 回到默认官方主题，清除所有实时覆盖
    activeId = 'cinema';
    overrides = {};
    persist(); notify();
  }
  function exportPreset(id) {
    const t = themeOf(id);
    t.name = id === activeId ? getActiveMeta().name : t.name;
    const json = JSON.stringify({ app: 'aurora-visual-theme', version: 1, theme: t }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (t.name || 'theme').replace(/[^\w\u4e00-\u9fa5-]+/g, '-') + '.aurora-theme.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function importPreset(file) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          const t = data.theme;
          if (!t || !t.scene || !t.ui) { resolve({ ok: false, error: '不是有效的视觉主题文件' }); return; }
          const id = 'user-' + Date.now().toString(36);
          t.id = id; t.source = 'user';
          const name = t.name || '导入主题';
          presets.unshift({ id, name, theme: t });
          activeId = id;
          persist(); notify();
          resolve({ ok: true, name });
        } catch {
          resolve({ ok: false, error: '文件解析失败' });
        }
      };
      r.onerror = () => resolve({ ok: false, error: '读取失败' });
      r.readAsText(file);
    });
  }

  load();
  window.VISUAL.store = {
    get activeId() { return activeId; },
    get overrides() { return overrides; },
    listPresets, getActiveMeta, getActiveTheme, themeOf,
    apply, setParam, saveAs, renamePreset, duplicatePreset, removePreset, resetActive,
    exportPreset, importPreset, on,
  };
})();
