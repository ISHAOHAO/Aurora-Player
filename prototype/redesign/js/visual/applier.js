/* ============================================================
   visual/applier.js — 编排器：主题 → 变量 + 氛围/粒子/运动
   订阅 store；页面/播放态驱动状态预算；cover 取色不阻塞主题应用
   ============================================================ */

window.VISUAL = window.VISUAL || {};

(function () {
  let styleEl = null;
  let coverCache = {};      // seed → palette（缓存）
  let lastCoverSeed = null;
  let coverPending = null;

  function writeVars(vars) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'vs-vars';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = ':root{' + Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('') + '}';
  }

  function playbackState() {
    return document.body.dataset.page === 'player' ? 'player' : 'browse';
  }

  /* cover 主色：从当前主视觉种子海报降采样（缓存 + 去重，异步不阻塞） */
  function loadCover(seed) {
    if (coverCache[seed]) return Promise.resolve(coverCache[seed]);
    if (coverPending) return coverPending;
    coverPending = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { coverCache[seed] = window.VISUAL.resolver.paletteFromImage(img); coverPending = null; resolve(coverCache[seed]); };
      img.onerror = () => { coverPending = null; resolve(null); };
      img.src = window.PROTO.DATA.poster(seed);
    });
    return coverPending;
  }

  async function refresh() {
    const theme = window.VISUAL.store.getActiveTheme();
    const seed = lastCoverSeed || 'interstellar';
    const cover = coverCache[seed] || null;
    const r = window.VISUAL.resolver.resolve(theme, { cover, state: playbackState() });
    writeVars(r.cssVars);
    window.VISUAL.atmosphere.apply(r.engineParams);
    window.VISUAL.particles.configure(r.engineParams.particles);
    // cover 未就绪 → 立即用 fallback 场景应用，取色完成后重新应用（不阻塞切换）
    if (theme.scene.mode === 'cover' && theme.scene.cover.follow && !cover) {
      loadCover(seed).then((p) => { if (p) refresh(); });
    }
  }

  function setCoverSeed(seed) { lastCoverSeed = seed || lastCoverSeed; }

  window.VISUAL.applier = {
    refresh,
    setCoverSeed,
    init() {
      window.VISUAL.store.on(() => refresh());
      window.VISUAL.atmosphere.init();
      document.body.addEventListener('pagechange', () => refresh());
      refresh();
    },
  };
})();
