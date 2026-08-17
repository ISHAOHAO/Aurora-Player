import type { AquaEngineParams } from '../types';
import { isVideoWallpaper, loadVideoBlob, loadVideoHandle } from './wallpaper-store';

/** FluidEngine — 忠实移植 deepseek aqua 的 WebGL2 双缓冲 flow-map 流体仿真（涟漪/30fps/DPR≤1.5）。 */
const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface VideoWallpaperHandle extends FileSystemFileHandle {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}

export function videoMaskPolygon(rect: { top: number; bottom: number; left: number; right: number }, w: number, h: number): string {
  const t = Math.round(rect.top), b = Math.round(rect.bottom), l = Math.round(rect.left), r = Math.round(rect.right);
  if (t === 0 && b === h && l === 0 && r === w) {
    return 'polygon(0 0, 0 0, 0 0, 0 0, 100% 100%, 100% 100%, 100% 100%, 100% 100%)';
  }
  if (t > 0 || b < h) {
    return `polygon(0 0, 100% 0, 100% ${t}px, 0 ${t}px, 0 ${b}px, 100% ${b}px, 100% 100%, 0 100%)`;
  }
  return `polygon(0 0, ${l}px 0, ${l}px 100%, ${r}px 100%, ${r}px 0, 100% 0, 100% 100%, 0 100%)`;
}

const FLUID_PARAMS = {
  mouseRadius: 0.22,
  mouseStrength: 1.1,
  decay: 0.96,
  distortBoost: 1.35,
  noiseBoost: 0,
  swirlBoost: 0.45,
  speed: 14,
  distortion: 20,
  swirl: 12,
  swirlIterations: 8,
  scale: 0.5,
  rotation: -5,
  proportion: 50,
  softness: 100,
  shapeScale: 10,
  offsetX: 0,
  offsetY: 65,
};

const VERTEX_SHADER = `#version 300 es
in vec4 a_position;
out vec2 vUv;
void main() {
  vUv = a_position.xy * 0.5 + 0.5;
  gl_Position = a_position;
}
`;

const FLOW_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D u_prev;
uniform vec2 u_mouse;
uniform vec2 u_velocity;
uniform float u_brushRadius;
uniform float u_brushStrength;
uniform float u_decay;
out vec4 fragColor;

void main() {
  vec4 prev = texture(u_prev, vUv);

  prev.r *= u_decay;
  prev.gb = mix(vec2(0.5), prev.gb, u_decay);

  float dist = distance(vUv, u_mouse);

  float influence = exp(-dist * dist / (u_brushRadius * u_brushRadius * 0.5));
  influence = max(0.0, influence - 0.01);

  float speed = length(u_velocity);
  float presenceStrength = u_brushStrength * 0.3;
  float velBonus = min(speed * 3.0, 0.7) * u_brushStrength;
  float totalStrength = presenceStrength + velBonus;

  prev.r = max(prev.r, influence * totalStrength);
  float blendAmt = influence * min(totalStrength, 0.4) * 0.3;
  prev.g = mix(prev.g, clamp(u_velocity.x * 2.0 + 0.5, 0.0, 1.0), blendAmt);
  prev.b = mix(prev.b, clamp(u_velocity.y * 2.0 + 0.5, 0.0, 1.0), blendAmt);

  fragColor = prev;
}
`;

const DISPLAY_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform float u_time;
uniform float u_pixelRatio;
uniform vec2 u_resolution;
uniform float u_scale;
uniform float u_rotation;
uniform vec4 u_color1, u_color2, u_color3;
uniform float u_colorCount;
uniform float u_proportion;
uniform float u_softness;
uniform float u_shape;
uniform float u_shapeScale;
uniform float u_distortion;
uniform float u_swirl;
uniform float u_swirlIterations;
uniform vec2 u_offset;
uniform sampler2D u_flowmap;
uniform float u_distortBoost;
uniform float u_noiseBoost;
uniform float u_swirlBoost;
out vec4 fragColor;

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846

vec2 rotate(vec2 uv, float th) { return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv; }
float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
float noise(vec2 st) {
  vec2 i = floor(st); vec2 f = fract(st);
  float a = random(i), b = random(i + vec2(1,0)), c = random(i + vec2(0,1)), d = random(i + vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

vec3 blend_multi(float mixer, float softness) {
  float edge = 1.0 - softness;
  vec3 col = u_color1.rgb;
  if (u_colorCount > 1.5) { col = mix(col, u_color2.rgb, smoothstep(0.0 + 0.35*edge, 0.7 - 0.35*edge, mixer)); }
  if (u_colorCount > 2.5) { col = mix(col, u_color3.rgb, smoothstep(0.3 + 0.35*edge, 1.0 - 0.35*edge, mixer)); }
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = .5 * u_time;
  float ns = .0005 + .006 * u_scale;
  uv -= .5; uv *= (ns * u_resolution); uv = rotate(uv, u_rotation * .5 * PI);
  uv /= u_pixelRatio; uv += .5; uv += u_offset;

  vec2 fragUV = gl_FragCoord.xy / u_resolution.xy;
  vec4 flow = texture(u_flowmap, fragUV);
  float influence = flow.r;
  vec2 flowDir = (flow.gb - 0.5) * 2.0;

  float n1 = noise(uv + t), n2 = noise(uv*2. - t);
  float angle = n1 * TWO_PI;

  float totalDistortion = u_distortion + influence * u_distortBoost;
  uv.x += 4. * totalDistortion * n2 * cos(angle);
  uv.y += 4. * totalDistortion * n2 * sin(angle);

  uv += flowDir * influence * 0.15;

  if (influence > 0.001) {
    float localNoise = noise(uv * 2.0 + t * 1.5);
    uv += influence * u_noiseBoost * vec2(cos(localNoise * TWO_PI), sin(localNoise * TWO_PI));
  }

  float iters = ceil(clamp(u_swirlIterations, 1., 30.));
  float swirlAmt = clamp(u_swirl, 0., 2.) + influence * u_swirlBoost;
  for (float i = 1.; i <= 30.0; i++) {
    if (i > iters) break;
    uv.x += swirlAmt / i * cos(t + i*1.5*uv.y);
    uv.y += swirlAmt / i * cos(t + i*1.*uv.x);
  }

  float proportion = clamp(u_proportion, 0., 1.);
  vec2 cuv = uv * (.5 + 3.5 * u_shapeScale);
  float shape = .5 + .5 * sin(cuv.x) * cos(cuv.y);
  float mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  vec3 col = blend_multi(mixer, clamp(u_softness, 0., 1.));
  fragColor = vec4(col, 1.0);
}
`;

function hsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const toHex = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const HUE_BASE = 217;

function fluidToneColors(dark: boolean, hue: number, depth: number): { color1: string; color2: string; color3: string } {
  const h = (((hue + HUE_BASE) % 360) + 360) % 360;
  const d = Math.min(1, Math.max(0, depth / 100));
  const ramp = (deep: number, mid: number, pale: number): number =>
    d < 0.5 ? deep + ((mid - deep) * d) / 0.5 : mid + ((pale - mid) * (d - 0.5)) / 0.5;
  if (dark) {
    return {
      color1: hsl(h, 0.85, ramp(0, 0.46, 0.62)),
      color2: hsl(h, 0.9, ramp(0, 0.305, 0.45)),
      color3: hsl(h, 0.5, ramp(0, 0.075, 0.10)),
    };
  }
  return {
    color1: hsl(h, 1, ramp(0.27, 0.45, 0.90)),
    color2: hsl(h, 0.55, 0.86),
    color3: hsl(h, 0.25, 0.955),
  };
}

function hexToRgb(value: string): [number, number, number] {
  const hex = value.replace('#', '');
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

export class FluidEngine {
  private root: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private wp: HTMLDivElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private flowProgram: WebGLProgram | null = null;
  private displayProgram: WebGLProgram | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private targetA: { fbo: WebGLFramebuffer; tex: WebGLTexture } | null = null;
  private targetB: { fbo: WebGLFramebuffer; tex: WebGLTexture } | null = null;
  private flip = false;
  private width = 0;
  private height = 0;
  private flowWidth = 0;
  private flowHeight = 0;
  private raf = 0;
  private running = false;
  private cfg: AquaEngineParams | null = null;
  private rect: { top: number; bottom: number; left: number; right: number } | null = null;
  private color1: [number, number, number] = [0, 0, 0];
  private color2: [number, number, number] = [0, 0, 0];
  private color3: [number, number, number] = [0, 0, 0];
  private startTime = 0;
  private previous = 0;
  private step = 1000 / 30;
  private pointer = { x: 0.5, y: 0.5, smoothX: 0.5, smoothY: 0.5, vx: 0, vy: 0, svx: 0, svy: 0 };
  private onMouseMove: ((e: MouseEvent) => void) | null = null;
  private lastStir = new WeakMap<Element, number>();
  private ripples = new Set<number>();

  private video: HTMLVideoElement | null = null;
  private videoActive = false;
  private videoBlobId = '';
  private videoToken = 0;
  private videoURL = '';

  private flow = {
    prev: null as WebGLUniformLocation | null,
    mouse: null as WebGLUniformLocation | null,
    velocity: null as WebGLUniformLocation | null,
    brushRadius: null as WebGLUniformLocation | null,
    brushStrength: null as WebGLUniformLocation | null,
    decay: null as WebGLUniformLocation | null,
  };
  private display = {
    time: null as WebGLUniformLocation | null,
    pixelRatio: null as WebGLUniformLocation | null,
    resolution: null as WebGLUniformLocation | null,
    scale: null as WebGLUniformLocation | null,
    rotation: null as WebGLUniformLocation | null,
    offset: null as WebGLUniformLocation | null,
    color1: null as WebGLUniformLocation | null,
    color2: null as WebGLUniformLocation | null,
    color3: null as WebGLUniformLocation | null,
    colorCount: null as WebGLUniformLocation | null,
    proportion: null as WebGLUniformLocation | null,
    softness: null as WebGLUniformLocation | null,
    shape: null as WebGLUniformLocation | null,
    shapeScale: null as WebGLUniformLocation | null,
    distortion: null as WebGLUniformLocation | null,
    swirl: null as WebGLUniformLocation | null,
    swirlIterations: null as WebGLUniformLocation | null,
    flowmap: null as WebGLUniformLocation | null,
    distortBoost: null as WebGLUniformLocation | null,
    noiseBoost: null as WebGLUniformLocation | null,
    swirlBoost: null as WebGLUniformLocation | null,
  };

  mount(container: HTMLElement): void {
    if (this.root) return;
    this.root = document.createElement('div');
    this.root.className = 'vs-fluid';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vs-fluid-canvas';
    this.wp = document.createElement('div');
    this.wp.className = 'vs-fluid-wallpaper';
    this.video = document.createElement('video');
    this.video.style.display = 'none';
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('preload', 'auto');
    this.wp.appendChild(this.video);
    this.root.appendChild(this.canvas);
    this.root.appendChild(this.wp);
    container.appendChild(this.root);
    this.initGL();
    this.attachInteractions();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVis);
  }
  unmount(): void {
    this.stop();
    this.videoToken++;
    this.videoBlobId = '';
    this.videoActive = false;
    if (this.video) { this.clearVideoSrc(); this.video.remove(); }
    this.video = null;
    this.detachInteractions();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
    if (this.onMouseMove) window.removeEventListener('mousemove', this.onMouseMove);
    this.onMouseMove = null;
    this.root?.remove(); this.root = null; this.canvas = null; this.wp = null; this.gl = null;
    this.flowProgram = null; this.displayProgram = null; this.quadBuffer = null;
    this.targetA = null; this.targetB = null;
  }

  private onResize = () => { this.resize(); };
  private onVis = () => {
    if (document.hidden) { this.stop(); this.pauseVideo(); }
    else {
      if (this.cfg && this.cfg.enabled && !REDUCE) this.start();
      this.resumeVideo();
    }
  };

  private initGL(): void {
    const c = this.canvas;
    if (!c) return;
    const gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return;
    this.gl = gl;
    const flowProgram = this.link(FLOW_SHADER);
    const displayProgram = this.link(DISPLAY_SHADER);
    if (flowProgram === null || displayProgram === null) return;
    this.flowProgram = flowProgram;
    this.displayProgram = displayProgram;
    this.flow.prev = gl.getUniformLocation(flowProgram, 'u_prev');
    this.flow.mouse = gl.getUniformLocation(flowProgram, 'u_mouse');
    this.flow.velocity = gl.getUniformLocation(flowProgram, 'u_velocity');
    this.flow.brushRadius = gl.getUniformLocation(flowProgram, 'u_brushRadius');
    this.flow.brushStrength = gl.getUniformLocation(flowProgram, 'u_brushStrength');
    this.flow.decay = gl.getUniformLocation(flowProgram, 'u_decay');
    this.display.time = gl.getUniformLocation(displayProgram, 'u_time');
    this.display.pixelRatio = gl.getUniformLocation(displayProgram, 'u_pixelRatio');
    this.display.resolution = gl.getUniformLocation(displayProgram, 'u_resolution');
    this.display.scale = gl.getUniformLocation(displayProgram, 'u_scale');
    this.display.rotation = gl.getUniformLocation(displayProgram, 'u_rotation');
    this.display.offset = gl.getUniformLocation(displayProgram, 'u_offset');
    this.display.color1 = gl.getUniformLocation(displayProgram, 'u_color1');
    this.display.color2 = gl.getUniformLocation(displayProgram, 'u_color2');
    this.display.color3 = gl.getUniformLocation(displayProgram, 'u_color3');
    this.display.colorCount = gl.getUniformLocation(displayProgram, 'u_colorCount');
    this.display.proportion = gl.getUniformLocation(displayProgram, 'u_proportion');
    this.display.softness = gl.getUniformLocation(displayProgram, 'u_softness');
    this.display.shape = gl.getUniformLocation(displayProgram, 'u_shape');
    this.display.shapeScale = gl.getUniformLocation(displayProgram, 'u_shapeScale');
    this.display.distortion = gl.getUniformLocation(displayProgram, 'u_distortion');
    this.display.swirl = gl.getUniformLocation(displayProgram, 'u_swirl');
    this.display.swirlIterations = gl.getUniformLocation(displayProgram, 'u_swirlIterations');
    this.display.flowmap = gl.getUniformLocation(displayProgram, 'u_flowmap');
    this.display.distortBoost = gl.getUniformLocation(displayProgram, 'u_distortBoost');
    this.display.noiseBoost = gl.getUniformLocation(displayProgram, 'u_noiseBoost');
    this.display.swirlBoost = gl.getUniformLocation(displayProgram, 'u_swirlBoost');
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const ua = navigator as Navigator & { userAgentData?: { platform?: string } };
    const windows = ua.userAgentData ? ua.userAgentData.platform === 'Windows' : navigator.userAgent.includes('Windows');
    if (!coarse && !windows) {
      this.onMouseMove = (event: MouseEvent): void => {
        const rect = c.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        this.pointer.x = (event.clientX - rect.left) / rect.width;
        this.pointer.y = 1 - (event.clientY - rect.top) / rect.height;
      };
      window.addEventListener('mousemove', this.onMouseMove);
    }
    this.startTime = performance.now();
    this.resize();
  }

  private compile(type: number, source: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (shader === null) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('ui-aqua fluid shader:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  private link(fragment: string): WebGLProgram | null {
    const gl = this.gl;
    if (!gl) return null;
    const vertex = this.compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const frag = this.compile(gl.FRAGMENT_SHADER, fragment);
    if (vertex === null || frag === null) return null;
    const program = gl.createProgram();
    if (program === null) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('ui-aqua fluid link:', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  private makeTarget(width: number, height: number, initial?: Uint8Array): { fbo: WebGLFramebuffer; tex: WebGLTexture } | null {
    const gl = this.gl;
    if (!gl) return null;
    const tex = gl.createTexture();
    if (tex === null) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (initial !== undefined) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, initial);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    if (fbo === null) return null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  private initialFlow(width: number, height: number): Uint8Array {
    const arr = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      arr[4 * i] = 0;
      arr[4 * i + 1] = 128;
      arr[4 * i + 2] = 128;
      arr[4 * i + 3] = 255;
    }
    return arr;
  }

  private resize(): void {
    const c = this.canvas, gl = this.gl;
    if (!c || !gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round((c.clientWidth || window.innerWidth) * dpr));
    const h = Math.max(1, Math.round((c.clientHeight || window.innerHeight) * dpr));
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      c.width = w;
      c.height = h;
    }
    const fw = Math.max(1, Math.round(w / 4));
    const fh = Math.max(1, Math.round(h / 4));
    if (fw !== this.flowWidth || fh !== this.flowHeight) {
      this.flowWidth = fw;
      this.flowHeight = fh;
      const initial = this.initialFlow(fw, fh);
      this.targetA = this.makeTarget(fw, fh, initial);
      this.targetB = this.makeTarget(fw, fh, initial);
    }
  }

  private bindQuad(program: WebGLProgram): void {
    const gl = this.gl;
    if (!gl || !this.quadBuffer) return;
    const position = gl.getAttribLocation(program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  }

  apply(p: AquaEngineParams | undefined, onPlayer: boolean): void {
    if (!p || !p.enabled) { this.stop(); this.stopVideo(); this.hide(); return; }
    this.cfg = p;
    const dark = document.documentElement.dataset.theme !== 'light';
    const tones = fluidToneColors(dark, p.fluidHue, p.fluidDepth);
    this.color1 = hexToRgb(tones.color1);
    this.color2 = hexToRgb(tones.color2);
    this.color3 = hexToRgb(tones.color3);
    this.show(p.backdrop === 'fluid');
    if (p.backdrop === 'wallpaper') this.applyWallpaper(p, onPlayer);
    else { this.applyBrightness(p.bgBrightness); this.stopVideo(); }
    if (p.backdrop === 'fluid') this.start();
    else this.stop();
  }

  private hide(): void { if (this.root) this.root.style.display = 'none'; }
  private show(fluid: boolean): void {
    if (!this.root || !this.canvas || !this.wp) return;
    this.root.style.display = 'block';
    this.canvas.style.display = fluid ? 'block' : 'none';
    this.wp.style.display = fluid ? 'none' : 'block';
  }

  private applyWallpaper(p: AquaEngineParams, onPlayer: boolean): void {
    const w = this.wp;
    if (!w) return;
    const isVideo = isVideoWallpaper(p.wallpaper);
    w.dataset.media = isVideo ? 'video' : 'image';
    let img = w.querySelector('img') as HTMLImageElement | null;
    if (!img) { img = document.createElement('img'); w.appendChild(img); }
    img.className = 'vs-fluid-wallpaper-img';
    if (p.wallpaper && !isVideo) img.src = p.wallpaper; else img.removeAttribute('src');
    w.style.setProperty('--vs-aqua-wallpaper-blur', `${p.wallpaperBlur}px`);
    w.style.setProperty('--vs-aqua-wallpaper-frost', String(p.wallpaperFrost / 100));
    w.style.setProperty('--vs-aqua-video-blur', `${p.videoBlur}px`);
    w.style.setProperty('--vs-aqua-video-dim', String(((100 - p.videoBrightness) / 100) * 0.65));
    if (isVideo) this.applyVideo(p.wallpaper, onPlayer);
    else this.stopVideo();
    this.applyBrightness(p.bgBrightness);
  }

  private applyVideo(wallpaper: string, onPlayer: boolean): void {
    const video = this.video;
    if (!video) return;
    if (onPlayer) { this.stopVideo(); return; }
    this.videoActive = true;
    if (video.style.display === 'none') video.style.display = 'block';
    if (wallpaper.startsWith('idb:')) {
      const id = wallpaper.slice(4);
      if (this.videoBlobId === id) { this.configureWallpaperVideo(video); return; }
      this.videoBlobId = id;
      const token = ++this.videoToken;
      this.clearVideoSrc();
      loadVideoBlob(id).then((blob) => {
        if (token !== this.videoToken || !blob) return;
        this.setVideoURL(URL.createObjectURL(blob));
      });
    } else if (wallpaper.startsWith('fsa:')) {
      this.videoBlobId = '';
      const token = ++this.videoToken;
      this.clearVideoSrc();
      loadVideoHandle().then((handle) => {
        if (token !== this.videoToken || !handle) return;
        (handle as VideoWallpaperHandle).queryPermission({ mode: 'read' }).then((state) => {
          if (token !== this.videoToken || state !== 'granted') return;
          handle.getFile().then((file) => {
            if (token !== this.videoToken) return;
            this.setVideoURL(URL.createObjectURL(file));
          }).catch(() => {});
        }).catch(() => {});
      });
    } else {
      this.videoBlobId = '';
      ++this.videoToken;
      this.clearVideoSrc();
      this.setVideoURL(wallpaper);
    }
  }

  private configureWallpaperVideo(video: HTMLVideoElement): void {
    video.loop = true;
    if (REDUCE) return;
    if (!video.paused) return;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
  }

  private setVideoURL(url: string): void {
    const video = this.video;
    if (!video) return;
    this.revokeVideoURL();
    this.videoURL = url;
    video.src = url;
    this.configureWallpaperVideo(video);
  }

  private clearVideoSrc(): void {
    const video = this.video;
    if (!video) return;
    this.revokeVideoURL();
    if (video.src) video.removeAttribute('src');
    video.load();
  }

  private revokeVideoURL(): void {
    if (this.videoURL && this.videoURL.startsWith('blob:')) {
      URL.revokeObjectURL(this.videoURL);
      this.videoURL = '';
    }
  }

  private stopVideo(): void {
    this.videoActive = false;
    this.videoBlobId = '';
    ++this.videoToken;
    const video = this.video;
    if (!video) return;
    this.clearVideoSrc();
    video.style.display = 'none';
  }

  private pauseVideo(): void {
    const video = this.video;
    if (video && !video.paused) video.pause();
  }

  private resumeVideo(): void {
    if (!this.videoActive || REDUCE || document.hidden) return;
    const video = this.video;
    if (video && video.src && video.paused) this.configureWallpaperVideo(video);
  }

  private applyBrightness(bg: number): void {
    if (!this.root) return;
    const dark = document.documentElement.dataset.theme !== 'light';
    this.root.style.setProperty('--vs-aqua-brightness-black', String(dark ? Math.max(0, (50 - bg) / 50) : 0));
    this.root.style.setProperty('--vs-aqua-brightness-white', String(dark ? 0 : Math.max(0, (bg - 50) / 50)));
  }

  setVideoRect(rect: { top: number; bottom: number; left: number; right: number } | null): void {
    this.rect = rect;
    if (!this.root) return;
    if (!rect) { this.root.style.clipPath = ''; return; }
    this.root.style.clipPath = videoMaskPolygon(rect, window.innerWidth, window.innerHeight);
  }

  setPointer(x: number, y: number): void {
    const c = this.canvas;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointer.x = (x - rect.left) / rect.width;
    this.pointer.y = 1 - (y - rect.top) / rect.height;
  }

  private stir(x: number, y: number, vx: number, vy: number): void {
    this.pointer.x += (x - this.pointer.x) * 0.35;
    this.pointer.y += (y - this.pointer.y) * 0.35;
    this.pointer.svx += (vx - this.pointer.svx) * 0.3;
    this.pointer.svy += (vy - this.pointer.svy) * 0.3;
  }

  private uvOf(c: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
    const rect = c.getBoundingClientRect();
    return {
      x: rect.width <= 0 ? 0.5 : (clientX - rect.left) / rect.width,
      y: rect.height <= 0 ? 0.5 : 1 - (clientY - rect.top) / rect.height,
    };
  }

  private stirButton(button: HTMLButtonElement, strength: number): void {
    const now = performance.now();
    const previous = this.lastStir.get(button) ?? 0;
    if (now - previous < 160) return;
    this.lastStir.set(button, now);
    const rect = button.getBoundingClientRect();
    const c = this.canvas;
    if (!c) return;
    const point = this.uvOf(c, rect.left + rect.width / 2, rect.top + rect.height / 2);
    this.stir(point.x, point.y, 0, -strength);
  }

  private ripple(cx: number, cy: number): void {
    const c = this.canvas;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const ux = (cx - rect.left) / rect.width;
    const uy = 1 - (cy - rect.top) / rect.height;
    const start = performance.now();
    const duration = 1500;
    const maxRadius = 120;
    const count = 8;
    const step = (): void => {
      const t = performance.now() - start;
      if (t > duration) return;
      const k = t / duration;
      const radius = maxRadius * k * k;
      const strength = 0.05 * (1 - k);
      const spin = 0.4 * k;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + spin;
        const px = ux + (radius * Math.cos(angle)) / rect.width;
        const py = uy + (radius * Math.sin(angle)) / rect.height;
        this.stir(px, py, Math.cos(angle) * strength, -Math.sin(angle) * strength);
      }
      const id = requestAnimationFrame(step);
      this.ripples.add(id);
    };
    const id = requestAnimationFrame(step);
    this.ripples.add(id);
  }

  private onPointerOver = (event: PointerEvent): void => {
    const button = (event.target as Element | null)?.closest?.('button');
    if (button !== undefined && button !== null) this.stirButton(button, 0.04);
  };
  private onClick = (event: MouseEvent): void => {
    const button = (event.target as Element | null)?.closest?.('button');
    if (button === undefined || button === null) return;
    const now = performance.now();
    const previous = this.lastStir.get(button) ?? 0;
    if (now - previous < 500) return;
    this.lastStir.set(button, now);
    const rect = button.getBoundingClientRect();
    this.ripple(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  private attachInteractions(): void {
    document.addEventListener('pointerover', this.onPointerOver, { capture: true });
    document.addEventListener('click', this.onClick, { capture: true });
  }
  private detachInteractions(): void {
    for (const id of this.ripples) cancelAnimationFrame(id);
    this.ripples.clear();
    document.removeEventListener('pointerover', this.onPointerOver, { capture: true });
    document.removeEventListener('click', this.onClick, { capture: true });
  }

  private start(): void {
    if (this.running || !this.gl || !this.flowProgram || !this.displayProgram) return;
    this.running = true;
    this.previous = 0;
    if (REDUCE) {
      this.renderFrame(performance.now());
      this.running = false;
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  }
  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (now - this.previous < this.step) return;
    this.previous = now - ((now - this.previous) % this.step);
    this.renderFrame(now);
  };

  private renderFrame(now: number): void {
    const gl = this.gl;
    if (!gl || !this.flowProgram || !this.displayProgram || !this.targetA || !this.targetB) return;
    this.resize();
    const s = this.pointer;
    s.svx *= 0.94;
    s.svy *= 0.94;
    s.smoothX += (s.x - s.smoothX) * 0.12;
    s.smoothY += (s.y - s.smoothY) * 0.12;
    s.svx += ((s.x - s.smoothX) * 0.5 - s.svx) * 0.15;
    s.svy += ((s.y - s.smoothY) * 0.5 - s.svy) * 0.15;

    const read = this.flip ? this.targetA : this.targetB;
    const write = this.flip ? this.targetB : this.targetA;
    this.flip = !this.flip;

    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, this.flowWidth, this.flowHeight);
    gl.useProgram(this.flowProgram);
    this.bindQuad(this.flowProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.uniform1i(this.flow.prev, 0);
    gl.uniform2f(this.flow.mouse, s.smoothX, s.smoothY);
    gl.uniform2f(this.flow.velocity, s.svx, s.svy);
    gl.uniform1f(this.flow.brushRadius, FLUID_PARAMS.mouseRadius);
    gl.uniform1f(this.flow.brushStrength, FLUID_PARAMS.mouseStrength);
    gl.uniform1f(this.flow.decay, FLUID_PARAMS.decay);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.displayProgram);
    this.bindQuad(this.displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, write.tex);
    gl.uniform1i(this.display.flowmap, 0);
    gl.uniform1f(this.display.time, (now - this.startTime) * 0.001 * (FLUID_PARAMS.speed / 100));
    gl.uniform1f(this.display.pixelRatio, window.devicePixelRatio || 1);
    gl.uniform2f(this.display.resolution, this.width, this.height);
    gl.uniform1f(this.display.scale, FLUID_PARAMS.scale);
    gl.uniform1f(this.display.rotation, FLUID_PARAMS.rotation / 90);
    gl.uniform2f(this.display.offset, FLUID_PARAMS.offsetX / 100, FLUID_PARAMS.offsetY / 100);
    gl.uniform4f(this.display.color1, this.color1[0], this.color1[1], this.color1[2], 1);
    gl.uniform4f(this.display.color2, this.color2[0], this.color2[1], this.color2[2], 1);
    gl.uniform4f(this.display.color3, this.color3[0], this.color3[1], this.color3[2], 1);
    gl.uniform1f(this.display.colorCount, 3);
    gl.uniform1f(this.display.proportion, FLUID_PARAMS.proportion / 100);
    gl.uniform1f(this.display.softness, FLUID_PARAMS.softness / 100);
    gl.uniform1f(this.display.shape, 0);
    gl.uniform1f(this.display.shapeScale, FLUID_PARAMS.shapeScale / 100);
    gl.uniform1f(this.display.distortion, FLUID_PARAMS.distortion / 100);
    gl.uniform1f(this.display.swirl, FLUID_PARAMS.swirl / 50);
    gl.uniform1f(this.display.swirlIterations, FLUID_PARAMS.swirlIterations);
    gl.uniform1f(this.display.distortBoost, FLUID_PARAMS.distortBoost);
    gl.uniform1f(this.display.noiseBoost, FLUID_PARAMS.noiseBoost);
    gl.uniform1f(this.display.swirlBoost, FLUID_PARAMS.swirlBoost);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  get element(): HTMLDivElement | null { return this.root; }
}
