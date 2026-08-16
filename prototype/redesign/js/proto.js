/* ============================================================
   Aurora Player — Visual System Prototype
   proto.js — 页面路由、主题切换、交互委托
   ============================================================ */

(function () {
  const $app = document.getElementById('app');
  const $chrome = document.getElementById('proto-chrome');

  /* ---------- 图标（线性 1.8） ---------- */
  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.03 1.03 0 0 0 0-1.76l-11-6.86A1.03 1.03 0 0 0 8 5.14z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/></svg>',
    cast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12.55a11 11 0 0 1 14.08 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>',
    nas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="6" rx="2"/><rect x="2" y="11" width="20" height="6" rx="2"/><path d="M6 6h.01M6 14h.01M16 18l3 3m0-3l-3 3"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
    sub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 14h4M12 14h6M6 17h2M10 17h4"/></svg>',
    track: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V6l12-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="18.5" cy="15" r="2.5"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2.2"/><circle cx="8" cy="16" r="2.2"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>',
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
  };

  /* ---------- 状态 ---------- */
  const state = {
    page: location.hash.replace('#/', '') || 'home',
    query: '', filter: 'all', group: 'play',
    settings: {
      rememberPosition: true, volumeStep: 5, hdrMode: 'auto', hdrAlgo: 'spline',
      replayGain: 'off', audioNormalize: true, audioChannels: 'auto-safe',
      audioExclusive: true, audioBitstream: 'none', subFontSize: 34,
      defaultVolume: 72, audioGain: 0, dlnaEnabled: true, dlnaFriendlyName: '王先生的影音室',
      bgCasting: true, lockPolicy: 'none', theme: 'dark', visualMode: 'cinema',
    },
    modal: null,
    paused: true, pct: 64, volume: 72, mute: false,
    drawer: false, menu: null, fullscreen: false,
  };

  const atoms = {
    winControls() {
      return '<div class="vs-win-controls">'
        + '<button class="vs-win-btn" title="最小化" data-act="noop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14"/></svg></button>'
        + '<button class="vs-win-btn" title="最大化/还原" data-act="noop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="5" width="14" height="14" rx="2"/></svg></button>'
        + '<button class="vs-win-btn close" title="关闭" data-act="noop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg></button>'
        + '</div>';
    },
    icon(name) { return ICON[name] || ''; },
    themeIcon() { return state.settings.theme === 'light' ? atoms.icon('sun') : atoms.icon('moon'); },
  };

  /* ---------- Toast ---------- */
  function toast(msg) {
    let t = document.querySelector('.proto-toast');
    if (!t) { t = document.createElement('div'); t.className = 'proto-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }
  window.VISUAL.toast = toast;

  /* ---------- 渲染 ---------- */
  function render() {
    const page = state.page;
    document.body.dataset.page = page;
    document.body.dataset.vtheme = window.VISUAL.store.activeId;
    $app.innerHTML = window.SHELL[page] ? window.SHELL[page]() : window.SHELL.home();
    renderChrome();
    document.body.dispatchEvent(new CustomEvent('pagechange'));
    restoreSearchFocus();
  }

  function renderChrome() {
    const meta = window.VISUAL.store.getActiveMeta();
    const pages = [['home', '首页'], ['settings', '设置'], ['player', '播放']];
    const arrows =
      '<div class="arrows">'
      + '<button class="arrow" data-act="theme-arrow" data-dir="-1" title="上一主题">&#8249;</button>'
      + '<button class="arrow" data-act="theme-arrow" data-dir="1" title="下一主题">&#8250;</button>'
      + '</div>';
    $chrome.innerHTML =
      arrows
      + `<div class="vlabel" title="${escapeHtml(meta.description || '')}"><b>${escapeHtml(meta.name)}</b>${meta.source === 'user' ? ' · 我的' : ''}</div>`
      + '<button class="theme-btn" data-act="console" title="Visual Console (V)">◈ 控制台</button>'
      + '<div class="sep"></div>'
      + pages.map(([k, l]) => `<button class="pbtn ${state.page === k ? 'on' : ''}" data-act="page" data-v="${k}">${l}</button>`).join('')
      + '<div class="sep"></div>'
      + `<button class="pbtn" data-act="theme-reset" title="恢复默认主题">重置</button>`;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function restoreSearchFocus() {
    const q = $app.querySelector('.search-field');
    if (state._refocus && q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    state._refocus = false;
  }

  /* ---------- 主题切换 ---------- */
  function cycleTheme(dir) {
    const ids = window.VISUAL.store.listPresets().map((p) => p.id);
    const cur = window.VISUAL.store.activeId;
    let i = ids.indexOf(cur) + dir;
    if (i < 0) i = ids.length - 1; if (i >= ids.length) i = 0;
    window.VISUAL.store.apply(ids[i]);
    render();
  }

  /* ---------- 交互委托 ---------- */
  document.body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    switch (act) {
      case 'page':
        state.page = t.dataset.v;
        history.replaceState(null, '', '#' + '/' + state.page);
        render(); break;
      case 'theme-arrow': cycleTheme(+t.dataset.dir); break;
      case 'theme-reset': window.VISUAL.store.resetActive(); toast('已重置为 Cinema'); render(); break;
      case 'console': window.VISUAL.console.open(); break;
      case 'open-file': toast('已打开文件选择器（原型）'); break;
      case 'open-url': state.modal = 'url'; render(); break;
      case 'open-nas': state.modal = 'nas'; render(); break;
      case 'modal-close': case 'modal-cancel': state.modal = null; render(); break;
      case 'modal-play': {
        const input = $app.querySelector('.modal-input');
        toast(`开始播放：${input && input.value.trim() ? input.value.trim() : '网络串流'}`);
        state.modal = null; render(); break;
      }
      case 'modal-connect': toast('已连接：\\\\NAS\\movies'); state.modal = null; render(); break;
      case 'nas-open': toast('正在浏览该目录…'); break;
      case 'play': toast(`开始播放：${t.dataset.name || ''}`); break;
      case 'filter': state.filter = t.dataset.v; render(); break;
      case 'group': state.group = t.dataset.v; render(); break;
      case 'seg': state.settings[t.dataset.key] = t.dataset.v; render(); break;
      case 'switch': state.settings[t.dataset.key] = !state.settings[t.dataset.key]; render(); break;
      case 'action': {
        const labels = { clearRecent: '已清除播放记录', rescan: '已触发扫描', clearLib: '已清空媒体库' };
        toast(labels[t.dataset.key] || '已完成'); render(); break;
      }
      case 'player-pause': state.paused = !state.paused; render(); break;
      case 'player-menu': state.menu = state.menu === t.dataset.v ? null : t.dataset.v; render(); break;
      case 'player-drawer': state.drawer = !state.drawer; render(); break;
      case 'player-fullscreen': state.fullscreen = !state.fullscreen; document.body.classList.toggle('fs', state.fullscreen); render(); break;
      case 'player-track': state.settings[t.dataset.kind] = t.dataset.id; render(); break;
      case 'noop': break;
    }
  });

  document.body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains('search-field')) {
      state._refocus = true;
      state.query = t.value;
      render();
      return;
    }
    if (t.dataset && t.dataset.range) {
      const key = t.dataset.range;
      state.settings[key] = +t.value;
      const label = $app.querySelector(`[data-rangemirror="${key}"]`);
      if (label) label.textContent = t.dataset.suffix ? `${t.value}${t.dataset.suffix}` : t.value;
    }
  });

  document.body.addEventListener('click', (e) => {
    const bar = e.target.closest('.vs-seekbar, .vs-vol-track');
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (bar.classList.contains('vs-seekbar')) state.pct = Math.round(frac * 100);
    else state.volume = Math.round(frac * 100);
    render();
  });

  /* 键盘：←/→ 切主题，V 打开控制台（输入聚焦忽略） */
  document.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.key === 'ArrowLeft') { const b = $chrome.querySelector('[data-act="theme-arrow"][data-dir="-1"]'); b && b.click(); }
    else if (e.key === 'ArrowRight') { const b = $chrome.querySelector('[data-act="theme-arrow"][data-dir="1"]'); b && b.click(); }
  });

  window.addEventListener('hashchange', () => {
    const next = (location.hash.replace('#/', '') || 'home').replace('?', '');
    if (next !== state.page) { state.page = next; render(); }
  });

  window.PROTO = { state, atoms, DATA: window.DATA };

  /* ---------- 启动 ---------- */
  function boot() {
    window.VISUAL.console.ensure();
    window.VISUAL.console.bind();
    window.VISUAL.applier.init();
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
