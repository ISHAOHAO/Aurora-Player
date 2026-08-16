import type { AquaEngineParams } from '../types';

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const VERT = `attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}`;

const FRAG = `precision highp float;
uniform vec2 uRes;uniform float uTime;uniform float uHue;uniform float uDepth;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}
vec3 hsv2rgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.);return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes.xy;
  vec2 p=uv; p.x*=uRes.x/uRes.y;
  float t=uTime*.02;
  float q1=fbm(p*1.3+vec2(t*.5,-t*.35));
  float q2=fbm(p*2.1-vec2(t*.45,t*.3)+q1*.9);
  float q3=fbm(p*3.2+vec2(t*.3,t*.5)+q2*.6);
  float mixW=clamp((q1+q2+q3)/3.,0.,1.);
  float sat=mix(.55,.1,uDepth);
  float val=mix(.28,.6,uDepth);
  float h1=(uHue+q1*42.)/360.;
  float h2=(uHue+48.+q2*48.)/360.;
  float h3=(uHue-28.+q3*38.)/360.;
  vec3 c1=hsv2rgb(vec3(fract(h1),sat,val));
  vec3 c2=hsv2rgb(vec3(fract(h2),sat*.8,val*1.08));
  vec3 c3=hsv2rgb(vec3(fract(h3),sat*.6,val*.82));
  vec3 col=mix(c3,mix(c1,c2,clamp(q2*1.5,0.,1.)),mixW);
  col+=vec3(.45,.55,.72)*(1.-uv.y)*.05;
  col=pow(col,vec3(.86));
  gl_FragColor=vec4(col,1.);
}`;

export class FluidEngine {
  private root: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private wp: HTMLDivElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private uniTime: number | WebGLUniformLocation = -1; private uniHue: number | WebGLUniformLocation = -1; private uniDepth: number | WebGLUniformLocation = -1; private uniRes: number | WebGLUniformLocation = -1;
  private raf = 0;
  private last = 0;
  private running = false;
  private cfg: AquaEngineParams | null = null;
  private rect: { top: number; bottom: number; left: number; right: number } | null = null;
  private hue = 320;
  private depth = 0.25;
  private pointer = { x: -9999, y: -9999 };

  mount(container: HTMLElement): void {
    if (this.root) return;
    this.root = document.createElement('div');
    this.root.className = 'vs-fluid';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vs-fluid-canvas';
    this.wp = document.createElement('div');
    this.wp.className = 'vs-fluid-wallpaper';
    this.root.appendChild(this.canvas);
    this.root.appendChild(this.wp);
    container.appendChild(this.root);
    this.initGL();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVis);
  }
  unmount(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
    this.root?.remove(); this.root = null; this.canvas = null; this.wp = null; this.gl = null; this.prog = null;
  }

  private onResize = () => { this.resize(); };
  private onVis = () => { if (document.hidden) this.stop(); else if (this.cfg && this.cfg.enabled && !REDUCE) this.start(); };

  private initGL(): void {
    const c = this.canvas;
    if (!c) return;
    const gl = c.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: true, premultipliedAlpha: true });
    if (!gl) return;
    this.gl = gl;
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.uniTime = gl.getUniformLocation(prog, 'uTime') ?? -1;
    this.uniHue = gl.getUniformLocation(prog, 'uHue') ?? -1;
    this.uniDepth = gl.getUniformLocation(prog, 'uDepth') ?? -1;
    this.uniRes = gl.getUniformLocation(prog, 'uRes') ?? -1;
    this.resize();
  }

  private resize(): void {
    const c = this.canvas, gl = this.gl;
    if (!c || !gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    c.width = Math.floor(window.innerWidth * dpr);
    c.height = Math.floor(window.innerHeight * dpr);
    gl.viewport(0, 0, c.width, c.height);
  }

  apply(p: AquaEngineParams | undefined): void {
    if (!p || !p.enabled) { this.stop(); this.hide(); return; }
    this.cfg = p;
    this.hue = p.fluidHue;
    this.depth = p.fluidDepth / 100;
    this.show(p.backdrop === 'fluid');
    if (p.backdrop === 'wallpaper') this.applyWallpaper(p);
    else this.applyBrightness(p.bgBrightness);
    if (!REDUCE) this.start();
  }

  private hide(): void { if (this.root) this.root.style.display = 'none'; }
  private show(fluid: boolean): void {
    if (!this.root || !this.canvas || !this.wp) return;
    this.root.style.display = 'block';
    this.canvas.style.display = fluid ? 'block' : 'none';
    this.wp.style.display = fluid ? 'none' : 'block';
  }

  private applyWallpaper(p: AquaEngineParams): void {
    const w = this.wp;
    if (!w) return;
    let img = w.querySelector('img') as HTMLImageElement | null;
    if (!img) { img = document.createElement('img'); w.appendChild(img); }
    img.className = 'vs-fluid-wallpaper-img';
    if (p.wallpaper) img.src = p.wallpaper; else img.removeAttribute('src');
    w.style.setProperty('--vs-aqua-wallpaper-blur', `${p.wallpaperBlur}px`);
    w.style.setProperty('--vs-aqua-wallpaper-frost', String(p.wallpaperFrost / 100));
    this.applyBrightness(p.bgBrightness);
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
    const t = Math.round(rect.top), b = Math.round(rect.bottom), l = Math.round(rect.left), r = Math.round(rect.right);
    if (t === 0 && b === window.innerHeight && l === 0 && r === window.innerWidth) {
      this.root.style.clipPath = 'polygon(0 0, 0 0, 0 0, 0 0, 100% 100%, 100% 100%, 100% 100%, 100% 100%)';
      return;
    }
    if (t > 0 || b < window.innerHeight) {
      this.root.style.clipPath = `polygon(0 0, 100% 0, 100% ${t}px, 0 ${t}px, 0 ${b}px, 100% ${b}px, 100% 100%, 0 100%)`;
    } else {
      this.root.style.clipPath = `polygon(0 0, ${l}px 0, ${l}px 100%, 0 100%, ${r}px 0, 100% 0, 100% 100%, ${r}px 100%)`;
    }
  }

  setPointer(x: number, y: number): void { this.pointer.x = x; this.pointer.y = y; }

  private start(): void {
    if (this.running || !this.gl || !this.prog) return;
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
    const gl = this.gl, prog = this.prog;
    if (!this.running || !gl || !prog) return;
    const dt = Math.min(50, t - this.last || 16); this.last = t;
    gl.uniform1f(this.uniTime, t / 1000);
    gl.uniform1f(this.uniHue, this.hue);
    gl.uniform1f(this.uniDepth, this.depth);
    gl.uniform2f(this.uniRes, this.canvas?.width || 1, this.canvas?.height || 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    void dt;
  };

  get element(): HTMLDivElement | null { return this.root; }
}
