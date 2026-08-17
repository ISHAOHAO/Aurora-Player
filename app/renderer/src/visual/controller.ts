/**
 * visual/controller.ts — 视觉系统编排器（Provider/Console 共用）
 * 职责：
 *  - mount 氛围根节点 + 各引擎
 *  - 订阅 store / PlaybackProbe / AppearanceProbe / 路由 → 重新 resolve
 *  - 同时产出 dark + light 两套令牌块（Appearance 独立维度，切换即时生效）
 *  - Cover/Frame palette 异步取色 → 回调重刷（不阻塞主题应用）
 *  - Console 打开：backdrop 层 + body[data-console-open]（底层 UI 让位）
 *
 * 业务组件不得直接操作引擎；只通过 <VisualProvider> / useVisual。
 */
import { resolve } from './resolver';
import { VisualStore } from './store';
import { PlaybackProbe } from './playback';
import { AppearanceProbe } from './appearance';
import { computeRouteState, derivePresentation, type ImmersiveOverride } from './PlayerAtmosphere';
import type { EngineParams, PaletteColors, RouteState, VisualTheme } from './types';
import { BackgroundEngine } from './engines/BackgroundEngine';
import { AtmosphereEngine } from './engines/AtmosphereEngine';
import { LightingEngine } from './engines/LightingEngine';
import { ParticleEngine } from './engines/ParticleEngine';
import { MotionEngine } from './engines/MotionEngine';
import { FluidEngine } from './engines/FluidEngine';
import { CrittersEngine } from './engines/CrittersEngine';
import { SpotlightEngine } from './engines/SpotlightEngine';
import { EdgeFadeLayer } from './engines/EdgeFadeLayer';
import { MeshEngine } from './engines/MeshEngine';

let root: HTMLDivElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let backdropEl: HTMLDivElement | null = null;
const background = new BackgroundEngine();
const atmosphere = new AtmosphereEngine();
const lighting = new LightingEngine();
const particles = new ParticleEngine();
const motion = new MotionEngine();
const fluid = new FluidEngine();
const critters = new CrittersEngine();
const spotlight = new SpotlightEngine();
const edgeFade = new EdgeFadeLayer();
const mesh = new MeshEngine();

let manualImmersive: ImmersiveOverride = null;
let lastCover: PaletteColors | null = null;
let presentation: 'normal' | 'immersive' = 'normal';
let consoleOpen = false;
let disposed = true;
let refresher = 0;
let unsubStore: (() => void) | null = null;
let unsubPlay: (() => void) | null = null;
let unsubAppearance: (() => void) | null = null;
const listeners = new Set<() => void>();

function getPresentation(): 'normal' | 'immersive' { return presentation; }
function setImmersiveOverride(v: ImmersiveOverride): void {
  manualImmersive = v;
  if (!disposed) refresh();
}
function getConsoleOpen(): boolean { return consoleOpen; }
function setConsoleOpen(v: boolean): void {
  consoleOpen = v;
  document.body.dataset.consoleOpen = v ? 'true' : 'false';
  syncBackdrop();
  emit();
}
function emit() { listeners.forEach((cb) => cb()); }

function routeOf(): 'home' | 'settings' | 'player' {
  const h = location.hash;
  if (h.startsWith('#/player')) return 'player';
  if (h.startsWith('#/settings')) return 'settings';
  return 'home';
}

/* ---------- Console Backdrop（打开时才存在；位于 Page UI 与 Console 之间） ---------- */
function syncBackdrop(): void {
  if (consoleOpen && !backdropEl) {
    backdropEl = document.createElement('div');
    backdropEl.id = 'vs-console-backdrop';
    backdropEl.addEventListener('click', () => setConsoleOpen(false));
    document.body.appendChild(backdropEl);
    setTimeout(() => { if (backdropEl) backdropEl.classList.add('show'); }, 20);
  } else if (!consoleOpen && backdropEl) {
    const el = backdropEl;
    backdropEl = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }
}

function writeVars(darkVars: Record<string, string>, lightVars: Record<string, string>): void {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'vs-vars';
    document.head.appendChild(styleEl);
  }
  const block = (sel: string, vars: Record<string, string>) =>
    sel + '{' + Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('') + '}';
  styleEl.textContent = block(':root[data-theme="dark"]', darkVars) + block(':root[data-theme="light"]', lightVars);
}

function onPointer(e: PointerEvent): void {
  motion.setPointer(e.clientX, e.clientY);
}

function refresh(): void {
  clearTimeout(refresher);
  refresher = window.setTimeout(() => {
    const probe = PlaybackProbe.get();
    const theme = VisualStore.getActiveTheme();
    const route = routeOf();
    presentation = derivePresentation(
      { fullscreen: probe.fullscreen, playing: probe.playing },
      theme.player.defaultPresentation,
      manualImmersive,
    );
    const state: RouteState = computeRouteState({ route, presentation, fullscreen: probe.fullscreen, idle: probe.idle, paused: probe.paused, playing: probe.playing, reducedMotion: false });

    document.body.dataset.presentation = presentation;
    document.body.dataset.vtheme = VisualStore.activeThemeId;

    const useFrame = route === 'player';
    const coverWanted = theme.scene.mode === 'cover' || theme.scene.cover.follow;
    if (useFrame) {
      lighting.setThumbTime(probe.time);
      if (probe.fileId) {
        lighting.requestPalette({ kind: 'frame', fileId: probe.fileId, posterUrl: null }, (p) => {
          lastCover = p; resolveAll(theme, state); emit();
        });
      }
    } else if (coverWanted && probe.coverUrl) {
      lighting.requestPalette({ kind: 'cover', fileId: probe.coverUrl, posterUrl: probe.coverUrl }, (p) => {
        lastCover = p; resolveAll(theme, state); emit();
      });
    }

    resolveAll(theme, state);
    emit();
  }, 30);
}

/** 双外观 resolve + 写令牌 + 应用当前外观引擎参数 */
function resolveAll(theme: VisualTheme, state: RouteState): void {
  const cover = lastCover;
  const dark = resolve(theme, { cover, state, appearance: 'dark' });
  const light = resolve(theme, { cover, state, appearance: 'light' });
  writeVars(dark.cssVars, light.cssVars);
  const cur = AppearanceProbe.get() === 'light' ? light.engineParams : dark.engineParams;
  applyEngines(cur, state);
}

function applyEngines(p: EngineParams, state: RouteState): void {
  background.apply(p.scene);
  atmosphere.apply({ grain: p.grain, vignette: p.vignette, bloom: p.bloom }, p.motion.transition);
  lighting.apply(p.light, p.motion.transition);
  const cap = state === 'playback' || state === 'immersive' ? 180 : state === 'browse' ? 60 : 0;
  particles.apply(p.particles, cap);
  motion.apply(p.motion);
  critters.apply(p.aqua, state === 'playback' || state === 'immersive');
  edgeFade.apply(p.aqua, state === 'playback' || state === 'immersive');
  mesh.apply(p.aqua, state === 'playback' || state === 'immersive');
  spotlight.apply(p.aqua);
  fluid.apply(p.aqua, state === 'playback' || state === 'immersive');
  const mode = p.aqua?.mode ?? 'mica';
  if (document.documentElement.dataset.vsAquaMode !== mode) document.documentElement.dataset.vsAquaMode = mode;
  const probe = PlaybackProbe.get();
  const aspect = probe.videoW && probe.videoH ? probe.videoW / probe.videoH : null;
  const winAspect = window.innerWidth / window.innerHeight;
  let rect: { top: number; bottom: number; left: number; right: number } | null = null;
  if ((state === 'playback' || state === 'immersive') && aspect) {
    if (aspect > winAspect) {
      const h = window.innerWidth / aspect;
      rect = { top: (window.innerHeight - h) / 2, bottom: (window.innerHeight + h) / 2, left: 0, right: window.innerWidth };
    } else {
      const w = window.innerHeight * aspect;
      rect = { top: 0, bottom: window.innerHeight, left: (window.innerWidth - w) / 2, right: (window.innerWidth + w) / 2 };
    }
  }
  fluid.setVideoRect(rect);
}

/* ---------- 生命周期 ---------- */
export function initVisualSystem(): void {
  if (!disposed) return;
  disposed = false;
  root = document.createElement('div');
  root.id = 'vs-atmosphere';
  document.body.appendChild(root);
  background.mount(root);
  atmosphere.mount(root);
  lighting.mount(root);
  motion.attach(background.element, lighting.element);
  particles.mount(root);
  fluid.mount(root);
  critters.mount(root);
  edgeFade.mount();
  spotlight.mount();
  mesh.mount(root);

  AppearanceProbe.init();
  unsubStore = VisualStore.on(refresh);
  unsubPlay = PlaybackProbe.on(refresh);
  unsubAppearance = AppearanceProbe.on(refresh);
  window.addEventListener('hashchange', refresh);
  window.addEventListener('pointermove', onPointer, { passive: true });
  refresh();

  // 调试/测试钩子（e2e 用；无副作用）
  (window as unknown as Record<string, unknown>).__VISUAL__ = {
    store: VisualStore,
    system: VisualSystem,
    probe: PlaybackProbe,
    appearance: AppearanceProbe,
  };
}

export function destroyVisualSystem(): void {
  if (disposed) return;
  disposed = true;
  unsubStore?.(); unsubStore = null;
  unsubPlay?.(); unsubPlay = null;
  unsubAppearance?.(); unsubAppearance = null;
  window.removeEventListener('hashchange', refresh);
  window.removeEventListener('pointermove', onPointer);
  background.unmount();
  atmosphere.unmount();
  lighting.unmount();
  particles.unmount();
  motion.destroy();
  fluid.unmount();
  critters.unmount();
  spotlight.unmount();
  edgeFade.unmount();
  mesh.unmount();
  root?.remove(); root = null;
  backdropEl?.remove(); backdropEl = null;
  delete document.documentElement.dataset.vsAquaMode;
  if (styleEl) { styleEl.remove(); styleEl = null; }
}

export const VisualSystem = {
  init: initVisualSystem,
  destroy: destroyVisualSystem,
  refresh,
  setImmersiveOverride,
  getPresentation,
  toggleImmersive(): void {
    setImmersiveOverride(presentation === 'immersive' ? false : true);
  },
  getConsoleOpen,
  setConsoleOpen,
  on(cb: () => void): () => void { listeners.add(cb); return () => listeners.delete(cb); },
};
