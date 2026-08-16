import type { AquaEngineParams } from '../types';

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Critter { el: HTMLSpanElement; kind: string; }

export class CrittersEngine {
  private root: HTMLDivElement | null = null;
  private whaleCanvas: HTMLCanvasElement | null = null;
  private whaleCtx: CanvasRenderingContext2D | null = null;
  private critters: Critter[] = [];
  private raf = 0;
  private running = false;
  private last = 0;
  private on = false;
  private onPlayer = false;

  mount(container: HTMLElement): void {
    if (this.root) return;
    this.root = document.createElement('div');
    this.root.className = 'vs-critters';
    this.whaleCanvas = document.createElement('canvas');
    this.whaleCanvas.className = 'vs-whale';
    this.root.appendChild(this.whaleCanvas);
    this.whaleCtx = this.whaleCanvas.getContext('2d');
    const kinds: [string, number][] = [
      ['fish', 2], ['fish-left', 1], ['bubble', 4], ['plankton', 5],
    ];
    for (const [kind, n] of kinds) {
      for (let i = 0; i < n; i++) {
        const el = document.createElement('span');
        el.className = 'vs-critter';
        el.dataset.kind = kind;
        el.textContent = kind.startsWith('bubble') ? '○' : kind === 'fish' || kind === 'fish-left' ? '◀' : '·';
        el.style.left = `${6 + Math.random() * 88}%`;
        el.style.top = `${10 + Math.random() * 78}%`;
        el.style.animationDelay = `${-Math.random() * 20}s`;
        el.style.animationDuration = `${8 + Math.random() * 12}s`;
        this.root.appendChild(el);
        this.critters.push({ el, kind });
      }
    }
    container.appendChild(this.root);
    window.addEventListener('resize', this.onResize);
  }
  unmount(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.root?.remove(); this.root = null; this.whaleCanvas = null; this.whaleCtx = null; this.critters = [];
  }

  apply(p: AquaEngineParams | undefined, onPlayer: boolean): void {
    this.onPlayer = onPlayer;
    const show = !!(p && p.enabled && p.critters);
    const showWhale = show && p?.whale && !onPlayer;
    if (this.root) this.root.style.display = show ? 'block' : 'none';
    if (this.whaleCanvas) this.whaleCanvas.style.display = showWhale ? 'block' : 'none';
    if (this.root && onPlayer) this.root.style.opacity = '0.5';
    if (showWhale) this.start();
    else this.stop();
  }

  private onResize = () => { this.resizeWhale(); };

  private resizeWhale(): void {
    const c = this.whaleCanvas, ctx = this.whaleCtx;
    if (!c || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.36;
    c.width = Math.floor(size * dpr);
    c.height = Math.floor(size * 0.6 * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.tick);
  }
  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (t: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const c = this.whaleCanvas, ctx = this.whaleCtx;
    if (!this.running || !c || !ctx) return;
    const dt = Math.min(50, t - this.last || 16); this.last = t;
    ctx.clearRect(0, 0, c.width, c.height);
    const dark = document.documentElement.dataset.theme !== 'light';
    const col = dark ? 'rgba(220,232,250,0.55)' : 'rgba(38,58,92,0.45)';
    const w = c.width, h = c.height;
    const cx = w / 2, cy = h / 2;
    ctx.fillStyle = col;
    const n = 110;
    for (let i = 0; i < n; i++) {
      const ph = (i / n) * Math.PI * 2;
      const und = Math.sin(ph * 3 + t * 0.001) * h * 0.045;
      const body = Math.sin(ph) * Math.PI;
      const rad = (body > 0 ? Math.sin(body) : 0) * w * 0.3;
      const tail = body < 0 ? Math.sin(body * 2.2) * w * 0.12 : 0;
      const px = cx + Math.cos(ph) * w * 0.34 + (body < 0 ? tail : 0);
      const py = cy + Math.sin(ph) * h * 0.22 + und;
      ctx.beginPath();
      ctx.arc(px, py, 1.1 + rad * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
    void dt;
  };

  get element(): HTMLDivElement | null { return this.root; }
}
