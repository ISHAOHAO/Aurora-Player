import type { AquaEngineParams } from '../types';

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(hover: none), (pointer: coarse)').matches;

const SPACING = 90;
const REPEL_RADIUS = 140;
const REPEL_FORCE = 30;
const SPRING = 0.05;
const DAMPING = 0.85;
const LINE_GAP = 10;
const MIN_LINE_DIST = 20;
const LINE_COLOR = 'rgba(60, 100, 160, ';
const LINE_ALPHA = 0.1;
const DOT_ALPHA = 0.2;
const FPS = 30;

interface Dot { restX: number; restY: number; x: number; y: number; vx: number; vy: number; }

export class MeshEngine {
  private root: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dots: Dot[] = [];
  private cols = 0;
  private rows = 0;
  private w = 0;
  private h = 0;
  private raf = 0;
  private running = false;
  private idle = false;
  private visible = true;
  private resizeTimer = 0;
  private last = 0;
  private mouse = { x: NaN, y: NaN };
  private on = false;
  private observer: IntersectionObserver | null = null;

  mount(container: HTMLElement): void {
    if (this.root) return;
    this.root = document.createElement('canvas');
    this.root.className = 'vs-mesh';
    container.appendChild(this.root);
    this.ctx = this.root.getContext('2d');
    if (!this.ctx) { this.root.remove(); this.root = null; return; }
    window.addEventListener('pointermove', this.onMove, { passive: true });
    this.resize();
    this.build();
    this.renderStatic();
    this.observer = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.wake();
    }, { threshold: 0 });
    this.observer.observe(this.root);
  }
  unmount(): void {
    this.stop();
    window.removeEventListener('pointermove', this.onMove);
    window.clearTimeout(this.resizeTimer);
    this.observer?.disconnect(); this.observer = null;
    this.root?.remove(); this.root = null; this.ctx = null;
  }

  apply(p: AquaEngineParams | undefined): void {
    const show = !!(p && p.enabled && p.mesh);
    this.on = show;
    if (this.root) this.root.style.display = show ? 'block' : 'none';
    if (!show) { this.stop(); return; }
    if (REDUCE || COARSE) { this.renderStatic(); return; }
    this.start();
  }

  private onMove = (e: PointerEvent) => {
    if (REDUCE || COARSE) return;
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.wake();
  };

  private resize(): void {
    if (!this.root) return;
    const cw = this.root.clientWidth, ch = this.root.clientHeight;
    if (cw === this.w && ch === this.h) return;
    this.w = cw; this.h = ch;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.root.width = Math.max(1, Math.round(cw * dpr));
    this.root.height = Math.max(1, Math.round(ch * dpr));
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => { this.build(); this.renderStatic(); }, 150);
  }

  private build(): void {
    this.cols = Math.ceil(this.w / SPACING) + 1;
    this.rows = Math.ceil(this.h / SPACING) + 1;
    const startX = (this.w - (this.cols - 1) * SPACING) / 2;
    const startY = (this.h - (this.rows - 1) * SPACING) / 2;
    this.dots = [];
    for (let ry = 0; ry < this.rows; ry++) {
      for (let rx = 0; rx < this.cols; rx++) {
        const x = startX + SPACING * rx, y = startY + SPACING * ry;
        this.dots.push({ restX: x, restY: y, x, y, vx: 0, vy: 0 });
      }
    }
  }

  private renderStatic(): void {
    const ctx = this.ctx;
    if (!ctx || this.w === 0) return;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.strokeStyle = `${LINE_COLOR}${LINE_ALPHA})`;
    ctx.lineWidth = 0.5;
    for (let ry = 0; ry < this.rows; ry++) {
      for (let rx = 0; rx < this.cols - 1; rx++) {
        const a = this.dots[ry * this.cols + rx], b = this.dots[ry * this.cols + rx + 1];
        ctx.beginPath();
        ctx.moveTo(a.x + LINE_GAP, a.y);
        ctx.lineTo(b.x - LINE_GAP, b.y);
        ctx.stroke();
      }
    }
    for (let ry = 0; ry < this.rows - 1; ry++) {
      for (let rx = 0; rx < this.cols; rx++) {
        const a = this.dots[ry * this.cols + rx], b = this.dots[(ry + 1) * this.cols + rx];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y + LINE_GAP);
        ctx.lineTo(b.x, b.y - LINE_GAP);
        ctx.stroke();
      }
    }
    ctx.fillStyle = `${LINE_COLOR}${DOT_ALPHA})`;
    for (const dot of this.dots) ctx.fillRect(dot.x - 1.8, dot.y - 1.8, 3.6, 3.6);
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }
  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  private wake(): void {
    if (!this.idle) return;
    this.idle = false;
    if (this.running) { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.frame); }
  }

  private frame = (now: number): void => {
    this.raf = 0;
    const ctx = this.ctx;
    if (!this.running || !this.on || !ctx) return;
    if (!this.visible || now - this.last < 1000 / FPS) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.last = now - (now - this.last) % (1000 / FPS);
    this.resize();
    if (this.w === 0) { this.raf = requestAnimationFrame(this.frame); return; }
    ctx.clearRect(0, 0, this.w, this.h);
    const mx = this.mouse.x, my = this.mouse.y;
    let maxV = 0;
    for (const dot of this.dots) {
      if (!Number.isNaN(mx) && !Number.isNaN(my)) {
        const dx = dot.x - mx, dy = dot.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < REPEL_RADIUS && dist > 0.1) {
          const force = (1 - dist / REPEL_RADIUS) * REPEL_FORCE;
          dot.vx += (dx / dist) * force * 0.1;
          dot.vy += (dy / dist) * force * 0.1;
        }
      }
      const sx = dot.restX - dot.x, sy = dot.restY - dot.y;
      dot.vx += SPRING * sx;
      dot.vy += SPRING * sy;
      dot.vx *= DAMPING;
      dot.vy *= DAMPING;
      dot.x += dot.vx;
      dot.y += dot.vy;
      const v = Math.abs(dot.vx) + Math.abs(dot.vy);
      if (v > maxV) maxV = v;
    }
    ctx.strokeStyle = `${LINE_COLOR}${LINE_ALPHA})`;
    ctx.lineWidth = 0.5;
    for (let ry = 0; ry < this.rows; ry++) {
      for (let rx = 0; rx < this.cols - 1; rx++) {
        const a = this.dots[ry * this.cols + rx], b = this.dots[ry * this.cols + rx + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_LINE_DIST) continue;
        const ux = dx / dist, uy = dy / dist;
        ctx.beginPath();
        ctx.moveTo(a.x + LINE_GAP * ux, a.y + LINE_GAP * uy);
        ctx.lineTo(b.x - LINE_GAP * ux, b.y - LINE_GAP * uy);
        ctx.stroke();
      }
    }
    for (let ry = 0; ry < this.rows - 1; ry++) {
      for (let rx = 0; rx < this.cols; rx++) {
        const a = this.dots[ry * this.cols + rx], b = this.dots[(ry + 1) * this.cols + rx];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_LINE_DIST) continue;
        const ux = dx / dist, uy = dy / dist;
        ctx.beginPath();
        ctx.moveTo(a.x + LINE_GAP * ux, a.y + LINE_GAP * uy);
        ctx.lineTo(b.x - LINE_GAP * ux, b.y - LINE_GAP * uy);
        ctx.stroke();
      }
    }
    ctx.fillStyle = `${LINE_COLOR}${DOT_ALPHA})`;
    for (const dot of this.dots) {
      let r = 1.8, alpha = DOT_ALPHA;
      if (!Number.isNaN(mx) && !Number.isNaN(my)) {
        const dx = dot.x - mx, dy = dot.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const near = Math.max(0, 1 - dist / REPEL_RADIUS);
        r = 1.8 + 2 * near;
        alpha = DOT_ALPHA + 0.4 * near;
      }
      ctx.globalAlpha = alpha;
      ctx.fillRect(dot.x - r, dot.y - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1;
    if (maxV < 0.01) this.idle = true;
    else this.raf = requestAnimationFrame(this.frame);
  };
}
