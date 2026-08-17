import type { AquaEngineParams } from '../types';

const GLOW_RADIUS = 180;
const GLOW_FALLBACK = 'rgba(90, 215, 255, 0.17)';
const TILT_MAX = 0.0175;
const TILT_PERSPECTIVE = 800;
const SETTLE_MS = 240;
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
  private current: HTMLElement | null = null;
  private x = -9999;
  private y = -9999;
  private raf = 0;
  private observer: MutationObserver | null = null;
  private tilted = new Set<HTMLElement>();
  private settle = new Map<HTMLElement, number>();

  mount(): void {
    document.addEventListener('pointermove', this.onMove, { passive: true });
    document.addEventListener('pointerover', this.onOver, { passive: true });
    document.addEventListener('pointerout', this.onOut, { passive: true });
  }
  unmount(): void {
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerover', this.onOver);
    document.removeEventListener('pointerout', this.onOut);
    this.teardown();
  }

  apply(p: AquaEngineParams | undefined): void {
    const spot = !!(p && p.enabled && p.spotlight);
    const press = !!(p && p.enabled && p.press) && !REDUCE;
    this.on = spot;
    this.press = press;
    if (this.on && !press) {
      for (const el of this.tilted) this.easeBack(el);
    }
    this.stamp();
    if (!spot) this.teardown();
  }

  private keepGlow(): void {
    if (!this.on) return;
    for (const [el, glow] of this.glowMap) {
      if (!el.isConnected) {
        glow.remove();
        this.glowMap.delete(el);
        this.tilted.delete(el);
        const id = this.settle.get(el);
        if (id !== undefined) { clearTimeout(id); this.settle.delete(el); }
        if (this.current === el) this.current = null;
      }
    }
    for (const sel of SPOT_SELECTORS) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        if (!el.isConnected) continue;
        if (!this.glowMap.has(el)) {
          el.setAttribute('data-vs-spot', '');
          const glow = document.createElement('div');
          glow.className = 'vs-spot-glow';
          glow.setAttribute('aria-hidden', 'true');
          el.appendChild(glow);
          this.glowMap.set(el, glow);
        }
      }
    }
  }

  private stamp(): void {
    if (!this.on) return;
    if (this.observer === null) {
      this.observer = new MutationObserver(() => this.keepGlow());
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
    this.keepGlow();
    if (!this.press) return;
    for (const [el] of this.glowMap) {
      if (el.isConnected && el.getAttribute('data-vs-press') === null) el.setAttribute('data-vs-press', '');
    }
  }

  private teardown(): void {
    this.current = null;
    this.observer?.disconnect();
    this.observer = null;
    if (this.raf !== 0) { cancelAnimationFrame(this.raf); this.raf = 0; }
    for (const id of this.settle.values()) clearTimeout(id);
    this.settle.clear();
    this.tilted.clear();
    for (const [el, glow] of this.glowMap) {
      glow.remove();
      el.removeAttribute('data-vs-spot');
      el.removeAttribute('data-vs-press');
      el.style.removeProperty('transform');
      el.style.removeProperty('transform-origin');
    }
    this.glowMap.clear();
  }

  private easeBack(el: HTMLElement): void {
    if (!this.tilted.delete(el)) return;
    el.style.transform =
      `perspective(${TILT_PERSPECTIVE}px) rotateX(0rad) rotateY(0rad) scale(1)`;
    const id = window.setTimeout(() => {
      this.settle.delete(el);
      el.style.removeProperty('transform');
      el.style.removeProperty('transform-origin');
    }, SETTLE_MS);
    this.settle.set(el, id);
  }

  private onMove = (e: PointerEvent): void => {
    this.x = e.clientX;
    this.y = e.clientY;
    if (!this.on || this.raf !== 0) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this.on) return;
      for (const [el, glow] of this.glowMap) {
        const r = el.getBoundingClientRect();
        const inside = this.x >= r.left && this.x <= r.right && this.y >= r.top && this.y <= r.bottom;
        if (!inside) {
          glow.style.opacity = '0';
          this.easeBack(el);
          if (this.current === el) this.current = null;
          continue;
        }
        const px = this.x - r.left, py = this.y - r.top;
        glow.style.backgroundImage =
          `radial-gradient(${GLOW_RADIUS}px at ${px}px ${py}px, var(--vs-aqua-spot-color, ${GLOW_FALLBACK}), transparent 70%)`;
        glow.style.opacity = '1';
        this.current = el;
        if (this.press && r.width > 0 && r.height > 0) {
          const dx = Math.min(0.5, Math.max(-0.5, px / r.width - 0.5));
          const dy = Math.min(0.5, Math.max(-0.5, py / r.height - 0.5));
          el.style.transformOrigin = `${el.offsetWidth / 2}px ${el.offsetHeight / 2}px`;
          el.style.transform =
            `perspective(${TILT_PERSPECTIVE}px) rotateX(${TILT_MAX * -2 * dy}rad) rotateY(${TILT_MAX * 2 * dx}rad) scale(1.01)`;
          this.tilted.add(el);
        }
      }
    });
  };

  private onOver = (): void => {
    if (!this.on) return;
    this.current = this.hitSpot();
  };

  private onOut = (): void => {
    if (!this.on) return;
    const next = this.hitSpot();
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    if (prev !== null) {
      prev.removeAttribute('data-vs-press');
      prev.style.removeProperty('transform');
      prev.style.removeProperty('transform-origin');
      this.tilted.delete(prev);
      const id = this.settle.get(prev);
      if (id !== undefined) { clearTimeout(id); this.settle.delete(prev); }
    }
  };

  private hitSpot(): HTMLElement | null {
    const el = document.elementFromPoint(this.x, this.y);
    if (el === null) return null;
    return el.closest<HTMLElement>('[data-vs-spot]');
  }
}
