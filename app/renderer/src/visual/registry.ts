/**
 * visual/registry.ts — 官方主题注册表（1 主题：Aqua）
 * 主题 = 纯数据；每个主题携带 ThemeSignature（设计签名）与粒子人格（Particles profile），
 * 由 Resolver + visual.css + ParticleEngine 翻译成真正不同的视觉语言。
 */
import type { VisualTheme } from './types';

export const THEME_IDS = ['aqua'] as const;
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
      mode: 'mica', backdrop: 'fluid', fluidHue: 320, fluidDepth: 25, bgBrightness: 50,
      wallpaper: '', wallpaperBlur: 0, wallpaperFrost: 0, videoBlur: 6, videoBrightness: 45,
      mesh: true, edgeFade: true, spotlight: true, press: true, critters: true, whale: true,
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
  const base = getBuiltinTheme('aqua')!;
  return { ...base, id: 'custom', name: 'Custom', description: '我的自定义视觉', source: 'user' };
}
