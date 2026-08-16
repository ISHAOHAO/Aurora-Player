/* ============================================================
   visual/console.js — Visual Console（右缘贴边滑出，实时调参）
   结构：Preset / 外观 / 氛围 / 粒子 / 运动 / 播放器 / 高级
   ============================================================ */

window.VISUAL = window.VISUAL || {};

(function () {
  const store = () => window.VISUAL.store;
  const resolver = () => window.VISUAL.resolver;

  let open = false;
  let tab = 'preset';
  let dragging = false;
  let el = null, btn = null;

  /* ---------- 参数描述 ---------- */
  const segOpts = {
    'scene.mode': [['solid', '纯色'], ['gradient', '渐变'], ['cover', '封面']],
    'ui.density': [['compact', '紧凑'], ['comfortable', '舒适'], ['spacious', '宽舒']],
    'player.metadata': [['minimal', '极简'], ['normal', '常规'], ['technical', '技术']],
    'advanced.motionCurve': [['linear', 'linear'], ['ease', 'ease'], ['cinematic', 'cinematic']],
    'advanced.performance': [['balanced', '平衡'], ['high', '高画质'], ['eco', '节能']],
  };
  const GROUPS = [
    { id: 'preset', label: 'Preset' },
    { id: 'appearance', label: '外观' },
    { id: 'atmosphere', label: '氛围' },
    { id: 'particles', label: '粒子' },
    { id: 'motion', label: '运动' },
    { id: 'player', label: '播放器' },
    { id: 'advanced', label: '高级' },
  ];
  const SLIDERS = {
    appearance: [
      { path: 'scene.bgOpacity', label: '背景不透明度', min: .1, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'scene.gradient.angle', label: '渐变角度', min: 0, max: 360, step: 5, fmt: (v) => Math.round(v) + '°' },
      { path: 'ui.opacity', label: '界面透明度', min: .3, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'ui.glass', label: '玻璃量', min: .05, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'ui.blur', label: '玻璃模糊', min: 0, max: 48, step: 1, fmt: (v) => Math.round(v) + 'px' },
      { path: 'ui.radius', label: '圆角', min: 0, max: 20, step: 1, fmt: (v) => Math.round(v) + 'px' },
      { path: 'ui.border', label: '边框', min: 0, max: .35, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
    ],
    atmosphere: [
      { path: 'lighting.intensity', label: '光照强度', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'lighting.blur', label: '光照扩散', min: 0, max: 60, step: 1, fmt: (v) => Math.round(v) + 'px' },
      { path: 'lighting.spread', label: '光照范围', min: .1, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'lighting.saturation', label: '光饱和', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'lighting.temperature', label: '色温', min: .4, max: 1.6, step: .02, fmt: (v) => v.toFixed(2) },
      { path: 'atmosphere.grain', label: '胶片颗粒', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'atmosphere.bloom', label: '泛光', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'atmosphere.vignette', label: '暗角', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'atmosphere.aberration', label: '色差', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
    ],
    particles: [
      { path: 'particles.density', label: '密度', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'particles.speed', label: '速度', min: 0, max: 1.2, step: .02, fmt: (v) => v.toFixed(2) },
      { path: 'particles.size', label: '大小', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'particles.opacity', label: '不透明度', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'particles.depth', label: '景深', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'particles.reaction', label: '避让反应', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
    ],
    motion: [
      { path: 'motion.camera', label: '运镜', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'motion.parallax', label: '视差', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'motion.kenBurns', label: 'Ken Burns', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'motion.transitionSpeed', label: '过渡时长', min: 120, max: 800, step: 20, fmt: (v) => Math.round(v) + 'ms' },
    ],
    player: [
      { path: 'player.controlOpacity', label: '控制层透明度', min: .2, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'player.autoHide', label: '自动隐藏', min: 1, max: 8, step: .5, fmt: (v) => v.toFixed(1) + 's' },
    ],
    advanced: [
      { path: 'advanced.particleDepth', label: '粒子景深深度', min: 0, max: 2, step: .05, fmt: (v) => v.toFixed(2) },
      { path: 'advanced.lightFalloff', label: '光照衰减', min: 0, max: 1, step: .01, fmt: (v) => Math.round(v * 100) + '%' },
      { path: 'advanced.bloomSamples', label: '泛光采样', min: 2, max: 8, step: 1, fmt: (v) => Math.round(v) },
    ],
  };
  const SWITCHES = {
    atmosphere: [['lighting.enabled', '环境光'], ['atmosphere.aberration', '色差（实验）']],
    particles: [['particles.enabled', '粒子']],
    motion: [['motion.enabled', '运动']],
    player: [['player.immersive', 'Immersive 默认']],
    advanced: [['advanced.extremeOpacity', '极端透明度']],
  };

  function valueOf(path) {
    const t = store().themeOf(store().activeId);
    const seg = path.split('.');
    let o = t;
    for (const s of seg) o = o ? o[s] : undefined;
    return o;
  }

  /* ---------- 构建 ---------- */
  function ensure() {
    if (el) return;
    btn = document.createElement('button');
    btn.id = 'vs-console-btn';
    btn.title = 'Visual Console（V）';
    btn.textContent = '◈ 视觉';
    btn.addEventListener('click', toggle);
    document.body.appendChild(btn);

    el = document.createElement('div');
    el.id = 'vs-console';
    document.body.appendChild(el);
    render();
  }

  function toggle() { open = !open; document.body.classList.toggle('vs-console-open', open); render(); }
  function setTab(t) { tab = t; render(); }

  function render() {
    if (!el) return;
    el.innerHTML = `
      <div class="vc-head">
        <span class="vc-title">Visual Console</span>
        <span class="vc-active">${esc(store().getActiveMeta().name)}</span>
        <button class="vc-x" data-act="vc-close" title="关闭">✕</button>
      </div>
      <div class="vc-tabs">
        ${GROUPS.map((g) => `<button class="${tab === g.id ? 'on' : ''}" data-tab="${g.id}">${g.label}</button>`).join('')}
      </div>
      <div class="vc-body">
        ${tab === 'preset' ? presetPane() : paramsPane()}
      </div>
      <div class="vc-foot">
        <span class="vc-hint">改动实时生效 · 编辑官方主题自动生成 Custom Copy</span>
      </div>`;
  }

  function presetPane() {
    const list = store().listPresets();
    const active = store().activeId;
    const isUser = store().getActiveMeta().source === 'user';
    return `
      <div class="vc-presets">
        ${list.map((p) => `
          <button class="vc-preset ${p.id === active ? 'on' : ''}" data-act="apply" data-id="${p.id}">
            <i class="sw" style="background:${window.VISUAL.themeSwatches[p.id] || '#888'}"></i>
            <span class="nm">${esc(p.name)}</span>
            <span class="tag">${p.source === 'builtin' ? '官方' : '我的'}</span>
          </button>`).join('')}
      </div>
      <div class="vc-actions">
        <button data-act="vc-save">保存</button>
        <button data-act="vc-saveas">另存为…</button>
        <button data-act="vc-rename">重命名</button>
        <button data-act="vc-dupe">复制</button>
        ${isUser ? '<button data-act="vc-del">删除</button>' : ''}
        <button data-act="vc-reset">重置</button>
        <button data-act="vc-export">导出</button>
        <button data-act="vc-import">导入</button>
      </div>
      <input type="file" id="vc-import-file" accept=".json" hidden>`;
  }

  function paramsPane() {
    let html = '';
    if (SWITCHES[tab]) {
      html += '<div class="vc-rows">' + SWITCHES[tab].map(([path, label]) => `
        <div class="vc-row switch-row">
          <span>${label}</span>
          <button class="vc-switch ${valueOf(path) ? 'on' : ''}" data-switch="${path}"></button>
        </div>`).join('') + '</div>';
    }
    if (tab === 'appearance') {
      const acc = valueOf('ui.accent');
      html += '<div class="vc-rows">'
        + segRow('scene.mode', '背景模式')
        + `<div class="vc-row"><span>强调色</span><input type="color" value="${acc}" data-color="ui.accent"></div>`
        + '</div>';
    }
    if (tab === 'player') {
      html += '<div class="vc-rows">' + segRow('player.metadata', '元数据密度') + '</div>';
    }
    if (tab === 'advanced') {
      html += '<div class="vc-rows">' + segRow('advanced.motionCurve', '运动曲线') + segRow('advanced.performance', '性能档') + '</div>';
    }
    if (tab === 'appearance') html += '<div class="vc-rows">' + segRow('ui.density', '密度') + '</div>';
    const sliders = SLIDERS[tab];
    if (sliders) {
      html += '<div class="vc-rows">' + sliders.map(sliderHTML).join('') + '</div>';
    }
    if (tab === 'advanced') {
      html += '<div class="vc-note">高级参数用于实验与性能档位，不影响默认体验。`extremeOpacity` 会允许超出常规透明度范围。</div>';
    }
    return html;
  }

  function sliderHTML(d) {
    const v = valueOf(d.path);
    const vv = v == null ? d.min : v;
    return `
      <div class="vc-row">
        <span>${d.label}</span>
        <div class="vc-slider">
          <input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${vv}" data-param="${d.path}">
          <span class="vc-val">${d.fmt(vv)}</span>
        </div>
      </div>`;
  }
  function segRow(path, label) {
    const cur = valueOf(path);
    return `<div class="vc-row">
      <span>${label}</span>
      <div class="vc-seg">${(segOpts[path] || []).map(([v, l]) =>
        `<button class="${String(cur) === String(v) ? 'on' : ''}" data-seg="${path}" data-v="${v}">${l}</button>`).join('')}</div>
    </div>`;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------- 事件 ---------- */
  function bind() {
    document.body.addEventListener('click', (e) => {
      const t = e.target.closest('#vs-console [data-act], #vs-console [data-seg], #vs-console [data-switch], #vs-console [data-tab]');
      if (!t) return;
      if (t.dataset.tab) { setTab(t.dataset.tab); return; }
      if (t.dataset.act) {
        const a = t.dataset.act;
        switch (a) {
          case 'vc-close': open = false; document.body.classList.remove('vs-console-open'); render(); break;
          case 'apply': store().apply(t.dataset.id); toast('已应用主题：' + store().getActiveMeta().name); render(); break;
          case 'vc-save': toast('已保存到当前预设'); store().notifyNow && store().notifyNow(); break;
          case 'vc-saveas': promptSaveAs(); break;
          case 'vc-rename': promptRename(); break;
          case 'vc-dupe': { const id = store().duplicatePreset(store().activeId); store().apply(id); toast('已复制'); render(); break; }
          case 'vc-del': { store().removePreset(store().activeId); toast('已删除'); render(); break; }
          case 'vc-reset': store().resetActive(); toast('已重置为 Cinema'); render(); break;
          case 'vc-export': store().exportPreset(store().activeId); toast('已导出'); break;
          case 'vc-import': el.querySelector('#vc-import-file').click(); break;
        }
        return;
      }
      if (t.dataset.seg) {
        dragging = true;
        store().setParam(t.dataset.seg, t.dataset.v);
        dragging = false;
        render();
        return;
      }
      if (t.dataset.switch) {
        dragging = true;
        store().setParam(t.dataset.switch, !valueOf(t.dataset.switch));
        dragging = false;
        render();
      }
    });

    document.body.addEventListener('input', (e) => {
      const t = e.target;
      if (!t.closest('#vs-console')) return;
      if (t.dataset.param) {
        dragging = true;
        const v = parseFloat(t.value);
        store().setParam(t.dataset.param, v);
        const d = SLIDERS[tab].find((x) => x.path === t.dataset.param);
        const val = t.parentElement.querySelector('.vc-val');
        if (val && d) val.textContent = d.fmt(v);
        dragging = false;
      }
      if (t.dataset.color) {
        dragging = true;
        store().setParam(t.dataset.color, t.value);
        dragging = false;
      }
    });

    const fileEl = () => (el ? el.querySelector('#vc-import-file') : null);
    if (el) el.addEventListener('change', async (e) => {
      if (e.target.id === 'vc-import-file' && e.target.files[0]) {
        const r = await store().importPreset(e.target.files[0]);
        toast(r.ok ? '已导入：' + r.name : '导入失败：' + r.error);
        e.target.value = '';
        render();
      }
    });

    // 快捷键 V
    document.addEventListener('keydown', (e) => {
      const act = document.activeElement;
      if (act && (act.tagName === 'INPUT' || act.tagName === 'TEXTAREA')) return;
      if (e.key === 'v' || e.key === 'V') toggle();
    });
  }

  function promptSaveAs() {
    const name = prompt('预设名称', store().getActiveMeta().name + ' · 我的');
    if (name && name.trim()) { store().saveAs(name.trim()); toast('已另存为：' + name.trim()); render(); }
  }
  function promptRename() {
    const cur = store().getActiveMeta();
    const name = prompt('重命名', cur.name);
    if (name && name.trim() && cur.source === 'user') { store().renamePreset(cur.id, name.trim()); toast('已重命名'); render(); }
    else if (name && name.trim() && cur.source === 'builtin') { const id = store().saveAs(name.trim()); toast('已保存为新预设'); render(); }
  }

  function toast(msg) { window.VISUAL.toast(msg); }

  window.VISUAL.console = {
    ensure, open: () => { open = true; document.body.classList.add('vs-console-open'); ensure(); render(); },
    close: () => { open = false; document.body.classList.remove('vs-console-open'); render(); },
    get isOpen() { return open; },
    bind,
  };
})();
