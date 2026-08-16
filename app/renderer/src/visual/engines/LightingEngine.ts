/**
 * engines/LightingEngine.ts — 环境光池
 * 职责：
 *  1. 渲染环境光层（3 个径向光斑，screen 混合）
 *  2. 视觉光源管理（修正 5）：Cover Palette / Frame Palette / Manual
 *     - Home/Library：本地 poster 32×32 降采样，按 fileId 缓存
 *     - Player：现有 getThumb() 代表帧，≤1 次/2s 节流 + 按 media 缓存 + 色彩平滑
 *  3. palette 就绪后通过 onPalette 回调（Provider 重新 resolve）
 */
import type { EngineParams, PaletteColors } from '../types';
import { paletteFromImage } from '../resolver';

export interface LightingSource {
  kind: 'cover' | 'frame';
  fileId: string;
  posterUrl: string | null;   // cover 时可用
}

const THROTTLE_MS = 2000;     // frame 取色节流 ≤1 次/2s
const SMOOTH = 0.35;          // 颜色平滑系数（0..1，小=更平滑）

export class LightingEngine {
  private container: HTMLDivElement | null = null;
  private blobs: HTMLDivElement[] = [];
  private onPaletteCb: ((p: PaletteColors | null) => void) | null = null;

  // 光源缓存
  private coverCache = new Map<string, PaletteColors | null>();
  private frameCache = new Map<string, PaletteColors | null>();
  private current: PaletteColors | null = null;
  private pending: PaletteColors | null = null;
  private lastThumbAt = 0;
  private lastPlaybackId = '';
  private lastThumbTime = 0;

  mount(container: HTMLElement): void {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.className = 'vs-light';
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('div');
      b.className = 'vs-light-blob';
      this.blobs.push(b);
      this.container.appendChild(b);
    }
    container.appendChild(this.container);
  }
  unmount(): void { this.container?.remove(); this.container = null; this.blobs = []; }

  onPalette(cb: (p: PaletteColors | null) => void): void { this.onPaletteCb = cb; }

  get element(): HTMLDivElement | null { return this.container; }

  apply(p: EngineParams['light'], transitionMs: number): void {
    if (!this.container) return;
    const t = `${transitionMs}ms ease`;
    if (!p.enabled || p.layers.length === 0) { this.container.style.opacity = '0'; return; }
    this.container.style.opacity = String(p.opacity);
    this.container.style.filter = `saturate(${0.6 + p.saturation * 1.1})`;
    this.container.style.transition = `opacity ${t}`;
    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i];
      const lay = p.layers[i];
      if (!lay) { b.style.opacity = '0'; continue; }
      b.style.opacity = '1';
      b.style.left = lay.x;
      b.style.top = lay.y;
      b.style.width = b.style.height = `${lay.size}vmax`;
      b.style.transform = 'translate(-50%, -50%)';
      b.style.background = `radial-gradient(circle, ${lay.color} 0%, transparent 65%)`;
      b.style.transition = `background ${t}`;
    }
  }

  /* ---------- 光源取色（修正 5） ---------- */

  /** 设置播放中的视觉光源：frame 优先，无则回退 cover */
  requestPalette(source: LightingSource, onDone: (p: PaletteColors | null) => void): void {
    this.onPaletteCb = onDone;
    if (source.kind === 'frame') {
      if (this.frameCache.has(source.fileId)) { onDone(this.frameCache.get(source.fileId) ?? null); return; }
      // 节流 + 采样：现有 getThumb()，禁止逐帧
      const now = Date.now();
      const needThumb = source.fileId !== this.lastPlaybackId || (now - this.lastThumbAt) >= THROTTLE_MS;
      if (!needThumb && this.pending) return;
      this.lastPlaybackId = source.fileId;
      this.lastThumbAt = now;
      this.sampleFrame(source.fileId).then((p) => {
        this.frameCache.set(source.fileId, p);
        this.pending = p;
        onDone(this.smooth(p));
      });
    } else {
      if (this.coverCache.has(source.fileId)) { onDone(this.smooth(this.coverCache.get(source.fileId) ?? null)); return; }
      this.sampleImage(source.posterUrl).then((p) => {
        this.coverCache.set(source.fileId, p);
        onDone(this.smooth(p));
      });
    }
  }

  private smooth(next: PaletteColors | null): PaletteColors | null {
    if (!next) return null;
    if (!this.current) { this.current = next; return next; }
    const mix = (a: string, b: string) => {
      const pa = hexToRgb(a), pb = hexToRgb(b);
      const k = SMOOTH;
      return rgbToHex({
        r: pa.r + (pb.r - pa.r) * k, g: pa.g + (pb.g - pa.g) * k, b: pa.b + (pb.b - pa.b) * k,
      });
    };
    const out: PaletteColors = {
      start: mix(this.current.start, next.start),
      middle: mix(this.current.middle, next.middle),
      end: mix(this.current.end, next.end),
      angle: next.angle,
      mid: mix(this.current.mid, next.mid),
    };
    this.current = out;
    return out;
  }

  private async sampleFrame(playbackId: string): Promise<PaletteColors | null> {
    try {
      // 取当前播放位置的缩略帧（seek 预览用的真实帧，非逐帧）
      const url = await window.aurora.getThumb(Math.floor(this.lastThumbTime));
      if (!url) return null;
      return await this.sampleUrl(url);
    } catch { return null; }
  }

  private sampleImage(url: string | null): Promise<PaletteColors | null> {
    return url ? this.sampleUrl(url) : Promise.resolve(null);
  }

  private sampleUrl(url: string): Promise<PaletteColors | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(paletteFromImage(img));
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  setThumbTime(t: number): void { this.lastThumbTime = t; }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function rgbToHex(c: { r: number; g: number; b: number }): string {
  const p = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${p(c.r)}${p(c.g)}${p(c.b)}`;
}
