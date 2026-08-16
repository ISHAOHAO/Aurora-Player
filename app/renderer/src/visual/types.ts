/**
 * Aurora Player — Visual Theme System
 * types.ts — VisualTheme / ResolvedTheme / PlaybackState / 状态预算 / PaletteSource
 */

export type ThemeSource = 'builtin' | 'user';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type MetadataDensity = 'minimal' | 'normal' | 'technical';
export type Presentation = 'normal' | 'immersive';
export type BackgroundMode = 'solid' | 'gradient' | 'cover' | 'fluid' | 'wallpaper' | 'none';

/** 视觉预算状态（由 route + playback 派生） */
export type RouteState = 'browse' | 'settings' | 'playback' | 'immersive';

/** 应用外观（独立维度，System 在运行时解析为 light/dark） */
export type Appearance = 'light' | 'dark';

/** 主题的设计签名（语义描述：Typography / Layout / Surface / Shape / Density / Motion / Atmosphere） */
export interface ThemeSignature {
  layout: 'cinematic' | 'editorial' | 'compact' | 'glass' | 'immersive' | 'luminous';
  typography: 'editorial-sans' | 'serif' | 'geometric' | 'technical' | 'cinematic' | 'clean';
  surface: 'matte' | 'paper' | 'glass' | 'flat' | 'luminous' | 'atmospheric';
  shape: 'rectangular' | 'sharp' | 'soft' | 'translucent' | 'minimal' | 'floating';
  density: 'medium' | 'spacious' | 'compact' | 'sparse';
  motion: 'slow' | 'restrained' | 'minimal' | 'medium' | 'cinematic';
  atmosphere: 'warm' | 'monochrome' | 'none' | 'luminous' | 'layered' | 'reactive';
}

/** 主题的浅色意图（由 Resolver 的 Appearance Adapter 消费，不硬编码到主题本体） */
export interface ThemeAppearanceLight {
  scene?: { start: string; middle?: string; end: string; angle: number };
  base?: string;
  surface?: string;
  surface2?: string;
  text?: string;
  accent?: string;
  bgOpacity?: number;        // 浅色下 scene 不透明度倍率（相对主题）
  grain?: number;
  vignette?: number;
  lightingIntensity?: number;
}
export interface ThemeAppearance {
  darkOnly?: boolean;        // OLED：仅暗色
  light?: ThemeAppearanceLight;
}

/** 视觉主题数据模型（可 JSON 序列化、不可变） */
export interface VisualTheme {
  id: string;
  name: string;
  description?: string;
  source: ThemeSource;
  version: 1;

  scene: {
    mode: BackgroundMode;
    solid?: string;            // mode='solid'
    bgOpacity: number;         // 0..1（运行时由 Resolver 按状态预算硬上限）
    gradient?: { start: string; middle?: string; end: string; angle: number };
    cover: { follow: boolean; locked: boolean; auto: boolean };
  };

  lighting: {
    enabled: boolean;
    intensity: number;         // 0..1
    blur: number;              // px
    spread: number;            // 0..1
    saturation: number;        // 0..1
    temperature: number;       // <1 冷 / 1 中性 / >1 暖
  };

  particles: {
    enabled: boolean;
    density: number; speed: number; size: number;
    opacity: number; depth: number; reaction: number;
    // —— 主题粒子人格（ParticleEngine 消费；主题只提供数据）——
    color?: string;                 // 主色（默认暖白）
    colorSecondary?: string;        // 次色（与主色形成 2~3 邻近色）
    glow?: number;                  // 前景柔光强度 0..1（0=纯实点，非 neon）
    blur?: number;                  // 前景柔焦（径向渐变软边，px 语义）
    foregroundRatio?: number;       // 前景大柔粒子占比（≤0.08）
    distribution?: 'uniform' | 'uneven' | 'clustered';   // 空间分布
    motion?: 'dust' | 'flow' | 'drift';                  // 运动性格
    usePalette?: boolean;           // Immersive：从 cover/frame 调色板取色
  };

  motion: {
    enabled: boolean;
    camera: number; parallax: number; kenBurns: number;
    transitionSpeed: number;   // ms
  };

  atmosphere: { grain: number; bloom: number; vignette: number; aberration: number };

  ui: {
    opacity: number;           // chrome / buttons
    glass: number;             // 0..1 玻璃量
    blur: number;              // px
    border: number;            // border alpha 0..0.35
    radius: number;            // px
    density: Density;
    accent: string;
  };

  player: {
    controlOpacity: number;
    autoHide: number;          // 秒
    metadata: MetadataDensity;
    defaultPresentation: Presentation;   // 仅主题默认倾向，非唯一 Immersive 来源
  };

  appearance?: ThemeAppearance;          // 浅色意图 / darkOnly（Appearance Adapter 消费）
  signature?: ThemeSignature;            // 设计签名：Resolver/CSS 据此产出具差异的视觉语言

  advanced?: {
    particleDepth?: number;
    lightFalloff?: number;
    bloomSamples?: number;
    motionCurve?: 'linear' | 'ease' | 'cinematic';
    extremeOpacity?: boolean;
    performance?: 'balanced' | 'high' | 'eco';
  };

  aqua?: VisualThemeAqua;
}

/** 状态预算（修正 1：Video First 运行时强制约束） */
export interface StateBudget {
  bgOpacityMax: number;
  allowBloom: boolean;
  allowVignette: boolean;
  allowMotion: boolean;        // camera / kenBurns / parallax
  particleCap: number;
  particleBudget: number;      // 0..1 密度倍率
}

export const STATE_BUDGETS: Record<RouteState, StateBudget> = {
  browse:   { bgOpacityMax: 0.20, allowBloom: false, allowVignette: false, allowMotion: false, particleCap: 60,  particleBudget: 0.35 },
  settings: { bgOpacityMax: 0.12, allowBloom: false, allowVignette: false, allowMotion: false, particleCap: 0,   particleBudget: 0 },
  playback: { bgOpacityMax: 0.18, allowBloom: true,  allowVignette: true,  allowMotion: false, particleCap: 180, particleBudget: 0.7 },
  immersive:{ bgOpacityMax: 0.28, allowBloom: true,  allowVignette: true,  allowMotion: true,  particleCap: 420, particleBudget: 1 },
};

/** 播放/路由上下文（VisualProvider 汇集，Player 只提供状态不做视觉逻辑） */
export interface PlaybackContext {
  route: 'home' | 'settings' | 'player';
  presentation: Presentation;
  fullscreen: boolean;
  idle: boolean;               // UI 自动隐藏（仅隐藏控制层，≠ Immersive）
  paused: boolean;
  playing: boolean;
  reducedMotion: boolean;
}

/** 视觉光源（修正 5：Cover Palette 与 Frame Palette 区分） */
export type PaletteSource =
  | { type: 'cover'; fileId: string }
  | { type: 'frame'; playbackId: string }
  | { type: 'manual'; colors: string[] };

/** 取色结果（已暗化、限亮度限饱和） */
export interface PaletteColors {
  start: string;
  middle: string;
  end: string;
  angle: number;
  mid: string;
}

/** 引擎参数（三类强度独立：Scene / Atmosphere / UI） */
export interface EngineParams {
  scene: { css: string; base: string; opacity: number; blend: 'normal' | 'screen' };
  light: {
    enabled: boolean;
    opacity: number;           // Scene 强度（环境光属 Scene 组）
    saturation: number;
    layers: { color: string; x: string; y: string; size: number }[];
  };
  grain: number;               // Atmosphere 强度
  vignette: number;
  bloom: number;
  particles: {
    enabled: boolean;
    density: number; speed: number; size: number;
    opacity: number; depth: number; reaction: number;
  };
  motion: {
    enabled: boolean;
    camera: number; parallax: number; kenBurns: number;
    transition: number;
  };
  ui: {                        // UI 强度（独立组）
    chromeOpacity: number;
    playerOpacity: number;
    metadataOpacity: number;
    glassAlpha: number;
    glassBlur: number;
    glassBorder: string;
    radiusSm: string;
    radiusMd: string;
    density: number;
    accent: string;
    accentDim: string;
    accentBorder: string;
  };

  aqua?: AquaEngineParams;
}

/** Resolver 输出：CSS 变量 + 引擎参数 */
export interface ResolvedTheme {
  cssVars: Record<string, string>;
  engineParams: EngineParams;
}

/** persist.ts 的磁盘结构 */
export interface VisualFile {
  version: 1;
  activeThemeId: string;
  activePresetId: string | null;
  presets: VisualTheme[];      // 仅用户预设（source: user），官方主题不落盘
}

/** Aqua 深海水主题专属参数（可选段；仅 Aqua 及其他需要它的主题填充） */
export interface VisualThemeAqua {
  backdrop: 'fluid' | 'wallpaper';
  fluidHue: number;
  fluidDepth: number;
  bgBrightness: number;
  wallpaper: string;
  wallpaperBlur: number;
  wallpaperFrost: number;
  edgeFade: boolean;
  spotlight: boolean;
  press: boolean;
  critters: boolean;
  whale: boolean;
}

/** EngineParams 的 Aqua 运行时参数（enabled 由 resolver 写入：主题有 aqua 段时 true） */
export interface AquaEngineParams extends VisualThemeAqua {
  enabled: boolean;
}
