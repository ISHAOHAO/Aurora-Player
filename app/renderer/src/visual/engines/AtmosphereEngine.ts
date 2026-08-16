/**
 * engines/AtmosphereEngine.ts — grain / vignette / bloom 层
 * 全部合成层（transform/opacity 驱动），播放页视频保持主导。
 */
import type { EngineParams } from '../types';

const GRAIN_SVG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")";

export class AtmosphereEngine {
  private grain: HTMLDivElement | null = null;
  private vig: HTMLDivElement | null = null;
  private bloom: HTMLDivElement | null = null;

  mount(container: HTMLElement): void {
    if (this.grain) return;
    this.grain = this.make('vs-grain');
    this.vig = this.make('vs-vignette');
    this.bloom = this.make('vs-bloom');
    this.grain.style.backgroundImage = GRAIN_SVG;
    container.append(this.grain, this.vig, this.bloom);
  }
  private make(cls: string): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    return d;
  }
  unmount(): void {
    [this.grain, this.vig, this.bloom].forEach((d) => d?.remove());
    this.grain = this.vig = this.bloom = null;
  }

  apply(p: { grain: number; vignette: number; bloom: number }, transitionMs: number): void {
    const t = `${transitionMs}ms ease`;
    // grain 屏幕混合上限收紧：不抬黑场（Video First）
    if (this.grain) { this.grain.style.opacity = String(Math.min(0.09, p.grain * 0.09)); this.grain.style.transition = `opacity ${t}`; }
    if (this.vig) { this.vig.style.opacity = String(p.vignette); this.vig.style.transition = `opacity ${t}`; }
    if (this.bloom) { this.bloom.style.opacity = String(p.bloom); this.bloom.style.transition = `opacity ${t}`; }
  }
}
