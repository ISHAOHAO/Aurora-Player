import type { AquaEngineParams } from '../types';

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const SPOT_SELECTORS = [
  '.topbar', '.hero-card', '.tile', '.poster .cover', '.url-modal', '.nas-browser',
  '.control-deck', '.top-info', '.pop-menu', '.console-drawer', '.cast-toast', '.win-float',
  '.settings-topbar', '.settings-nav',
];

export class SpotlightEngine {
  private on = false;
  private press = false;
  private glowMap = new Map<HTMLElement, HTMLDivElement>();
  private x = -9999;
  private y = -9999;

  mount(): void {
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerdown', this.onMove, { passive: true });
  }
  unmount(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onMove);
    this.teardown();
  }

  apply(p: AquaEngineParams | undefined): void {
    const spot = !!(p && p.enabled && p.spotlight);
    const press = !!(p && p.enabled && p.press) && !REDUCE;
    this.on = spot;
    this.press = press;
    this.stamp();
    if (!spot) this.teardown();
  }

  private stamp(): void {
    if (!this.on) return;
    const found = new Set<HTMLElement>();
    for (const sel of SPOT_SELECTORS) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        found.add(el);
        if (el.getAttribute('data-vs-spot') === null) {
          el.setAttribute('data-vs-spot', '');
          const glow = document.createElement('div');
          glow.className = 'vs-spot-glow';
          el.appendChild(glow);
          this.glowMap.set(el, glow);
        }
      }
    }
    for (const el of Array.from(found)) {
      if (this.press && el.getAttribute('data-vs-press') === null) el.setAttribute('data-vs-press', '');
    }
  }

  private teardown(): void {
    for (const [el, glow] of this.glowMap) { glow.remove(); el.removeAttribute('data-vs-spot'); el.removeAttribute('data-vs-press'); }
    this.glowMap.clear();
  }

  private onMove = (e: PointerEvent): void => {
    this.x = e.clientX;
    this.y = e.clientY;
    if (!this.on) return;
    for (const [el, glow] of this.glowMap) {
      const r = el.getBoundingClientRect();
      const inside = this.x >= r.left && this.x <= r.right && this.y >= r.top && this.y <= r.bottom;
      if (!inside) {
        glow.style.opacity = '0';
        if (this.press) el.style.transform = '';
        continue;
      }
      const px = this.x - r.left, py = this.y - r.top;
      glow.style.background = `radial-gradient(420px 240px at ${px}px ${py}px, var(--vs-aqua-spot-color, rgba(110,155,232,.16)), transparent 70%)`;
      glow.style.opacity = '1';
      if (this.press && r.width > 0 && r.height > 0) {
        const rx = ((py / r.height) - 0.5) * -3;
        const ry = ((px / r.width) - 0.5) * 3;
        el.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      }
    }
  };
}
