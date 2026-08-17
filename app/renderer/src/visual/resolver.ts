/**
 * visual/resolver.ts — ThemeResolver
 * 主题 → 完整视觉状态。Appearance(Light/Dark) 是独立维度（修正：问题 1）：
 *
 *   VisualTheme → AppearanceAdapter → ResolvedTheme
 *   Theme = 意图（暖/冷/氛围/密度…），Appearance 决定最终 tokens。
 *
 * 三类强度严格独立（修正 2）：Scene / Atmosphere / UI 互不写入。
 * Video First 运行时强制（修正 1）：bgOpacity 受 STATE_BUDGETS 硬上限。
 */
import type {
  Appearance, EngineParams, PaletteColors, ResolvedTheme, RouteState, StateBudget, VisualTheme,
} from './types';
import { STATE_BUDGETS } from './types';

/* ---------- 颜色工具 ---------- */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function rgbToHex(c: { r: number; g: number; b: number }): string {
  const p = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${p(c.r)}${p(c.g)}${p(c.b)}`;
}
function lighten(hex: string, f: number): string {
  const c = hexToRgb(hex);
  return rgbToHex({ r: c.r + (255 - c.r) * f, g: c.g + (255 - c.g) * f, b: c.b + (255 - c.b) * f });
}
function darken(hex: string, f: number): string {
  const c = hexToRgb(hex);
  return rgbToHex({ r: c.r * (1 - f), g: c.g * (1 - f), b: c.b * (1 - f) });
}
function rgba(hex: string, a: number): string {
  const c = hexToRgb(hex);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}
function temperatureColor(base: string, temperature: number): string {
  const b = hexToRgb(base);
  if (temperature >= 1) {
    const k = Math.min(1, (temperature - 1) / 0.5) * 0.7;
    return rgbToHex({ r: b.r + (255 - b.r) * k * 0.25, g: b.g + (255 - b.g) * k * 0.06, b: b.b - b.b * k * 0.35 });
  }
  const k = Math.min(1, (1 - temperature) / 0.75) * 0.7;
  return rgbToHex({ r: b.r - b.r * k * 0.45, g: b.g + (255 - b.g) * k * 0.08, b: b.b + (255 - b.b) * k * 0.45 });
}
function isLight(hex: string): boolean {
  const c = hexToRgb(hex);
  return (c.r * 0.3 + c.g * 0.6 + c.b * 0.1) >= 140;
}

/* ---------- 调色板（Appearance Adapter） ---------- */
interface Palette {
  base: string; surface: string; surface2: string; surface3: string;
  text: string; accent: string; line: string; lineStrong: string;
}

/** 场景：dark 用主题本体；light 用主题浅色意图（缺失则算法派生中性浅色） */
function sceneOf(theme: VisualTheme, cover: PaletteColors | null, appearance: Appearance): { css: string; base: string } {
  const s = theme.scene;
  const L = theme.appearance?.light;
  if (appearance === 'light') {
    const ivory = L?.base ?? L?.scene?.end ?? '#F1EDE6';
    if (L?.scene) {
      const g = L.scene;
      return { css: `linear-gradient(${g.angle}deg, ${g.start}, ${g.middle ?? g.start}, ${g.end})`, base: g.end };
    }
    if (s.mode === 'cover' && cover) {
      return { css: `linear-gradient(${cover.angle}deg, ${lighten(cover.start, 0.55)}, ${lighten(cover.middle, 0.55)}, ${lighten(cover.end, 0.55)})`, base: lighten(cover.end, 0.55) };
    }
    return { css: `linear-gradient(165deg, ${ivory}, ${lighten(ivory, 0.05)})`, base: ivory };
  }
  // dark
  if (s.mode === 'solid' && s.solid) return { css: `linear-gradient(${s.solid}, ${s.solid})`, base: s.solid };
  if (s.mode === 'fluid' || s.mode === 'wallpaper') {
    return { css: 'linear-gradient(160deg, #0C121B, #0A0F18 55%, #080C14)', base: '#0C121B' };
  }
  if (s.mode === 'cover') {
    if (cover) return { css: `linear-gradient(${cover.angle}deg, ${cover.start}, ${cover.middle}, ${cover.end})`, base: cover.end };
    return { css: 'linear-gradient(160deg, #16161C, #0C0C10)', base: '#0C0C10' };
  }
  if (s.mode === 'gradient' && s.gradient) {
    const g = s.gradient;
    return { css: `linear-gradient(${g.angle}deg, ${g.start}, ${g.middle ?? g.start}, ${g.end})`, base: g.end };
  }
  return { css: 'none', base: '#08080A' };
}

function paletteFor(theme: VisualTheme, cover: PaletteColors | null, appearance: Appearance): Palette {
  const sc = sceneOf(theme, cover, appearance);
  const L = theme.appearance?.light;
  if (appearance === 'light') {
    const base = L?.base ?? L?.scene?.end ?? '#F1EDE6';
    const surface = L?.surface ?? lighten(base, 0.02);
    const surface2 = L?.surface2 ?? darken(base, 0.05);
    const text = L?.text ?? '#1F1B16';
    const accent = L?.accent ?? theme.ui.accent;
    return {
      base, surface, surface2, surface3: darken(base, 0.09),
      text, accent,
      line: rgba(text, 0.1), lineStrong: rgba(text, 0.24),
    };
  }
  const base = sc.base;
  const text = isLight(base) ? '#161512' : '#F2F0EA';
  return {
    base,
    surface: lighten(base, 0.06),
    surface2: lighten(base, 0.11),
    surface3: lighten(base, 0.17),
    text, accent: theme.ui.accent,
    line: rgba(text, 0.09), lineStrong: rgba(text, 0.2),
  };
}

/* ---------- 环境光 ---------- */
function lightLayers(theme: VisualTheme, cover: PaletteColors | null, appearance: Appearance): { color: string; x: string; y: string; size: number }[] {
  const L = theme.lighting;
  if (!L.enabled || L.intensity <= 0) return [];
  const base = (cover && theme.scene.cover.follow) ? cover.mid : (appearance === 'light' ? '#7E93B8' : '#3B6EA6');
  const cool = temperatureColor(base, L.temperature);
  const warm = temperatureColor(base, L.temperature > 1 ? L.temperature * 0.6 : L.temperature * 1.4);
  // 环境光只落在画面边角（舞台光），绝不置于画面中心 —— Video First 黑场保护
  return [
    { color: rgba(cool, 0.42), x: '86%', y: '5%', size: 46 + L.spread * 26 },
    { color: rgba(warm, 0.34), x: '4%', y: '94%', size: 40 + L.spread * 22 },
    { color: rgba(cool, 0.20), x: '88%', y: '92%', size: 32 + L.spread * 18 },
  ];
}

/* ---------- 设计签名 → 具体视觉语言（Theme Differentiation） ---------- */
interface TypeFace { display: string; ui: string; mono: string; headingWeight: number; headingSpacing: string; }
const TYPEFACES: Record<string, TypeFace> = {
  'editorial-sans': { display: '"Segoe UI Variable Display","Segoe UI",sans-serif', ui: '"Segoe UI Variable Text","Segoe UI",sans-serif', mono: '"Cascadia Mono",Consolas,monospace', headingWeight: 600, headingSpacing: '-0.01em' },
  serif: { display: 'Georgia,"Times New Roman",serif', ui: '"Segoe UI",sans-serif', mono: '"Cascadia Mono",Consolas,monospace', headingWeight: 500, headingSpacing: '0' },
  geometric: { display: '"Segoe UI Variable Display","Segoe UI",sans-serif', ui: '"Segoe UI",sans-serif', mono: 'Consolas,monospace', headingWeight: 600, headingSpacing: '0.01em' },
  technical: { display: '"Segoe UI",sans-serif', ui: '"Segoe UI",sans-serif', mono: 'Consolas,monospace', headingWeight: 600, headingSpacing: '0.02em' },
  cinematic: { display: '"Segoe UI Variable Display","Segoe UI",sans-serif', ui: '"Segoe UI",sans-serif', mono: '"Cascadia Mono",Consolas,monospace', headingWeight: 600, headingSpacing: '-0.02em' },
  clean: { display: '"Segoe UI Variable Display","Segoe UI",sans-serif', ui: '"Segoe UI",sans-serif', mono: 'Consolas,monospace', headingWeight: 600, headingSpacing: '-0.01em' },
};
function shadowFor(surface: string, isLight: boolean): { shadow: string; glow: string; inset: string } {
  const s = isLight ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.4)';
  switch (surface) {
    case 'paper': case 'flat': return { shadow: 'none', glow: 'none', inset: isLight ? 'inset 0 0 0 1px rgba(0,0,0,0.06)' : 'inset 0 0 0 1px rgba(255,255,255,0.05)' };
    case 'glass': return { shadow: `0 16px 44px ${s}`, glow: 'none', inset: 'inset 0 0 0 1px var(--vs-glass-border)' };
    case 'luminous': return { shadow: `0 10px 30px ${s}`, glow: `0 0 26px var(--vs-accent-dim)`, inset: 'none' };
    case 'atmospheric': return { shadow: `0 18px 50px ${s}`, glow: `0 0 30px var(--vs-accent-dim)`, inset: 'none' };
    default: return { shadow: `0 8px 24px ${s}`, glow: 'none', inset: 'none' };
  }
}

/* ---------- 主解析 ---------- */
export interface ResolveContext {
  cover?: PaletteColors | null;
  state: RouteState;
  appearance: Appearance;
}

export function resolve(theme: VisualTheme, ctx: ResolveContext): ResolvedTheme {
  const budget: StateBudget = STATE_BUDGETS[ctx.state];
  // OLED（darkOnly）在任何 appearance 下强制暗色
  const appearance: Appearance = theme.appearance?.darkOnly ? 'dark' : ctx.appearance;
  const isLight = appearance === 'light';
  const L = theme.appearance?.light;
  const sc = sceneOf(theme, ctx.cover ?? null, appearance);
  const pal = paletteFor(theme, ctx.cover ?? null, appearance);
  const ui = theme.ui;
  const onPlayer = ctx.state === 'playback' || ctx.state === 'immersive';

  // Video First 硬上限：浅色下 scene 透明度额外收敛（不洗亮视频暗场）
  const bgScale = isLight ? (L?.bgOpacity ?? 0.5) : 1;
  const budgetOpacity = Math.min(theme.scene.bgOpacity * bgScale, budget.bgOpacityMax);
  // 透明窗架构：mpv 视频是原生子窗口，DOM blend 无法看到它（backdrop=透明）。
  // 因此播放页 scene 层会真实地盖在视频上 —— 必须压到“低语”级别，绝不能洗暗视频。
  const effectiveOpacity = onPlayer ? budgetOpacity * 0.2 : budgetOpacity;

  // 三类强度
  const glassAlpha = isLight
    ? Math.max(0.55, 0.90 - ui.glass * 0.22)          // 浅色需更实，保证可读
    : Math.max(0.16, 0.80 - ui.glass * 0.55);
  const chromeOpacity = Math.max(0.3, Math.min(1, ui.opacity));
  const density = { compact: 0.82, comfortable: 1, spacious: 1.28 }[ui.density] ?? 1;
  const metadataOpacity = { minimal: 0.5, normal: 0.72, technical: 1 }[theme.player.metadata] ?? 0.72;
  const radiusSm = `${Math.max(2, Math.round(ui.radius * 0.45))}px`;
  const radiusMd = `${Math.max(3, Math.round(ui.radius * 0.8))}px`;

  const grain = ctx.state === 'settings'
    ? Math.min(0.2, theme.atmosphere.grain)
    : isLight ? (L?.grain ?? theme.atmosphere.grain * 0.8) : theme.atmosphere.grain;
  const vignette = budget.allowVignette ? (isLight ? (L?.vignette ?? theme.atmosphere.vignette * 0.7) : theme.atmosphere.vignette) : 0;
  const bloom = budget.allowBloom ? theme.atmosphere.bloom : 0;
  const particlesEnabled = theme.particles.enabled && budget.particleCap > 0;
  const particleDensity = theme.particles.density * budget.particleBudget;
  const lightingIntensity = Math.min(1, theme.lighting.intensity * (isLight ? (L?.lightingIntensity ?? 0.6) : 1));

  const text = pal.text;
  const accent = pal.accent;
  const accentDim = rgba(accent, 0.12);
  const accentBorder = rgba(accent, 0.45);

  // 设计签名 → 字体 / 表面语言 / 标题字重
  const sig = theme.signature;
  const faces = TYPEFACES[sig?.typography ?? 'editorial-sans'] ?? TYPEFACES['editorial-sans'];
  const surf = shadowFor(sig?.surface ?? 'matte', isLight);

  const cssVars: Record<string, string> = {
    // —— 现有令牌 ——
    '--bg-base': pal.base,
    '--bg-elevated': pal.surface,
    '--surface-1': pal.surface,
    '--surface-2': pal.surface2,
    '--surface-hover': pal.surface3,
    '--hairline': pal.line,
    '--text-primary': text,
    '--text-secondary': rgba(text, 0.68),
    '--text-muted': rgba(text, 0.45),
    '--accent': accent,
    '--danger': isLight ? '#C0392B' : '#E5484D',
    '--glass-1': rgba(pal.base, glassAlpha),
    '--glass-2': rgba(pal.base, glassAlpha + 0.08),
    '--glass-3': rgba(pal.base, glassAlpha + 0.16),
    '--glass-border': isLight ? rgba(text, 0.14) : rgba(text, 0.09),
    '--btn-primary-bg': text,
    '--btn-primary-fg': pal.base,
    '--ambient-1': rgba(temperatureColor('#8896C2', theme.lighting.temperature), Math.min(0.16, lightingIntensity * 0.2 + 0.03)),
    '--ambient-2': rgba(temperatureColor('#B08A5A', theme.lighting.temperature), Math.min(0.11, lightingIntensity * 0.14 + 0.02)),
    '--stage-top': pal.surface,
    '--grain-opacity': String(Math.min(0.05, grain * 0.05)),
    '--radius-ctrl': radiusSm,
    '--radius-card': radiusMd,
    '--radius-panel': radiusMd,
    '--ov-text': text,
    '--ov-text-2': rgba(text, 0.65),
    '--ov-icon': rgba(text, 0.75),
    '--ov-dim': rgba(text, 0.45),
    '--ov-track': rgba(text, 0.18),
    '--ov-fill': rgba(text, 0.85),
    '--ov-knob': text,
    '--ov-btn-bg': rgba(text, 0.12),
    '--ov-btn-border': rgba(text, 0.18),
    '--ov-btn-hover': rgba(text, 0.2),
    '--ov-hover-bg': rgba(text, 0.1),
    '--ov-sep': rgba(text, 0.1),
    '--ov-topgrad': rgba('#000000', 0.65),
    '--cv-hi': isLight ? '84%' : '18%',
    '--cv-lo': isLight ? '68%' : '6%',
    '--cv-ext': rgba(text, 0.6),
    '--cv-track': rgba(text, 0.15),
    '--cv-fname': text,
    '--particle': rgba(text, 0.5),

    // —— --vs-* 命名空间 ——
    '--vs-bg': pal.base,
    '--vs-bg2': isLight ? darken(pal.base, 0.06) : darken(pal.base, 0.14),
    '--vs-surface': pal.surface,
    '--vs-surface2': pal.surface2,
    '--vs-surface3': pal.surface3,
    '--vs-line': pal.line,
    '--vs-line-strong': pal.lineStrong,
    '--vs-text': text,
    '--vs-text2': rgba(text, 0.68),
    '--vs-text3': rgba(text, 0.42),
    '--vs-accent': accent,
    '--vs-accent-dim': accentDim,
    '--vs-accent-border': accentBorder,
    '--vs-danger': isLight ? '#C0392B' : '#FF5A4E',
    '--vs-ok': accent,
    '--vs-r-sm': radiusSm,
    '--vs-r-md': radiusMd,
    '--vs-glass-bg': rgba(pal.base, glassAlpha),
    '--vs-glass-blur': `${Math.max(4, Math.round(ui.blur))}px`,
    '--vs-glass-border': isLight ? rgba(text, 0.14) : rgba(text, ui.border),
    '--vs-chrome-opacity': String(chromeOpacity),
    '--vs-player-opacity': String(theme.player.controlOpacity),
    '--vs-metadata-opacity': String(metadataOpacity),
    '--vs-density': String(density),
    '--vs-transition': `${Math.round(theme.motion.transitionSpeed)}ms`,
    '--vs-light-blur': `${theme.lighting.blur}px`,
    '--vs-font-ui': faces.ui,
    '--vs-font-mono': faces.mono,
    '--vs-font-display': faces.display,
    '--font': faces.ui,                                   // 业务 body 字体
    '--vs-heading-weight': String(faces.headingWeight),
    '--vs-heading-spacing': faces.headingSpacing,
    '--vs-shadow': surf.shadow,
    '--vs-glow': surf.glow,
    '--vs-surface-inset': surf.inset,
  };

  const engineParams: EngineParams = {
    scene: { css: sc.css, base: sc.base, opacity: effectiveOpacity, blend: onPlayer ? 'screen' : 'normal' },
    light: {
      enabled: theme.lighting.enabled && lightingIntensity > 0,
      opacity: Math.min(1, lightingIntensity * 1.05),
      saturation: theme.lighting.saturation,
      layers: lightLayers(theme, ctx.cover ?? null, appearance),
    },
    grain,
    vignette,
    bloom,
    particles: {
      enabled: particlesEnabled,
      density: particleDensity,
      speed: theme.particles.speed,
      size: theme.particles.size,
      opacity: theme.particles.opacity,
      depth: theme.particles.depth,
      reaction: theme.particles.reaction,
    },
    motion: {
      enabled: budget.allowMotion && theme.motion.enabled,
      camera: theme.motion.camera,
      parallax: theme.motion.parallax,
      kenBurns: theme.motion.kenBurns,
      transition: Math.round(theme.motion.transitionSpeed),
    },
    ui: {
      chromeOpacity,
      playerOpacity: theme.player.controlOpacity,
      metadataOpacity,
      glassAlpha,
      glassBlur: Math.max(4, Math.round(ui.blur)),
      glassBorder: isLight ? rgba(text, 0.14) : rgba(text, ui.border),
      radiusSm,
      radiusMd,
      density,
      accent,
      accentDim,
      accentBorder,
    },
  };

  // —— Aqua 专属令牌（theme.aqua 存在时）——
  const A = theme.aqua;
  if (A) {
    const frost = Math.min(1.4, Math.max(0.05, ui.glass * 1.4));
    cssVars['--vs-frost'] = String(frost);
    cssVars['--vs-glass-card-light'] =
      'linear-gradient(180deg, color-mix(in srgb, rgb(255 255 255) calc(50% * var(--vs-frost,1)), transparent), color-mix(in srgb, rgb(255 255 255) calc(35% * var(--vs-frost,1)), transparent))';
    cssVars['--vs-glass-card-dark'] =
      'linear-gradient(180deg, color-mix(in srgb, rgb(42 46 56) calc(50% * var(--vs-frost,1)), transparent), color-mix(in srgb, rgb(22 25 34) calc(50% * var(--vs-frost,1)), transparent))';
    cssVars['--vs-aqua-hue'] = String(A.fluidHue);
    cssVars['--vs-aqua-depth'] = String(A.fluidDepth / 100);
    const darkBright = appearance === 'dark';
    cssVars['--vs-aqua-brightness-black'] = String(darkBright ? Math.max(0, (50 - A.bgBrightness) / 50) : 0);
    cssVars['--vs-aqua-brightness-white'] = String(darkBright ? 0 : Math.max(0, (A.bgBrightness - 50) / 50));
    cssVars['--vs-aqua-wallpaper-blur'] = `${A.wallpaperBlur}px`;
    cssVars['--vs-aqua-wallpaper-frost'] = String(A.wallpaperFrost / 100);
    const glowHue = ((A.fluidHue + 320) % 360 + 360) % 360;
    cssVars['--vs-aqua-spot-color'] = darkBright
      ? `hsla(${glowHue}, 90%, 62%, 0.17)`
      : `hsla(${glowHue}, 90%, 45%, 0.16)`;

    engineParams.aqua = {
      enabled: true,
      mode: A.mode,
      backdrop: A.backdrop,
      videoBlur: A.videoBlur,
      videoBrightness: A.videoBrightness,
      mesh: A.mesh,
      fluidHue: A.fluidHue,
      fluidDepth: A.fluidDepth,
      bgBrightness: A.bgBrightness,
      wallpaper: A.wallpaper,
      wallpaperBlur: A.wallpaperBlur,
      wallpaperFrost: A.wallpaperFrost,
      edgeFade: A.edgeFade,
      spotlight: A.spotlight,
      press: A.press,
      critters: A.critters,
      whale: A.whale,
    };
  }

  return { cssVars, engineParams };
}

/** 图片 → palette（32×32 降采样） */
export function paletteFromImage(img: HTMLImageElement): PaletteColors | null {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data;
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1;
      if (l < 235) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
    }
    if (!n) return null;
    const mid = { r: sr / n, g: sg / n, b: sb / n };
    const midHex = rgbToHex(mid);
    return { start: lighten(darken(midHex, 0.55), 0.25), middle: darken(midHex, 0.55), end: darken(midHex, 0.72), angle: 160, mid: midHex };
  } catch {
    return null;
  }
}

export const colorUtils = { lighten, darken, rgba, temperatureColor, isLight };
