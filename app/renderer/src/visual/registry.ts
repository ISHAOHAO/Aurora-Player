/**
 * visual/registry.ts — 官方主题注册表（7 主题）
 * 主题 = 纯数据；每个主题携带 ThemeSignature（设计签名）与粒子人格（Particles profile），
 * 由 Resolver + visual.css + ParticleEngine 翻译成真正不同的视觉语言。
 */
import type { VisualTheme } from './types';

export const THEME_IDS = ['cinema', 'aurora', 'noir', 'oled', 'glass', 'immersive', 'aqua'] as const;
export type ThemeId = typeof THEME_IDS[number];

const t = (id: ThemeId, name: string, description: string, extra: Partial<VisualTheme>): VisualTheme => ({
  id,
  name,
  description,
  source: 'builtin',
  version: 1,
  scene: { mode: 'gradient', bgOpacity: 0.9, gradient: { start: '#101015', middle: '#0B0B0E', end: '#070709', angle: 160 }, cover: { follow: false, locked: false, auto: false } },
  lighting: { enabled: true, intensity: 0.25, blur: 22, spread: 0.4, saturation: 0.5, temperature: 1.25 },
  particles: { enabled: true, density: 0.22, speed: 0.3, size: 0.5, opacity: 0.35, depth: 0.3, reaction: 0.3 },
  motion: { enabled: true, camera: 0.15, parallax: 0.2, kenBurns: 0.4, transitionSpeed: 400 },
  atmosphere: { grain: 0.6, bloom: 0.1, vignette: 0.28, aberration: 0 },
  ui: { opacity: 0.85, glass: 0.45, blur: 20, border: 0.09, radius: 10, density: 'comfortable', accent: '#E8A94E' },
  player: { controlOpacity: 0.72, autoHide: 3, metadata: 'normal', defaultPresentation: 'normal' },
  ...extra,
});

export const REGISTRY: VisualTheme[] = [
  /* ============ Cinema — Modern Cinema Equipment ============ */
  t('cinema', 'Cinema', '电影设备：深黑 · 暖琥珀 · 细线 · 矩形控件 · 放映室尘埃', {
    scene: { mode: 'gradient', bgOpacity: 0.92, gradient: { start: '#141419', middle: '#0E0E11', end: '#08080A', angle: 160 }, cover: { follow: false, locked: false, auto: false } },
    lighting: { enabled: true, intensity: 0.25, blur: 22, spread: 0.40, saturation: 0.50, temperature: 1.25 },
    particles: { enabled: true, density: 0.22, speed: 0.22, size: 0.50, opacity: 0.45, depth: 0.50, reaction: 0.30, color: '#E8B877', colorSecondary: '#C99A5A', glow: 0.15, blur: 1, foregroundRatio: 0.05, distribution: 'uneven', motion: 'dust' },
    motion: { enabled: true, camera: 0.15, parallax: 0.20, kenBurns: 0.40, transitionSpeed: 400 },
    atmosphere: { grain: 0.60, bloom: 0.10, vignette: 0.28, aberration: 0 },
    ui: { opacity: 0.85, glass: 0.30, blur: 20, border: 0.06, radius: 8, density: 'comfortable', accent: '#E8A94E' },
    player: { controlOpacity: 0.72, autoHide: 3, metadata: 'normal', defaultPresentation: 'normal' },
    signature: { layout: 'cinematic', typography: 'editorial-sans', surface: 'matte', shape: 'rectangular', density: 'medium', motion: 'slow', atmosphere: 'warm' },
    appearance: {
      light: {
        scene: { start: '#F5F0E7', middle: '#EFE8DC', end: '#E9E1D2', angle: 165 },
        base: '#F1EBDF', surface: '#FCF9F4', surface2: '#F0E9DD', text: '#2A241B',
        accent: '#9A6B2F', bgOpacity: 0.5, grain: 0.5, vignette: 0.15, lightingIntensity: 0.5,
      },
    },
  }),

  /* ============ Aurora — Luminous Atmospheric Interface ============ */
  t('aurora', 'Aurora', '发光氛围界面：青紫 · 柔光 · 更圆润 · 更宽松 · 发光空气', {
    scene: { mode: 'gradient', bgOpacity: 0.94, gradient: { start: '#0C1320', middle: '#0A0E16', end: '#070A10', angle: 150 }, cover: { follow: true, locked: false, auto: true } },
    lighting: { enabled: true, intensity: 0.62, blur: 32, spread: 0.60, saturation: 0.88, temperature: 0.75 },
    particles: { enabled: true, density: 0.50, speed: 0.50, size: 0.55, opacity: 0.60, depth: 0.60, reaction: 0.45, color: '#8FE0F7', colorSecondary: '#B8A7F5', glow: 0.45, blur: 1.5, foregroundRatio: 0.06, distribution: 'uneven', motion: 'flow' },
    motion: { enabled: true, camera: 0.32, parallax: 0.42, kenBurns: 0.62, transitionSpeed: 520 },
    atmosphere: { grain: 0.32, bloom: 0.30, vignette: 0.30, aberration: 0.16 },
    ui: { opacity: 0.90, glass: 0.50, blur: 28, border: 0.12, radius: 14, density: 'spacious', accent: '#5FD0F2' },
    player: { controlOpacity: 0.80, autoHide: 3, metadata: 'normal', defaultPresentation: 'normal' },
    signature: { layout: 'luminous', typography: 'geometric', surface: 'luminous', shape: 'soft', density: 'spacious', motion: 'medium', atmosphere: 'luminous' },
    appearance: {
      light: {
        scene: { start: '#F0F3F7', middle: '#E7EBF1', end: '#DDE3EB', angle: 165 },
        base: '#E9EDF2', surface: '#F7F9FB', surface2: '#E7EBF1', text: '#202834',
        accent: '#5579B8', bgOpacity: 0.45, lightingIntensity: 0.6,
      },
    },
  }),

  /* ============ Noir — Film Archive / Editorial ============ */
  t('noir', 'Noir', '电影档案：衬线 · 印刷目录 · 编号章节 · 纸面 · 胶片尘埃', {
    scene: { mode: 'solid', solid: '#0F0F0F', bgOpacity: 0.96, cover: { follow: false, locked: true, auto: false } },
    lighting: { enabled: false, intensity: 0, blur: 12, spread: 0.3, saturation: 0, temperature: 1 },
    particles: { enabled: true, density: 0.12, speed: 0.14, size: 0.40, opacity: 0.50, depth: 0.30, reaction: 0.15, color: '#D8D5CE', colorSecondary: '#8F8F88', glow: 0, blur: 0.4, foregroundRatio: 0.03, distribution: 'clustered', motion: 'dust' },
    motion: { enabled: true, camera: 0.08, parallax: 0.10, kenBurns: 0.16, transitionSpeed: 640 },
    atmosphere: { grain: 0.85, bloom: 0, vignette: 0.42, aberration: 0 },
    ui: { opacity: 0.95, glass: 0.15, blur: 10, border: 0.08, radius: 2, density: 'spacious', accent: '#D9D9D9' },
    player: { controlOpacity: 0.80, autoHide: 4, metadata: 'minimal', defaultPresentation: 'normal' },
    signature: { layout: 'editorial', typography: 'serif', surface: 'paper', shape: 'sharp', density: 'spacious', motion: 'restrained', atmosphere: 'monochrome' },
    appearance: {
      light: {
        scene: { start: '#F5F5F3', middle: '#EFEFEC', end: '#E8E8E4', angle: 170 },
        base: '#F0F0ED', surface: '#FAFAF8', surface2: '#EDEDE9', text: '#1E1E1C',
        accent: '#8E8E8A', bgOpacity: 0.5, grain: 0.8, vignette: 0.2,
      },
    },
  }),

  /* ============ OLED — 像素节能 / 极简显示模式 ============ */
  t('oled', 'OLED', '极简显示模式：OLED Dark=纯黑影院 / OLED Light=亮白参考 · 无表面 · 无氛围 · 零粒子', {
    scene: { mode: 'solid', solid: '#000000', bgOpacity: 1, cover: { follow: false, locked: true, auto: false } },
    lighting: { enabled: false, intensity: 0, blur: 8, spread: 0.2, saturation: 0, temperature: 1 },
    particles: { enabled: false, density: 0, speed: 0, size: 0, opacity: 0, depth: 0, reaction: 0 },
    motion: { enabled: false, camera: 0, parallax: 0, kenBurns: 0, transitionSpeed: 250 },
    atmosphere: { grain: 0.08, bloom: 0, vignette: 0.18, aberration: 0 },
    ui: { opacity: 0.78, glass: 0.08, blur: 8, border: 0.04, radius: 4, density: 'compact', accent: '#CBD5CE' },
    player: { controlOpacity: 0.55, autoHide: 2.5, metadata: 'minimal', defaultPresentation: 'normal' },
    signature: { layout: 'compact', typography: 'technical', surface: 'flat', shape: 'minimal', density: 'compact', motion: 'minimal', atmosphere: 'none' },
    appearance: {
      // OLED Light = 亮白参考模式（studio reference / 干净胶片目录），非暗色反色
      light: {
        scene: { start: '#FFFFFF', middle: '#FCFCFC', end: '#F6F6F6', angle: 170 },
        base: '#FBFBFB', surface: '#FFFFFF', surface2: '#EFEFEF', text: '#0B0B0B',
        accent: '#9C5B2C', bgOpacity: 0.3, grain: 0.1,
      },
    },
  }),

  /* ============ Glass — Translucent Control Surface ============ */
  t('glass', 'Glass', '半透明控制面：分层玻璃 · 浮层面板 · 微反光（仅必要层用玻璃，视频区保持纯净）', {
    scene: { mode: 'gradient', bgOpacity: 0.90, gradient: { start: '#10121C', middle: '#0C0E15', end: '#080A0F', angle: 160 }, cover: { follow: true, locked: false, auto: true } },
    lighting: { enabled: true, intensity: 0.35, blur: 34, spread: 0.52, saturation: 0.72, temperature: 0.95 },
    particles: { enabled: true, density: 0.18, speed: 0.28, size: 0.45, opacity: 0.40, depth: 0.40, reaction: 0.30, color: '#EFF4FF', colorSecondary: '#D8D4F5', glow: 0.2, blur: 1.6, foregroundRatio: 0.02, distribution: 'clustered', motion: 'drift' },
    motion: { enabled: true, camera: 0.20, parallax: 0.30, kenBurns: 0.50, transitionSpeed: 460 },
    atmosphere: { grain: 0.22, bloom: 0.24, vignette: 0.20, aberration: 0.10 },
    ui: { opacity: 1, glass: 0.85, blur: 36, border: 0.20, radius: 18, density: 'comfortable', accent: '#9D8CFF' },
    player: { controlOpacity: 0.85, autoHide: 3, metadata: 'normal', defaultPresentation: 'normal' },
    signature: { layout: 'glass', typography: 'clean', surface: 'glass', shape: 'translucent', density: 'medium', motion: 'medium', atmosphere: 'layered' },
    appearance: {
      light: {
        scene: { start: '#ECEEF3', middle: '#E4E7EE', end: '#DBDFE8', angle: 170 },
        base: '#E7EAF0', surface: '#F5F6F9', surface2: '#E6E9F0', text: '#22262F',
        accent: '#7767C9', bgOpacity: 0.45, lightingIntensity: 0.4,
      },
    },
  }),

  /* ============ Immersive — Digital Theatre ============ */
  t('immersive', 'Immersive', '数字剧院：cover 环境 · 强氛围 · 影片染色空气 · 视觉更丰富、UI 更少', {
    scene: { mode: 'cover', bgOpacity: 0.84, cover: { follow: true, locked: false, auto: true } },
    lighting: { enabled: true, intensity: 0.82, blur: 40, spread: 0.74, saturation: 0.92, temperature: 1.05 },
    particles: { enabled: true, density: 0.72, speed: 0.55, size: 0.62, opacity: 0.60, depth: 0.80, reaction: 0.72, usePalette: true, glow: 0.55, blur: 2, foregroundRatio: 0.07, distribution: 'uneven', motion: 'flow' },
    motion: { enabled: true, camera: 0.46, parallax: 0.52, kenBurns: 0.82, transitionSpeed: 620 },
    atmosphere: { grain: 0.40, bloom: 0.36, vignette: 0.50, aberration: 0.20 },
    ui: { opacity: 0.68, glass: 0.60, blur: 28, border: 0.12, radius: 10, density: 'spacious', accent: '#F59E62' },
    player: { controlOpacity: 0.50, autoHide: 2, metadata: 'minimal', defaultPresentation: 'immersive' },
    signature: { layout: 'immersive', typography: 'cinematic', surface: 'atmospheric', shape: 'floating', density: 'sparse', motion: 'cinematic', atmosphere: 'reactive' },
    appearance: {
      light: {
        scene: { start: '#ECEFF3', middle: '#E0E4EA', end: '#D5DAE2', angle: 165 },
        base: '#E3E6EC', surface: '#F4F6F9', surface2: '#E4E8EE', text: '#23272F',
        accent: '#C07035', bgOpacity: 0.4, lightingIntensity: 0.7,
      },
    },
  }),

  /* ============ Aqua — 深海水主题（DSH-Aqua 风格：毛玻璃浮层 · 流体背景 · 海洋生物 · 光标聚光） ============ */
  t('aqua', 'Aqua', '深海水主题：毛玻璃浮层 · 流体背景 · 海洋生物 · 光标聚光', {
    scene: { mode: 'fluid', bgOpacity: 0.9, cover: { follow: true, locked: false, auto: true } },
    lighting: { enabled: true, intensity: 0.45, blur: 34, spread: 0.55, saturation: 0.75, temperature: 0.8 },
    particles: { enabled: true, density: 0.16, speed: 0.2, size: 0.42, opacity: 0.4, depth: 0.35, reaction: 0.25, color: '#A9C6EF', colorSecondary: '#7EA4DF', glow: 0.18, blur: 1.4, foregroundRatio: 0.02, distribution: 'uneven', motion: 'drift' },
    motion: { enabled: true, camera: 0.2, parallax: 0.3, kenBurns: 0.5, transitionSpeed: 460 },
    atmosphere: { grain: 0.25, bloom: 0.22, vignette: 0.22, aberration: 0.1 },
    ui: { opacity: 0.92, glass: 0.72, blur: 20, border: 0.2, radius: 14, density: 'comfortable', accent: '#6E9BE8' },
    player: { controlOpacity: 0.85, autoHide: 3, metadata: 'normal', defaultPresentation: 'normal' },
    signature: { layout: 'glass', typography: 'clean', surface: 'glass', shape: 'translucent', density: 'medium', motion: 'medium', atmosphere: 'layered' },
    appearance: {
      light: {
        scene: { start: '#F4F8FD', middle: '#EAF1F9', end: '#DCE7F4', angle: 170 },
        base: '#F4F8FD', surface: '#FFFFFF', surface2: '#ECF2FA', text: '#13243E',
        accent: '#3F76D8', bgOpacity: 0.4, lightingIntensity: 0.5, grain: 0.2, vignette: 0.1,
      },
    },
    aqua: {
      backdrop: 'fluid', fluidHue: 320, fluidDepth: 25, bgBrightness: 50,
      wallpaper: '', wallpaperBlur: 0, wallpaperFrost: 0,
      edgeFade: true, spotlight: true, press: true, critters: true, whale: true,
    },
  }),
];

const REGISTRY_BY_ID = new Map(REGISTRY.map((r) => [r.id, r]));

export function listThemes(): { id: string; name: string; description?: string; source: 'builtin' }[] {
  return REGISTRY.map((r) => ({ id: r.id, name: r.name, description: r.description, source: r.source as 'builtin' }));
}
export function getBuiltinTheme(id: string): VisualTheme | null {
  const r = REGISTRY_BY_ID.get(id);
  return r ? cloneTheme(r) : null;
}
export function cloneTheme(t: VisualTheme): VisualTheme {
  return JSON.parse(JSON.stringify(t)) as VisualTheme;
}
export function makeCustomBase(): VisualTheme {
  const base = getBuiltinTheme('cinema')!;
  return { ...base, id: 'custom', name: 'Custom', description: '我的自定义视觉', source: 'user' };
}
