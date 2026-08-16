/**
 * engines/ParticleEngine.ts — 单 Canvas 粒子（对象池 + 单 rAF）
 * 主题粒子人格：每主题提供数据（color/glow/blur/foregroundRatio/distribution/motion/usePalette），
 * 本引擎负责渲染 —— 前景/中景/背景三层、柔光、空间分布、运动性格。
 *
 * - DPR ≤ 1.5；数量按状态预算封顶，且 density 真实影响数量（count = cap × density）
 * - route 离开 player / reduced-motion / 页面隐藏 → 停帧
 * - 画面中心避让（始终生效，视频主体保护）
 */
import type { EngineParams } from '../types';

interface LayerP { x: number; y: number; size: number; vx: number; vy: number; a: number; tw: number; depth: number; layer: 0 | 1 | 2; ci: number; phase: number; }
interface RGB { r: number; g: number; b: number; }

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function mix(a: RGB, b: RGB, k: number): RGB { return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k }; }
function rgbaStr(c: RGB, a: number): string { return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${Math.max(0, Math.min(1, a)).toFixed(3)})`; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function gauss(): number { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

export class ParticleEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private ps: LayerP[] = [];
  private cfg: EngineParams['particles'] = { enabled: false, density: 0, speed: 0.3, size: 0.5, opacity: 0.4, depth: 0.5, reaction: 0.3 };
  private colors: RGB[] = [hexToRgb('#ffffff')];
  private anchors: { x: number; y: number; r: number }[] = [];
  private cap = 180;
  private running = false;
  private raf = 0;
  private last = 0;
  private cursor = { x: -9999, y: -9999 };

  mount(container: HTMLElement): void {
    if (this.canvas) return;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vs-particles';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVis);
  }
  unmount(): void {
    this.stop();
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
    this.canvas?.remove();
    this.canvas = null; this.ctx = null;
  }

  private onMove = (e: PointerEvent) => { this.cursor.x = e.clientX; this.cursor.y = e.clientY; };
  private onResize = () => { this.resize(); this.spawn(); };
  private onVis = () => { if (document.hidden) this.stop(); else if (this.cfg.enabled && !REDUCE) this.start(); };

  apply(p: EngineParams['particles'], cap: number): void {
    this.cfg = p;
    this.cap = cap;
    this.colors = this.resolveColors();
    this.anchors = this.makeAnchors();
    this.resize();
    this.spawn();
    if (p.enabled && cap > 0 && !REDUCE) this.start();
    else this.stop(true);
  }

  /** 读取活动主题的完整粒子人格（主题数据 → 本引擎渲染；store 为单一来源） */
  private profile(): Record<string, unknown> {
    try {
      const t = (window as unknown as { __VISUAL__?: { store?: { getActiveTheme?: () => { particles?: Record<string, unknown> } } } }).__VISUAL__?.store?.getActiveTheme?.();
      return (t?.particles as Record<string, unknown>) || {};
    } catch { return {}; }
  }

  /** 颜色：usePalette 时从 cover/frame 调色板（环境光斑颜色）提取；否则用主题主色/次色 + 混合 */
  private resolveColors(): RGB[] {
    const prof = this.profile();
    if (prof.usePalette) {
      const pal = this.readPaletteFromLights();
      if (pal.length >= 2) return pal;
    }
    const prim = hexToRgb(String(prof.color ?? '#ffffff'));
    const sec = hexToRgb(String(prof.colorSecondary ?? prof.color ?? '#ffffff'));
    return [prim, sec, mix(prim, sec, 0.5)];
  }

  /** 从环境光斑（已由 cover/frame 调色板染色的 light blob）提取 2 个颜色 */
  private readPaletteFromLights(): RGB[] {
    try {
      const blobs = document.querySelectorAll('.vs-light-blob');
      const out: RGB[] = [];
      for (const b of Array.from(blobs).slice(0, 2)) {
        const m = /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(getComputedStyle(b).backgroundImage || '');
        if (m) out.push({ r: +m[1], g: +m[2], b: +m[3] });
      }
      // 提亮并去饱和，避免粒子与背景光同色过重
      return out.map((c) => mix(c, { r: 255, g: 255, b: 255 }, 0.25));
    } catch { return []; }
  }

  private makeAnchors(): { x: number; y: number; r: number }[] {
    const w = window.innerWidth, h = window.innerHeight;
    const r = Math.min(w, h) * 0.1;
    return [
      { x: w * 0.12, y: h * 0.2, r },
      { x: w * 0.85, y: h * 0.7, r },
      { x: w * 0.75, y: h * 0.15, r },
    ];
  }

  private resize(): void {
    if (!this.canvas || !this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** 数量真实随 density 变化（预算内）：count = cap × density × 0.9 */
  private spawn(): void {
    const prof = this.profile();
    const density = Number(prof.density ?? this.cfg.density) || 0;
    const n = Math.max(0, Math.min(Math.round(this.cap * density * 0.9), this.cap));
    while (this.ps.length < n) this.ps.push(this.newP());
    if (this.ps.length > n) this.ps.length = n;
  }

  private newP(): LayerP {
    const prof = this.profile();
    const w = window.innerWidth, h = window.innerHeight;
    const dist = prof.distribution ?? 'uniform';
    let x: number, y: number;
    if (dist === 'clustered') {
      const a = this.anchors[Math.floor(Math.random() * this.anchors.length)];
      x = clamp(a.x + gauss() * a.r, 4, w - 4); y = clamp(a.y + gauss() * a.r * 0.6, 4, h - 4);
    } else if (dist === 'uneven') {
      if (Math.random() < 0.45) {
        const a = this.anchors[Math.floor(Math.random() * this.anchors.length)];
        x = clamp(a.x + gauss() * a.r, 4, w - 4); y = clamp(a.y + gauss() * a.r * 0.6, 4, h - 4);
      } else {
        // 边缘偏置（中心稀疏、边角略密），不产生明显云团
        x = Math.random() < 0.5 ? Math.random() * 0.28 * w : (0.72 + Math.random() * 0.28) * w;
        y = Math.random() < 0.5 ? Math.random() * 0.3 * h : (0.7 + Math.random() * 0.3) * h;
      }
    } else {
      x = Math.random() * w; y = Math.random() * h;
    }

    const depth = Number(prof.depth ?? this.cfg.depth) || 0.5;
    const fr = clamp(Number(prof.foregroundRatio ?? 0.05), 0, 0.08);
    const r = Math.random();
    const layer: 0 | 1 | 2 = r < fr ? 2 : r < 0.58 ? 0 : 1;
    const baseSize = (0.6 + Math.random() * 1.6) * Number(prof.size ?? this.cfg.size);
    const size = baseSize * (layer === 2 ? 2.0 : layer === 0 ? 0.6 : 1.0) * (0.7 + depth * 0.4);
    const alpha = (0.35 + Math.random() * 0.65) * Number(prof.opacity ?? this.cfg.opacity) * (layer === 2 ? 1.5 : layer === 0 ? 0.85 : 1.0);

    const motion = prof.motion ?? 'drift';
    const motionMul = motion === 'dust' ? 0.6 : motion === 'flow' ? 1.25 : 1.0;
    const layerSpeed = layer === 2 ? (motion === 'drift' || motion === 'flow' ? 1.25 : 0.55) : layer === 0 ? 0.7 : 1.0;
    const sp = Number(prof.speed ?? this.cfg.speed) * motionMul * layerSpeed * (1 + depth * 0.5);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const vx = (Math.random() - 0.5) * 2 * sp + (motion === 'flow' ? dir * sp * 0.35 : 0);
    const vy = (Math.random() - 0.5) * 1.6 * sp;

    const ci = layer === 2 ? 0 : layer === 0 ? (this.colors.length > 1 ? 1 : 0) : Math.floor(Math.random() * Math.min(3, this.colors.length));
    return { x, y, size: Math.max(0.4, size), vx, vy, a: alpha, tw: Math.random() * Math.PI * 2, depth, layer, ci, phase: Math.random() * Math.PI * 2 };
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.tick);
  }
  private stop(clear = false): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (clear && this.ctx) { this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
  }

  private tick = (t: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    if (!this.running || !this.ctx) return;
    const dt = Math.min(40, t - this.last || 16); this.last = t;
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const prof = this.profile();
    const glow = Number(prof.glow ?? 0.2);
    const blur = Number(prof.blur ?? 1);
    const motion = prof.motion ?? 'drift';
    const r = 90 + Number(prof.reaction ?? this.cfg.reaction) * 220;
    const useReact = Number(prof.reaction ?? this.cfg.reaction) > 0;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const hasCursor = this.cursor.x > -1000;

    for (const p of this.ps) {
      p.tw += dt * 0.001;
      p.x += p.vx * dt * 0.03;
      p.y += p.vy * dt * 0.03;
      if (motion === 'flow') p.y += Math.sin(p.tw * 0.8 + p.phase) * dt * 0.015 * (p.layer === 2 ? 1.6 : 0.6);
      if (useReact) {
        const near = hasCursor ? this.cursor : { x: cx, y: cy };
        const dx = p.x - near.x, dy = p.y - near.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / r) * 0.8 * Number(prof.reaction ?? this.cfg.reaction);
          p.x += (dx / d) * f * 3;
          p.y += (dy / d) * f * 3;
        }
      }
      if (p.x < -10) p.x = window.innerWidth + 10; else if (p.x > window.innerWidth + 10) p.x = -10;
      if (p.y < -10) p.y = window.innerHeight + 10; else if (p.y > window.innerHeight + 10) p.y = -10;

      // 中心避让（始终生效）：中心区域透明度压低，不遮挡主体
      const dcx = Math.abs(p.x - cx) / (window.innerWidth / 2);
      const dcy = Math.abs(p.y - cy) / (window.innerHeight / 2);
      const centerFactor = Math.max(0, Math.min(1, Math.max(dcx, dcy) * 1.5 - 0.4));
      const centerDim = hasCursor ? 0.5 + 0.5 * centerFactor : 0.22 + 0.78 * centerFactor;
      const alpha = p.a * (0.75 + Math.sin(p.tw) * 0.25) * centerDim;
      if (alpha <= 0.005) continue;

      const color = this.colors[p.ci] || this.colors[0];
      if (p.layer === 2 && glow > 0) {
        // 前景：柔光（径向渐变，软边 ≈ blur）
        const outer = p.size * (1 + (glow + blur * 0.5) * 1.4);
        const g = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, outer);
        g.addColorStop(0, rgbaStr(color, alpha));
        g.addColorStop(0.45, rgbaStr(color, alpha * 0.4));
        g.addColorStop(1, rgbaStr(color, 0));
        this.ctx.fillStyle = g;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, outer, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        // 中/背景：实点（背景更暗更小）
        const dim = p.layer === 0 ? 0.6 : 1;
        this.ctx.fillStyle = rgbaStr(color, alpha * dim);
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  };
}
