/**
 * engines/MotionEngine.ts — camera / Ken Burns / parallax
 * 仅 Immersive 预算启用（resolver 已门控）。transform/opacity 驱动，reduced-motion 静默。
 */
import type { EngineParams } from '../types';

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class MotionEngine {
  private sceneEl: HTMLDivElement | null = null;
  private lightEl: HTMLDivElement | null = null;
  private cfg: EngineParams['motion'] = { enabled: false, camera: 0, parallax: 0, kenBurns: 0, transition: 400 };
  private raf = 0;
  private mx = 0; private my = 0;

  attach(scene: HTMLDivElement | null, light: HTMLDivElement | null): void {
    this.sceneEl = scene;
    this.lightEl = light;
  }

  apply(p: EngineParams['motion']): void {
    this.cfg = p;
    if (!this.sceneEl) return;
    if (!p.enabled || REDUCE) {
      cancelAnimationFrame(this.raf);
      this.sceneEl.style.animation = 'none';
      this.sceneEl.style.transform = 'scale(1)';
      if (this.lightEl) this.lightEl.style.translate = '0 0';
      return;
    }
    // Ken Burns：缓慢推近
    const kb = p.kenBurns > 0 ? `vs-kb ${(18 / Math.max(0.05, p.kenBurns)).toFixed(1)}s ease-in-out infinite alternate` : 'none';
    this.sceneEl.style.animation = kb;
    this.sceneEl.style.willChange = 'transform';
    // parallax：跟随指针
    if (p.parallax > 0 && !this.raf) {
      const loop = (): void => {
        this.raf = requestAnimationFrame(loop);
        const k = this.cfg.parallax * 12;
        const dx = (this.mx / window.innerWidth - 0.5) * k;
        const dy = (this.my / window.innerHeight - 0.5) * k;
        if (this.lightEl) this.lightEl.style.translate = `${dx}px ${dy}px`;
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  setPointer(x: number, y: number): void { this.mx = x; this.my = y; }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
