/**
 * visual/appearance.ts — AppearanceProbe
 * System/Light/Dark 独立维度：System 在运行时解析为 light/dark。
 * 系统外观变化时无需重启即可重新 resolve；data-theme 变化（用户切换）亦实时跟随。
 */
import type { Appearance } from './types';

let current: Appearance = 'light';
const subs = new Set<() => void>();
const mql = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;

function detect(): Appearance {
  const dt = document.documentElement.dataset.theme;
  if (dt === 'light' || dt === 'dark') return dt;
  return mql?.matches ? 'dark' : 'light';
}

function preference(): 'auto' | Appearance {
  const value = document.documentElement.dataset.themePreference;
  return value === 'light' || value === 'dark' ? value : 'auto';
}

function resolveSystem(): Appearance {
  return mql?.matches ? 'dark' : 'light';
}

function applyAutoAppearance(): void {
  if (preference() !== 'auto') return;
  const resolved = resolveSystem();
  if (document.documentElement.dataset.theme !== resolved) {
    document.documentElement.dataset.theme = resolved;
  }
}

function refresh(): void {
  current = detect();
  subs.forEach((cb) => cb());
}

export const AppearanceProbe = {
  get(): Appearance { return current; },
  on(cb: () => void): () => void { subs.add(cb); return () => subs.delete(cb); },
  /** 初始化：补齐 data-theme（auto → 系统解析），监听系统 + 属性变化 */
  init(): void {
    if (!document.documentElement.dataset.themePreference) {
      document.documentElement.dataset.themePreference = 'auto';
    }
    applyAutoAppearance();
    current = detect();
    mql?.addEventListener?.('change', () => {
      applyAutoAppearance();
      refresh();
    });
    const mo = new MutationObserver(() => {
      applyAutoAppearance();
      refresh();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-preference'] });
  },
};
