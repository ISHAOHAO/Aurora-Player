/**
 * engines/BackgroundEngine.ts — 场景背景层
 * 仅负责背景渐变/纯色 + opacity + blend（播放页 screen 混合，视频优先）。
 * 相机/Ken Burns 由 MotionEngine 操作本层 transform。
 */
import type { EngineParams } from '../types';

export class BackgroundEngine {
  private el: HTMLDivElement | null = null;

  mount(container: HTMLElement): void {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.className = 'vs-scene';
    container.appendChild(this.el);
  }
  unmount(): void {
    if (this.el) { this.el.remove(); this.el = null; }
  }

  apply(p: EngineParams['scene']): void {
    if (!this.el) return;
    this.el.style.background = p.css;
    this.el.style.opacity = String(p.opacity);
    this.el.style.mixBlendMode = p.blend;
    this.el.style.transition = 'opacity 500ms ease, background 500ms ease';
  }

  get element(): HTMLDivElement | null { return this.el; }
}
