/* ============================================================
   visual/atmosphere.js — 氛围层（scene/light/grain/vignette/bloom）
   全部合成层 + screen 混合 → 播放页上视频保持主导（Video First 由合成规则强制）
   ============================================================ */

window.VISUAL = window.VISUAL || {};

(function () {
  let root = null;          // #vs-atmosphere
  let sceneEl = null, lightEl = null, grainEl = null, vigEl = null, bloomEl = null;
  let mouse = { x: -9999, y: -9999 };
  let cur = null;

  function ensure() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'vs-atmosphere';
    root.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;';
    sceneEl = el(root, 'vs-scene');
    lightEl = el(root, 'vs-light');
    for (let i = 0; i < 3; i++) lightEl.appendChild(el(lightEl, 'vs-light-blob'));
    grainEl = el(root, 'vs-grain');
    vigEl = el(root, 'vs-vignette');
    bloomEl = el(root, 'vs-bloom');
    document.body.appendChild(root);
    document.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  }
  function el(parent, cls) {
    const d = document.createElement('div');
    d.className = cls;
    parent.appendChild(d);
    return d;
  }

  /* 场景渐变 + 相机/kenBurns */
  function applyScene(p) {
    sceneEl.style.background = p.scene.css;
    sceneEl.style.opacity = p.scene.opacity;
    sceneEl.style.transition = 'opacity ' + (cur && cur.transition || 400) + 'ms ease';
    const m = p.motion;
    const kb = m && m.enabled ? m.kenBurns : 0;
    sceneEl.style.transform = kb > 0
      ? `scale(${1 + kb * .12})`
      : 'scale(1)';
    sceneEl.style.animation = kb > 0 ? `vs-kb ${18 / Math.max(.05, kb)}s ease-in-out infinite alternate` : 'none';
    // camera 漂移
    const cam = m && m.enabled ? m.camera : 0;
    sceneEl.style.translate = cam > 0 ? `0 0` : '0 0';
  }

  /* 环境光：3 个径向渐变 blob，screen 混合 */
  function applyLight(p) {
    const L = p.light;
    const blobs = lightEl.children;
    if (!L.enabled || L.layers.length === 0) {
      lightEl.style.opacity = 0;
      return;
    }
    lightEl.style.display = 'block';
    lightEl.style.transition = 'opacity 500ms ease';
    lightEl.style.opacity = Math.min(1, L.intensity * 1.15);
    lightEl.style.filter = `saturate(${0.6 + L.saturation * 1.1})`;
    for (let i = 0; i < blobs.length; i++) {
      const lay = L.layers[i];
      if (!lay) { blobs[i].style.opacity = 0; continue; }
      blobs[i].style.cssText = '';
      blobs[i].style.position = 'absolute';
      blobs[i].style.left = lay.x; blobs[i].style.top = lay.y;
      blobs[i].style.width = blobs[i].style.height = lay.size + 'vmax';
      blobs[i].style.transform = 'translate(-50%, -50%)';
      blobs[i].style.background = `radial-gradient(circle, ${lay.color} 0%, transparent 65%)`;
    }
  }

  function applyGrain(p) {
    grainEl.style.opacity = p.grain;
  }
  function applyVignette(p) {
    vigEl.style.opacity = p.vignette;
  }
  function applyBloom(p) {
    bloomEl.style.opacity = p.bloom;
  }

  /* 主题切换过渡期间，根容器淡切 */
  function apply(params) {
    ensure();
    cur = params;
    applyScene(params);
    applyLight(params);
    applyGrain(params);
    applyVignette(params);
    applyBloom(params);
  }

  /* parallax：light 层随鼠标轻微位移（reduced-motion 关闭） */
  function parallaxTick() {
    if (!root || !cur || !cur.motion || !cur.motion.parallax) return;
    const k = cur.motion.parallax * 14;
    const dx = (mouse.x / innerWidth - .5) * k;
    const dy = (mouse.y / innerHeight - .5) * k;
    if (lightEl) lightEl.style.translate = `${dx}px ${dy}px`;
  }

  function initMotion() {
    document.addEventListener('pointermove', parallaxTick, { passive: true });
    // 给 scene 的 kenBurns 动画注册样式
    const st = document.createElement('style');
    st.textContent = '@keyframes vs-kb { from { transform: scale(1); } to { transform: scale(1.1); } }';
    document.head.appendChild(st);
  }

  window.VISUAL.atmosphere = { apply, init: initMotion, ensure, get root() { return root; } };
})();
