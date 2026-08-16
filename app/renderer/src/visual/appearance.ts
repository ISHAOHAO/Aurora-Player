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

function refresh(): void {
  current = detect();
  subs.forEach((cb) => cb());
}

export const AppearanceProbe = {
  get(): Appearance { return current; },
  on(cb: () => void): () => void { subs.add(cb); return () => subs.delete(cb); },
  /** 初始化：补齐 data-theme（auto → 系统解析），监听系统 + 属性变化 */
  init(): void {
    if (!document.documentElement.dataset.theme || document.documentElement.dataset.theme === 'auto') {
      document.documentElement.dataset.theme = detect();
    }
    current = detect();
    mql?.addEventListener?.('change', () => {
      // 仅当未被手动 light/dark 覆盖时跟随系统
      const dt = document.documentElement.dataset.theme;
      if (!dt || dt === 'auto') document.documentElement.dataset.theme = detect();
      refresh();
    });
    const mo = new MutationObserver(() => {
      // 归一化：data-theme='auto' 或缺失 → 解析为 light/dark（避免注入块不匹配）
      const dt = document.documentElement.dataset.theme;
      if (!dt || dt === 'auto') document.documentElement.dataset.theme = detect();
      refresh();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  },
};
