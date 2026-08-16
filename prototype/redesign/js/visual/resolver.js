/* ============================================================
   visual/resolver.js — 主题 → 完整视觉状态
   输出：cssVars（写入 <style data-visual>）+ engineParams（氛围/粒子/运动）
   ============================================================ */

window.VISUAL = window.VISUAL || {};

(function () {

  /* ---------- 颜色工具 ---------- */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  function rgbToHex({ r, g, b }) {
    const p = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + p(r) + p(g) + p(b);
  }
  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > .5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return { h: h * 360, s, l };
  }
  function hslToRgb({ h, s, l }) {
    h /= 360;
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < .5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: r * 255, g: g * 255, b: b * 255 };
  }
  function lighten(hex, f) {
    const hsl = rgbToHsl(hexToRgb(hex));
    hsl.l = Math.min(1, hsl.l + (1 - hsl.l) * f);
    return rgbToHex(hslToRgb(hsl));
  }
  function darken(hex, f) {
    const hsl = rgbToHsl(hexToRgb(hex));
    hsl.l *= (1 - f);
    return rgbToHex(hslToRgb(hsl));
  }
  function rgba(hex, a) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  // 温度：1=中性，>1 暖（琥珀），<1 冷（青）。0..1 之间插值
  function tempColor(base, temperature) {
    const warm = { r: 232, g: 169, b: 78 };
    const cool = { r: 95, g: 160, b: 242 };
    let t = temperature;
    let target;
    if (t >= 1) { t = Math.min(1.5, t); target = warm; const k = (t - 1) / .5; target = { r: 232, g: 169 + (255 - 169) * 0, b: 78 }; return mix(base, target, k * .8); }
    const k = (1 - t) / .75; target = cool;
    return mix(base, target, Math.min(1, k * .8));
    function mix(a, b, k) {
      const A = hexToRgb(a), B = b;
      return rgbToHex({ r: A.r + (B.r - A.r) * k, g: A.g + (B.g - A.g) * k, b: A.b + (B.b - A.b) * k });
    }
  }

  /* ---------- 场景解析 ---------- */
  function sceneBg(theme, cover) {
    const s = theme.scene;
    if (s.mode === 'solid') {
      return { css: `linear-gradient(${s.solid}, ${s.solid})`, base: s.solid };
    }
    if (s.mode === 'cover') {
      if (cover) return { css: `linear-gradient(${cover.angle}deg, ${cover.start}, ${cover.middle || cover.start}, ${cover.end})`, base: cover.end };
      // cover 未就绪：先用中性暗渐变兜底，取色后重刷
      return { css: 'linear-gradient(160deg, #16161C, #0C0C10)', base: '#0C0C10' };
    }
    if (s.mode === 'gradient' && s.gradient) {
      const g = s.gradient;
      return { css: `linear-gradient(${g.angle}deg, ${g.start}, ${g.middle || g.start}, ${g.end})`, base: g.end };
    }
    return { css: 'none', base: '#08080A' };
  }

  /* ---------- 环境光层 ---------- */
  function lightLayers(theme) {
    const L = theme.lighting;
    if (!L.enabled || L.intensity <= 0) return [];
    const cool = tempColor('#3B6EA6', L.temperature);
    const warm = tempColor('#B07B3C', L.temperature);
    const base = rgba(cool, 1);
    return [
      { color: rgba(cool, .55), x: '82%', y: '8%', size: 52 + L.spread * 30 },
      { color: rgba(warm, .40), x: '8%', y: '92%', size: 46 + L.spread * 26 },
      { color: rgba(cool, .28), x: '55%', y: '45%', size: 34 + L.spread * 22 },
    ];
  }

  /* ---------- 主解析入口 ---------- */
  function resolve(theme, ctx = {}) {
    const { cover = null, state = 'browse' } = ctx;
    const sc = sceneBg(theme, cover);
    const isDark = (() => { const { r, g, b } = hexToRgb(sc.base); return (r * .3 + g * .6 + b * .1) < 140; })();
    const txt = isDark ? '#F2F0EA' : '#161512';
    const ui = theme.ui;
    const glassAlpha = Math.max(.16, .80 - ui.glass * .55);
    const density = { compact: .82, comfortable: 1, spacious: 1.28 }[ui.density] || 1;
    const metadataOpacity = { minimal: .5, normal: .72, technical: 1 }[theme.player.metadata] || .72;

    const cssVars = {
      '--vs-bg': sc.base,
      '--vs-bg2': darken(sc.base, .14),
      '--vs-surface': lighten(sc.base, .06),
      '--vs-surface2': lighten(sc.base, .11),
      '--vs-surface3': lighten(sc.base, .17),
      '--vs-line': rgba(txt, .09),
      '--vs-line-strong': rgba(txt, .20),
      '--vs-text': txt,
      '--vs-text2': rgba(txt, .68),
      '--vs-text3': rgba(txt, .42),
      '--vs-accent': ui.accent,
      '--vs-accent-dim': rgba(ui.accent, .12),
      '--vs-accent-border': rgba(ui.accent, .45),
      '--vs-danger': '#FF5A4E',
      '--vs-ok': ui.accent,
      '--vs-r-sm': Math.max(2, Math.round(ui.radius * .45)) + 'px',
      '--vs-r-md': Math.max(3, Math.round(ui.radius * .8)) + 'px',
      '--vs-glass-alpha': glassAlpha,
      '--vs-glass-blur': Math.max(4, Math.round(ui.blur)) + 'px',
      '--vs-glass-border': rgba(txt, ui.border),
      '--vs-glass-bg': rgba(sc.base, glassAlpha),
      '--vs-chrome-opacity': ui.opacity,
      '--vs-player-opacity': theme.player.controlOpacity,
      '--vs-metadata-opacity': metadataOpacity,
      '--vs-density': density,
      '--vs-transition': Math.round(theme.motion.transitionSpeed) + 'ms',
    };

    // 运动预算按状态分级（Immersive 才启用 camera/kenBurns/parallax）
    const fullMotion = theme.motion.enabled && state === 'player';
    const engineParams = {
      scene: { css: sc.css, opacity: Math.min(.9, theme.scene.bgOpacity) },
      light: { layers: lightLayers(theme), enabled: theme.lighting.enabled && theme.lighting.intensity > 0, intensity: theme.lighting.intensity, saturation: theme.lighting.saturation },
      grain: theme.atmosphere.grain,
      vignette: state === 'player' ? theme.atmosphere.vignette : Math.min(.2, theme.atmosphere.vignette),
      bloom: state === 'player' ? theme.atmosphere.bloom : 0,
      particles: theme.particles,
      motion: { enabled: fullMotion, camera: theme.motion.camera, kenBurns: theme.motion.kenBurns, parallax: state === 'player' ? theme.motion.parallax : 0 },
    };

    return { cssVars, engineParams };
  }

  window.VISUAL.resolver = {
    resolve,
    lighten, darken, rgba, tempColor,
    sceneBg,
    paletteFromImage: (img) => {
      // 32×32 降采样 → 3 段主色（暗色化，限制亮度/饱和）
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 32;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, 32, 32);
        const d = g.getImageData(0, 0, 32, 32).data;
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = d[i] * .3 + d[i + 1] * .6 + d[i + 2] * .1;
          if (l < 235) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
        }
        if (!n) return null;
        const mid = { r: sr / n, g: sg / n, b: sb / n };
        const midHex = rgbToHex(mid);
        const dark = darken(midHex, .55);
        const deeper = darken(midHex, .72);
        return { start: lighten(dark, .25), middle: dark, end: deeper, angle: 160, mid: midHex };
      } catch { return null; }
    },
  };
})();
