/* ============================================================
   visual/particles.js — Canvas 粒子引擎（对象池，rAF）
   reaction：粒子对指针/画面中心产生避让（沉浸演示用指针，真实接入视频亮度）
   ============================================================ */

window.VISUAL = window.VISUAL || {};

(function () {
  let canvas = null, ctx = null, ps = [];
  let cfg = { enabled: true, density: .3, speed: .4, size: .5, opacity: .4, depth: .5, reaction: .3 };
  let running = false, rafId = 0, last = 0, cursor = { x: -9999, y: -9999 };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ensure() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'vs-particles';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:1;pointer-events:none;mix-blend-mode:screen;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    document.addEventListener('pointermove', (e) => { cursor.x = e.clientX; cursor.y = e.clientY; }, { passive: true });
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn() {
    const area = innerWidth * innerHeight;
    const target = Math.round(area / 9000 * cfg.density * 220);   // 1500×920 满密 ≈ 140
    const cap = 420;
    const n = Math.max(0, Math.min(target, cap));
    while (ps.length < n) ps.push(newP());
    if (ps.length > n) ps.length = n;
  }

  function newP() {
    const depth = cfg.depth > 0 ? .5 + Math.random() * cfg.depth : .7;   // 0..1.5 景深因子
    return {
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      size: (.6 + Math.random() * 1.6) * cfg.size * (.7 + depth * .4),
      vx: (Math.random() - .5) * cfg.speed * (2 + depth * 2.2),
      vy: (Math.random() - .5) * cfg.speed * (1.6 + depth * 1.8),
      a: (.2 + Math.random() * .8) * cfg.opacity,
      tw: Math.random() * Math.PI * 2,
      depth,
    };
  }

  function tick(t) {
    rafId = requestAnimationFrame(tick);
    if (!running) return;
    const dt = Math.min(40, t - last || 16); last = t;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const r = 90 + cfg.reaction * 220;
    const useReact = cfg.reaction > 0;
    const cx = innerWidth / 2, cy = innerHeight / 2;
    for (const p of ps) {
      p.tw += dt * .001;
      // 漂移
      p.x += p.vx * dt * .03;
      p.y += p.vy * dt * .03;
      // 指针 / 中心避让（reaction）
      if (useReact) {
        const near = (cursor.x > -1000 && cursor.y > -1000) ? cursor : { x: cx, y: cy };
        const dx = p.x - near.x, dy = p.y - near.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / r) * .8 * cfg.reaction;
          p.x += (dx / d) * f * 3;
          p.y += (dy / d) * f * 3;
        }
      }
      // 环绕
      if (p.x < -10) p.x = innerWidth + 10; if (p.x > innerWidth + 10) p.x = -10;
      if (p.y < -10) p.y = innerHeight + 10; if (p.y > innerHeight + 10) p.y = -10;
      const alpha = p.a * (0.75 + Math.sin(p.tw) * .25);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(.4, p.size), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
      ctx.fill();
    }
  }

  function configure(params) {
    cfg = params || cfg;
    ensure();
    resize();
    spawn();
    if (!running && cfg.enabled && !reduce) start();
    if (reduce || !cfg.enabled) stop(true);
  }
  function start() {
    if (running) return;
    running = true; last = 0;
    rafId = requestAnimationFrame(tick);
  }
  function stop(clear) {
    running = false;
    cancelAnimationFrame(rafId);
    if (clear && ctx) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  window.addEventListener('resize', () => { if (canvas) { resize(); spawn(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (cfg.enabled && !reduce) start();
  });

  window.VISUAL.particles = { configure, start, stop, get canvas() { return canvas; } };
})();
