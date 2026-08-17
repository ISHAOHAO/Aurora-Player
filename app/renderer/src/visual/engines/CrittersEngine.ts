import type { AquaEngineParams } from '../types';
import fishLogoUrl from '../../../../../assets/Aurora_Player_logo.png';

/** CrittersEngine — 海洋生物层：logo 鱼形 + 气泡 + 浮游生物 + 粒子鲸鱼（60×60 亮度网格采样）。 */
const WHALE_SVG = `<svg width="24" height="18" viewBox="0 0 24 18" xmlns="http://www.w3.org/2000/svg">
<g fill="#ffffff">
  <ellipse cx="13" cy="9" rx="6" ry="3.8"/>
  <path d="M7 9 L2.5 4 L3.5 9 L2.5 14 Z"/>
  <path d="M11 4.8 L12.5 1.5 L14 5.2 Z"/>
  <path d="M12 13.2 L13.5 16.5 L15 13.2 Z"/>
</g>
<circle cx="17.5" cy="8" r="0.9" fill="#000000"/>
</svg>`;

const GRID = 60;
const UNIT = 0.18;
const LIGHT_X = 4.5;
const LIGHT_Y = 5.5;
const LIGHT_RANGE = 14;
const SHADE_MIN = 0.2;
const SHADE_MAX = 0.4 * 2.79;
const FOLLOW_X = 1.05;
const LOOSE = 1;
const MOUSE_RADIUS = 4.9;
const MOUSE_STRENGTH = 0.8;
const MOUSE_DECAY = 0.2;
const MOUSE_DISTORT = 5;
const FPS = 30;
const WORLD_H = 2 * 18 * Math.tan((50 * Math.PI) / 360);

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Particle {
  x: number;
  y: number;
  opacity: number;
  edge: number;
  sx: number;
  sy: number;
  sz: number;
}

function hash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

function smoothstep(a: number, b: number, t: number): number {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

function critter(kind: string, width: number, style: string, body: string): string {
  return `<span class="vs-critter" data-kind="${kind}" style="${style}" aria-hidden="true">${body}</span>`;
}

function fish(kind: string, style: string, width: number): string {
  return critter(kind, width, style, `<img src="${fishLogoUrl}" alt="" width="${width}" height="${Math.round(width * 1.003)}"/>`);
}

function bubble(style: string, size: number): string {
  return critter('bubble', size, style,
    '<svg viewBox="0 0 8 8" width="' + size + '" height="' + size + '"><circle cx="4" cy="4" r="3" fill="none" stroke="currentColor" stroke-width="1"/></svg>');
}

function plankton(style: string): string {
  return critter('plankton', 3, style,
    '<svg viewBox="0 0 3 3" width="3" height="3"><circle cx="1.5" cy="1.5" r="1.5" fill="currentColor"/></svg>');
}

const CRITTERS = [
  fish('fish', 'top:22%;left:58%;animation-duration:9s', 30),
  fish('fish-left', 'top:36%;left:10%;animation-duration:14s;animation-delay:-4s', 20),
  fish('fish', 'top:64%;left:76%;animation-duration:19s;animation-delay:-9s;opacity:0.55', 14),
  bubble('bottom:8%;left:9%;animation-duration:8s', 7),
  bubble('bottom:5%;left:13%;animation-duration:10s;animation-delay:2.5s', 5),
  bubble('bottom:10%;left:17%;animation-duration:9s;animation-delay:5s', 6),
  bubble('bottom:9%;left:82%;animation-duration:11s;animation-delay:1.5s', 8),
  bubble('bottom:6%;left:87%;animation-duration:8s;animation-delay:4s', 5),
  plankton('top:14%;left:42%;animation-delay:-1s'),
  plankton('top:32%;left:70%;animation-delay:-3s'),
  plankton('top:72%;left:18%;animation-delay:-2s'),
  plankton('top:56%;left:86%;animation-delay:-4s'),
].join('');

export class CrittersEngine {
  private root: HTMLDivElement | null = null;
  private whale: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private img: HTMLImageElement | null = null;
  private raf = 0;
  private running = false;
  private active = false;
  private disposed = false;
  private dark = true;
  private startedAt = 0;
  private last = 0;
  private mouseWorld = { x: 0, y: 0 };
  private mouseNdc = { x: 0, y: 0 };
  private dpr = 1;
  private scale = 1;
  private width = 0;
  private height = 0;

  mount(container: HTMLElement): void {
    if (this.root) return;
    this.disposed = false;
    this.root = document.createElement('div');
    this.root.className = 'vs-critters';
    this.root.innerHTML = CRITTERS;
    this.whale = document.createElement('div');
    this.whale.className = 'vs-whale';
    this.whale.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas');
    this.whale.appendChild(this.canvas);
    this.root.appendChild(this.whale);
    this.ctx = this.canvas.getContext('2d');
    container.appendChild(this.root);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('pointermove', this.onMove, { passive: true });
    this.resize();
    this.img = new Image();
    this.img.onload = this.onImageLoad;
    this.img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(WHALE_SVG)}`;
  }
  unmount(): void {
    this.disposed = true;
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('pointermove', this.onMove);
    if (this.img) this.img.onload = null;
    this.root?.remove();
    this.root = null; this.whale = null; this.canvas = null; this.ctx = null; this.img = null;
    this.particles = [];
  }

  apply(p: AquaEngineParams | undefined, onPlayer: boolean): void {
    // 播放页 Video First：logo 鱼形/气泡/浮游生物整体隐藏，不盖在视频上；仅浏览态（首页/设置）显示
    const show = !!(p && p.enabled && p.critters) && !onPlayer;
    const showWhale = show && !!p?.whale;
    if (this.root) this.root.style.display = show ? 'block' : 'none';
    if (this.whale) this.whale.style.display = showWhale ? 'block' : 'none';
    if (this.root) this.root.style.opacity = '1';
    this.dark = document.documentElement.dataset.theme !== 'light';
    if (this.whale) this.whale.dataset.scheme = this.dark ? 'dark' : 'light';
    this.active = showWhale;
    if (showWhale) {
      this.resize();
      if (REDUCE) {
        if (this.particles.length > 0) this.draw(1, 2);
      } else {
        this.start();
      }
    } else {
      this.stop();
    }
  }

  private onResize = () => {
    this.resize();
    if (REDUCE && this.active && this.particles.length > 0) this.draw(1, 2);
  };

  private onVis = (): void => {
    if (document.hidden) { this.stop(); return; }
    if (this.active) {
      if (REDUCE) {
        if (this.particles.length > 0) this.draw(1, 2);
      } else {
        this.start();
      }
    }
  };

  private onMove = (event: PointerEvent): void => {
    const el = this.whale;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.mouseNdc = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    };
  };

  private positionHost(): void {
    const el = this.whale;
    if (!el) return;
    const size = Math.round(Math.max(220, Math.min(660, window.innerHeight * 0.76, window.innerWidth * 0.8)));
    const left = Math.round(window.innerWidth / 2);
    const top = Math.round(window.innerHeight / 2);
    if (el.style.width !== `${size}px`) el.style.width = `${size}px`;
    if (el.style.height !== `${size}px`) el.style.height = `${size}px`;
    if (el.style.left !== `${left}px`) el.style.left = `${left}px`;
    if (el.style.top !== `${top}px`) el.style.top = `${top}px`;
  }

  private resize(): void {
    this.positionHost();
    const el = this.whale, c = this.canvas;
    if (!el || !c) return;
    const rect = el.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    c.width = Math.max(1, Math.round(this.width * this.dpr));
    c.height = Math.max(1, Math.round(this.height * this.dpr));
    this.scale = this.height / WORLD_H;
  }

  private onImageLoad = (): void => {
    const img = this.img;
    if (this.disposed || !img) return;
    this.sample(img);
    this.resize();
    if (this.active) {
      if (REDUCE) {
        if (this.particles.length > 0) this.draw(1, 2);
      } else {
        this.start();
      }
    }
  };

  private sample(img: HTMLImageElement): void {
    const off = document.createElement('canvas');
    off.width = GRID;
    off.height = GRID;
    const octx = off.getContext('2d');
    if (octx === null) return;
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, GRID, GRID);
    const fit = Math.min(GRID / img.width, GRID / img.height);
    const w = img.width * fit;
    const h = img.height * fit;
    octx.drawImage(img, (GRID - w) / 2, (GRID - h) / 2, w, h);
    const data = octx.getImageData(0, 0, GRID, GRID).data;
    const lum = new Float32Array(GRID * GRID);
    for (let i = 0; i < GRID * GRID; i++) {
      lum[i] = (0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2]) / 255;
    }
    const hasBrightNeighbor = (x: number, y: number): boolean => {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
          if (lum[ny * GRID + nx] > 0.2) return true;
        }
      }
      return false;
    };
    this.particles.length = 0;
    for (let e = 0; e < GRID; e++) {
      for (let n = 0; n < GRID; n++) {
        const a = lum[e * GRID + n];
        if (a <= 0.2 || !hasBrightNeighbor(n, e)) continue;
        const x = (n - GRID / 2) * UNIT;
        const y = (GRID / 2 - e) * UNIT;
        let edge = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = n + dx;
            const ny = e + dy;
            if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || lum[ny * GRID + nx] <= 0.2) edge++;
          }
        }
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.acos(2 * Math.random() - 1);
        const rad = 3 * (0.4 + 0.6 * Math.random());
        this.particles.push({
          x,
          y,
          opacity: a,
          edge: edge / 8,
          sx: Math.sin(theta) * Math.cos(phi) * rad,
          sy: Math.sin(theta) * Math.sin(phi) * rad,
          sz: Math.cos(theta) * rad * 0.5,
        });
      }
    }
  }

  private draw(assembly: number, time: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.width === 0 || this.height === 0) this.resize();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    const targetX = this.mouseWorld.x;
    const targetY = this.mouseWorld.y;
    const lightX = LIGHT_X + targetX * FOLLOW_X;
    const lightY = LIGHT_Y;
    const mouseRadius = MOUSE_RADIUS;
    const strength = MOUSE_STRENGTH;
    const size = Math.max(1.1, 0.06 * this.scale * this.dpr);
    const breathe = 0.15 * Math.sin(0.4 * time);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const loose = LOOSE * (0.25 + 0.75 * p.edge) * assembly;
      let px = p.x + hash(i) * 0.05 * loose;
      let py = p.y + hash(i * 1.37 + 7) * 0.05 * loose;
      px += Math.sin(time * 0.5 + i * 0.53) * 0.06 * loose;
      py += Math.cos(time * 0.42 + i * 0.71) * 0.06 * loose;
      const tail = smoothstep(0.5, 4.5, p.x) * LOOSE * assembly;
      py += Math.sin(time * 1.1 - p.x * 0.7) * 0.1 * tail;
      px += Math.cos(time * 0.9 - p.x * 0.55) * 0.06 * tail;
      px = p.sx + (px - p.sx) * assembly;
      py = p.sy + (py - p.sy) * assembly;
      if (assembly > 0.8) {
        const mouseEffect = (assembly - 0.8) * 5;
        const mx = px - targetX;
        const my = py - targetY;
        const dist = Math.sqrt(mx * mx + my * my);
        if (dist < mouseRadius && dist > 0.001) {
          const t = 1 - dist / mouseRadius;
          const force = t * t * t * mouseEffect * strength;
          const angle = Math.sin(i * 0.37 + time * 0.5) * MOUSE_DISTORT;
          const ca = Math.cos(angle);
          const sa = Math.sin(angle);
          const ux = mx / dist;
          const uy = my / dist;
          const rx = ux * ca - uy * sa;
          const ry = ux * sa + uy * ca;
          px += rx * force * 2;
          py += ry * force * 2;
        }
      }
      const ldx = px - lightX;
      const ldy = py - lightY;
      const lit = Math.min(1, Math.max(0, 1 - Math.sqrt(ldx * ldx + ldy * ldy) / LIGHT_RANGE));
      const vLight = SHADE_MIN + SHADE_MAX * lit * lit;
      const dist = Math.sqrt(px * px + py * py);
      const glow = smoothstep(8, 0, dist) * 0.3 * assembly;
      const baseAlpha = 0.45 + 0.3 * assembly;
      const shimmer = Math.sin(time * 1.5 + px * 5 + py * 3) * 0.1 + 0.9;
      const alpha = p.opacity * (baseAlpha + glow) * shimmer * Math.min(vLight, 1);
      const br = this.dark ? 0.75 : 0.42;
      const bg = this.dark ? 0.8 : 0.44;
      const bb = this.dark ? 0.9 : 0.47;
      const r = Math.min(255, Math.round((br * assembly + glow * 0.2) * vLight * 255));
      const g = Math.min(255, Math.round((bg * assembly + glow * 0.3) * vLight * 255));
      const b = Math.min(255, Math.round((bb * assembly + glow * 0.5) * vLight * 255));
      if (alpha <= 0.004) continue;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
      const sx = this.width / 2 + px * this.scale - size / 2;
      const sy = this.height / 2 - (py + breathe) * this.scale - size / 2;
      ctx.fillRect(sx, sy, size, size);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private start(): void {
    if (this.running || !this.ctx) return;
    this.running = true;
    this.startedAt = performance.now();
    this.last = 0;
    this.raf = requestAnimationFrame(this.tick);
  }
  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (this.disposed) return;
    if (now - this.last < 1000 / FPS) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    if (!this.running) return;
    this.last = now - ((now - this.last) % (1000 / FPS));
    this.positionHost();
    const elapsed = (now - this.startedAt) / 1000;
    const raw = Math.min(1, Math.max(0, (elapsed - 0.3) / 2.5));
    const D = 1 - Math.pow(1 - raw, 3);
    const assembly = smoothstep(0, 1, D);
    const targetX = (this.mouseNdc.x * WORLD_H) / 2;
    const targetY = (this.mouseNdc.y * WORLD_H) / 2;
    this.mouseWorld.x += (targetX - this.mouseWorld.x) * MOUSE_DECAY;
    this.mouseWorld.y += (targetY - this.mouseWorld.y) * MOUSE_DECAY;
    this.draw(assembly, elapsed);
    this.raf = requestAnimationFrame(this.tick);
  };

  get element(): HTMLDivElement | null { return this.root; }
}
