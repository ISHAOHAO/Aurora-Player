import type { AquaEngineParams } from '../types';

export class EdgeFadeLayer {
  private top: HTMLDivElement | null = null;
  private bottom: HTMLDivElement | null = null;

  mount(): void {
    if (this.top) return;
    this.top = document.createElement('div');
    this.top.id = 'vs-edge-top';
    this.top.setAttribute('data-vs-edge', 'top');
    this.bottom = document.createElement('div');
    this.bottom.id = 'vs-edge-bottom';
    this.bottom.setAttribute('data-vs-edge', 'bottom');
    document.body.appendChild(this.top);
    document.body.appendChild(this.bottom);
  }
  unmount(): void {
    this.top?.remove(); this.top = null;
    this.bottom?.remove(); this.bottom = null;
  }

  apply(p: AquaEngineParams | undefined, onPlayer: boolean): void {
    const show = !!(p && p.enabled && p.edgeFade) && !onPlayer;
    if (this.top) this.top.style.display = show ? 'block' : 'none';
    if (this.bottom) this.bottom.style.display = show ? 'block' : 'none';
  }

  get topEl(): HTMLDivElement | null { return this.top; }
  get bottomEl(): HTMLDivElement | null { return this.bottom; }
}
