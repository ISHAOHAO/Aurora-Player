/* ============================================================
   Aurora Player — Visual System Prototype
   visual/registry.js — 官方主题注册表（7 主题 + Custom）
   每个主题 = 完整视觉状态（scene/lighting/particles/motion/atmosphere/ui/player）
   ============================================================ */

window.VISUAL = window.VISUAL || {};

(function () {

  const builtins = [
    {
      id: 'cinema',
      name: 'Cinema',
      description: '深黑 · 电影镜头 · 微弱暖光 · 克制粒子',
      keywords: 'cinematic / restrained / premium',
      source: 'builtin',
      version: 1,
      scene: { mode: 'gradient', bgOpacity: .92, gradient: { start: '#141419', middle: '#0E0E11', end: '#08080A', angle: 160 }, cover: { follow: false, locked: false, auto: false } },
      lighting: { enabled: true, intensity: .25, blur: 22, spread: .40, saturation: .50, temperature: 1.25 },
      particles: { enabled: true, density: .22, speed: .30, size: .50, opacity: .35, depth: .30, reaction: .30 },
      motion: { enabled: true, camera: .15, parallax: .20, kenBurns: .40, transitionSpeed: 400 },
      atmosphere: { grain: .60, bloom: .10, vignette: .28, aberration: 0 },
      ui: { opacity: .85, glass: .45, blur: 20, border: .09, radius: 10, density: 'comfortable', accent: '#E8A94E' },
      player: { controlOpacity: .72, autoHide: 3, metadata: 'normal', immersive: false },
    },
    {
      id: 'aurora',
      name: 'Aurora',
      description: '冷色环境光 · 青紫极光 · 柔和粒子 · 稍高运动',
      keywords: 'aurora / atmospheric / luminous',
      source: 'builtin',
      version: 1,
      scene: { mode: 'gradient', bgOpacity: .94, gradient: { start: '#0C1320', middle: '#0A0E16', end: '#070A10', angle: 150 }, cover: { follow: true, locked: false, auto: true } },
      lighting: { enabled: true, intensity: .60, blur: 30, spread: .55, saturation: .85, temperature: .75 },
      particles: { enabled: true, density: .50, speed: .50, size: .55, opacity: .50, depth: .60, reaction: .45 },
      motion: { enabled: true, camera: .30, parallax: .40, kenBurns: .60, transitionSpeed: 500 },
      atmosphere: { grain: .35, bloom: .28, vignette: .30, aberration: .15 },
      ui: { opacity: .90, glass: .50, blur: 24, border: .11, radius: 12, density: 'comfortable', accent: '#5FD0F2' },
      player: { controlOpacity: .80, autoHide: 3, metadata: 'normal', immersive: false },
    },
    {
      id: 'noir',
      name: 'Noir',
      description: '黑白电影 · 高级灰阶 · 明显颗粒 · 极少强调',
      keywords: 'noir / editorial / quiet',
      source: 'builtin',
      version: 1,
      scene: { mode: 'solid', solid: '#0F0F0F', bgOpacity: .96, cover: { follow: false, locked: true, auto: false } },
      lighting: { enabled: false, intensity: 0, blur: 12, spread: .3, saturation: 0, temperature: 1 },
      particles: { enabled: true, density: .12, speed: .18, size: .40, opacity: .45, depth: .20, reaction: .15 },
      motion: { enabled: true, camera: .10, parallax: .12, kenBurns: .20, transitionSpeed: 600 },
      atmosphere: { grain: .85, bloom: 0, vignette: .42, aberration: 0 },
      ui: { opacity: .92, glass: .35, blur: 12, border: .07, radius: 4, density: 'compact', accent: '#D9D9D9' },
      player: { controlOpacity: .80, autoHide: 4, metadata: 'minimal', immersive: false },
    },
    {
      id: 'oled',
      name: 'OLED',
      description: '接近纯黑 · 最少常驻亮像素 · 极低氛围',
      keywords: 'black / efficient / pure',
      source: 'builtin',
      version: 1,
      scene: { mode: 'solid', solid: '#000000', bgOpacity: 1, cover: { follow: false, locked: true, auto: false } },
      lighting: { enabled: false, intensity: 0, blur: 8, spread: .2, saturation: 0, temperature: 1 },
      particles: { enabled: false, density: 0, speed: 0, size: 0, opacity: 0, depth: 0, reaction: 0 },
      motion: { enabled: false, camera: 0, parallax: 0, kenBurns: 0, transitionSpeed: 250 },
      atmosphere: { grain: .08, bloom: 0, vignette: .18, aberration: 0 },
      ui: { opacity: .75, glass: .20, blur: 8, border: .05, radius: 6, density: 'comfortable', accent: '#CBD5CE' },
      player: { controlOpacity: .55, autoHide: 2.5, metadata: 'minimal', immersive: false },
    },
    {
      id: 'glass',
      name: 'Glass',
      description: '分层玻璃 · 控制层半透明 · 视频区保持纯净',
      keywords: 'glass / layered / clarity',
      source: 'builtin',
      version: 1,
      scene: { mode: 'gradient', bgOpacity: .90, gradient: { start: '#10121C', middle: '#0C0E15', end: '#080A0F', angle: 160 }, cover: { follow: true, locked: false, auto: true } },
      lighting: { enabled: true, intensity: .35, blur: 32, spread: .50, saturation: .70, temperature: .95 },
      particles: { enabled: true, density: .25, speed: .35, size: .50, opacity: .32, depth: .40, reaction: .30 },
      motion: { enabled: true, camera: .20, parallax: .30, kenBurns: .50, transitionSpeed: 450 },
      atmosphere: { grain: .25, bloom: .22, vignette: .20, aberration: .10 },
      ui: { opacity: 1, glass: .78, blur: 34, border: .18, radius: 14, density: 'comfortable', accent: '#9D8CFF' },
      player: { controlOpacity: .85, autoHide: 3, metadata: 'normal', immersive: false },
    },
    {
      id: 'immersive',
      name: 'Immersive',
      description: '数字剧院 · cover 主色舞台 · 强灯光粒子 · 播放态 UI 退场',
      keywords: 'stage / cinematic / absorbing',
      source: 'builtin',
      version: 1,
      scene: { mode: 'cover', bgOpacity: .84, cover: { follow: true, locked: false, auto: true } },
      lighting: { enabled: true, intensity: .80, blur: 38, spread: .72, saturation: .90, temperature: 1.05 },
      particles: { enabled: true, density: .72, speed: .55, size: .60, opacity: .50, depth: .80, reaction: .70 },
      motion: { enabled: true, camera: .45, parallax: .50, kenBurns: .80, transitionSpeed: 600 },
      atmosphere: { grain: .40, bloom: .35, vignette: .50, aberration: .20 },
      ui: { opacity: .70, glass: .60, blur: 26, border: .12, radius: 12, density: 'comfortable', accent: '#F59E62' },
      player: { controlOpacity: .50, autoHide: 2, metadata: 'minimal', immersive: true },
    },
  ];

  // Custom：以 Cinema 为底的可编辑副本（source: user）
  function makeCustom() {
    const base = builtins[0];
    return JSON.parse(JSON.stringify({
      ...base,
      id: 'custom',
      name: 'Custom',
      description: '我的自定义视觉',
      source: 'user',
      ui: { ...base.ui, accent: '#E8A94E' },
    }));
  }

  window.VISUAL.registry = {
    list() { return builtins.map((t) => ({ id: t.id, name: t.name, description: t.description, keywords: t.keywords, source: t.source })); },
    get(id) { return builtins.find((t) => t.id === id) || null; },
    getFull(id) {
      const t = builtins.find((b) => b.id === id);
      return t ? JSON.parse(JSON.stringify(t)) : null;
    },
    makeCustom,
    defaults: builtins,
  };

  // 主题默认徽标色（VisualConsole 列表用）
  window.VISUAL.themeSwatches = {
    cinema: '#E8A94E', aurora: '#5FD0F2', noir: '#D9D9D9', oled: '#CBD5CE',
    glass: '#9D8CFF', immersive: '#F59E62', custom: '#E8A94E',
  };
})();
