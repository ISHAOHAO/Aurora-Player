# Aqua 全量移植 Implementation Plan (Revision 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Aurora Player 的 Aqua 主题升级为 DSH-Transparent-UI-Plugin 参考实现的**全量忠实移植**：真实 WebGL2 流体仿真、粒子鲸鱼、交互网格、mica/compat 双模式、图像+视频壁纸（IndexedDB + FSA）、完整深海 token 调色板、内嵌 Space Grotesk 字体；并删除 6 个旧主题，Aqua 成为唯一官方主题。同时保证明暗双套 token 的文字/背景对比可读。

**Architecture:** 沿用 Aurora 视觉系统骨架（store/registry/resolver/controller/engines/VisualConsole），各引擎升级为参考实现的忠实移植（算法对齐，选择器/持久化适配 Aurora）。参考源保存在 SDD workspace：`.superpowers/sdd/reference/aqua-src/`（源仓库拷贝）与 `.superpowers/sdd/reference/aqua-video-wallpaper-reference.md`（bundle-only 视频壁纸）。

**Tech Stack:** TypeScript strict · React 19 · Vite 8 · WebGL2 / Canvas2D / IndexedDB / File System Access（全原生，零依赖）· Electron 43。

**验证命令（每任务通用）：**
- `npx tsc --noEmit`（`app/renderer/`）
- `npm run build`（`app/`）
- `node scripts/visual-test.js`（`app/`）

## Global Constraints

- 不动 mpv/IPC/DLNA/HDR 决策链/媒体库/播放逻辑/窗口生命周期/托盘/防火墙/硬解。
- 播放页 Video First：`STATE_BUDGETS` 不动；播放页 scene 透明度 = `budgetOpacity * 0.2`；黑场中心 lum ≤0.067、白场中心 ≥0.94；letterbox 视频矩形 mask（Revision 1 已实现，保留）。
- 播放页透明窗：DOM backdrop-filter/mix-blend 无法读取 mpv 视频；播放页视频壁纸隐藏（与 scene 同组受预算约束）。
- 业务组件只碰 VisualProvider / useVisual；不新增 IPC（壁纸 `idb:`/`fsa:` 存 IndexedDB + FSA，零 IPC）。
- 持久化纪律：Aqua 参数走现有 visual.json（theme.aqua 段），debounce 500ms 落盘；官方 Aqua 永不落盘，编辑自动 clone Custom Copy。
- 明暗判别 `:root[data-theme="..."]`（data-theme 在 html）；`data-vtheme` 在 body。
- 明暗可读性：Aqua dark/light 下 `--vs-text` vs `--vs-bg` 亮度差 ≥60（visual-test 断言）；浅色 glass 更实。
- 不新增第三方依赖（WebGL2/FSA/IndexedDB 全原生）；代码不写注释（现有注释保留；新文件可一行头部 JSDoc）。
- reduced-motion 下静默所有氛围运动（流体静态帧 / 鲸鱼静态 / 网格静态 / 无 tilt / critters 停动画）。
- 官方主题永不落盘；删除 6 旧主题后，旧用户 preset（source:user）保留，旧 activeThemeId 落 aqua。

---

### Task 1: Schema 扩展 Revision 2（types.ts）

**Files:**
- Modify: `app/renderer/src/visual/types.ts`

**Interfaces:**
- Consumes: 现有 `VisualThemeAqua`。
- Produces: `VisualThemeAqua` 增加 `mode: 'mica'|'compat'`、`mesh: boolean`、`videoBlur: number`、`videoBrightness: number`。

- [ ] **Step 1: 修改 `VisualThemeAqua` 接口**

在 `app/renderer/src/visual/types.ts` 中找到 `VisualThemeAqua`，将其改为：

```ts
export interface VisualThemeAqua {
  mode: 'mica' | 'compat';
  backdrop: 'fluid' | 'wallpaper';
  fluidHue: number;
  fluidDepth: number;
  bgBrightness: number;
  wallpaper: string;
  wallpaperBlur: number;
  wallpaperFrost: number;
  videoBlur: number;
  videoBrightness: number;
  mesh: boolean;
  edgeFade: boolean;
  spotlight: boolean;
  press: boolean;
  critters: boolean;
  whale: boolean;
}
```

- [ ] **Step 2: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）
Expected: FAIL——`registry.ts` 的 aqua 段缺新字段（类型不完整），报 `Property 'mode' is missing` 等。这是预期的红。

Run: 记录失败输出（作为 TDD RED 证据）。

- [ ] **Step 3: 提交**

```bash
git add app/renderer/src/visual/types.ts
git commit -m "feat: Aqua schema 扩展 mode/mesh/videoBlur/videoBrightness（Revision 2）"
```

---

### Task 2: Aqua 主题注册更新 + registry 瘦身（registry.ts）

**Files:**
- Modify: `app/renderer/src/visual/registry.ts`
- Test: `app/scripts/visual-test-entry.ts`

**Interfaces:**
- Consumes: `VisualThemeAqua`（Task 1）。
- Produces: `THEME_IDS = ['aqua']`；`REGISTRY` 仅 Aqua；Aqua 主题 aqua 段补齐新字段；`makeCustomBase()` 从 `'aqua'` clone。

- [ ] **Step 1: 先改测试——计数改为 1 主题 + aqua 段新字段断言**

`app/scripts/visual-test-entry.ts`：
- `check('registry 7 个官方主题', REGISTRY.length === 7)` → `check('registry 1 个官方主题', REGISTRY.length === 1)`
- `check('主题 id 唯一', new Set(...).size === 7)` → `=== 1`
- `check('7 主题 dark accent 各自不同', accents.size === 7)` → 删除该行（单主题无意义）或改为 `check('Aqua dark accent 存在', accents.size === 1)`
- `check('14 组合 text/bg 对比可读（≥60 亮度差）', okC === 14)` → `okC === 2`（1 主题 × 2 外观）
- 删除依赖多主题的测试块：`/* 2e. Theme Distinctiveness */`、`/* 2f. 差异化对 */`（fonts/shadows/radii ≥2/3、Cinema vs Noir 等）
- 删除 `/* 2d. OLED Light ≠ OLED Dark */`（OLED 已删）
- state-sync 循环 `for (const id of ['cinema','aurora','noir','oled','glass','immersive','aqua'])` → `['aqua']`
- `/* 2g. Aqua */` 块中追加新字段断言：
```ts
  check('Aqua aqua.mode=mica', dark.engineParams.aqua?.mode === 'mica');
  check('Aqua aqua.mesh=true', dark.engineParams.aqua?.mesh === true);
  check('Aqua aqua.videoBlur=6', dark.engineParams.aqua?.videoBlur === 6);
```

运行确认红：

Run: `node scripts/visual-test.js`（`app/`）
Expected: FAIL 计数断言（registry 仍 7）。

- [ ] **Step 2: `registry.ts` 删除 6 个旧主题**

删除 `REGISTRY` 数组中的 cinema / aurora / noir / oled / glass / immersive 六项，只保留 aqua。删除 `THEME_IDS` 中除 `'aqua'` 外的所有 id：

```ts
export const THEME_IDS = ['aqua'] as const;
```

- [ ] **Step 3: 更新 Aqua 主题 aqua 段补齐新字段 + 调色板对齐参考**

将 aqua 主题的 `aqua` 段改为：

```ts
    aqua: {
      mode: 'mica', backdrop: 'fluid', fluidHue: 320, fluidDepth: 25, bgBrightness: 50,
      wallpaper: '', wallpaperBlur: 0, wallpaperFrost: 0, videoBlur: 6, videoBrightness: 45,
      mesh: true, edgeFade: true, spotlight: true, press: true, critters: true, whale: true,
    },
```

并将 aqua 主题的 scene/appearance 调色板对齐 DSH token（Revision 2 §调色板）：

```ts
    scene: { mode: 'fluid', bgOpacity: 0.9, cover: { follow: true, locked: false, auto: true } },
    ...
    appearance: {
      dark: {
        base: '#0C121B', surface: '#111A27', surface2: '#162130', surface3: '#1C2A3D',
        text: '#EAF2FC', text2: '#AFC3DC', accent: '#6E9BE8',
      },
      light: {
        base: '#F4F8FD', surface: '#FFFFFF', surface2: '#ECF2FA', text: '#13243E',
        text2: '#40597A', accent: '#3F76D8',
      },
    },
```

**注意**：`appearance` 结构需匹配 resolver 现有契约——现有 `ThemeAppearanceLight` 只有 `scene?/base?/surface?/surface2?/text?/accent?/bgOpacity?/grain?/vignette?/lightingIntensity?`。若加入 `text2/surface3/dark` 需同步扩展 `ThemeAppearanceLight`（Task 1 或本任务一并改 `types.ts`）。**本任务选择最小改动**：只把现有字段值对齐 DSH 色值（`base/surface/surface2/text/accent`），不新增字段（text2 的二级色由 resolver `rgba(text,0.68)` 派生，与 DSH 语义近似）。因此 `appearance` 改为：

```ts
    appearance: {
      light: {
        scene: { start: '#F4F8FD', middle: '#EAF1F9', end: '#DCE7F4', angle: 170 },
        base: '#F4F8FD', surface: '#FFFFFF', surface2: '#ECF2FA', text: '#13243E',
        accent: '#3F76D8', bgOpacity: 0.4, lightingIntensity: 0.5, grain: 0.2, vignette: 0.1,
      },
    },
```

（暗色 `#0C121B` 已由 resolver 从 `sceneOf(mode='fluid')` 的兜底 `linear-gradient(160deg, #0C121B, ...)` 派生，符合 DSH。不需要显式 dark 段。）

- [ ] **Step 4: `makeCustomBase()` 改从 aqua clone**

```ts
export function makeCustomBase(): VisualTheme {
  const base = getBuiltinTheme('aqua')!;
  return { ...base, id: 'custom', name: 'Custom', description: '我的自定义视觉', source: 'user' };
}
```

- [ ] **Step 5: 运行测试验证全绿**

Run: `node scripts/visual-test.js`（`app/`）
Expected: 全部 PASS，`RESULT ok=... fail=0`。

- [ ] **Step 6: 类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过。

- [ ] **Step 7: 提交**

```bash
git add app/renderer/src/visual/registry.ts app/scripts/visual-test-entry.ts
git commit -m "feat: 删除 6 旧主题，Aqua 唯一官方主题 + 调色板对齐 DSH"
```

---

### Task 3: store 收敛确认（store.ts）

**Files:**
- Modify: `app/renderer/src/visual/store.ts`（如需要）

**Interfaces:**
- Consumes: registry（仅 aqua）。
- Produces: 默认/兜底 `'aqua'`（已在 Revision 1 落地，验证即可）；旧用户 preset 保留。

- [ ] **Step 1: 验证 store 无需改动**

检查 `store.ts`：
- `activeThemeId = 'aqua'` 初始 ✅
- `removePreset`/`resetActive`/`init`/`migrateFromVisualMode` 兜底 `'aqua'` ✅
- `init()` 中 `if (!getBuiltinTheme(activeThemeId) && !isUserPreset(activeThemeId)) activeThemeId = 'aqua'` —— 已有 visual.json 用户旧 activeThemeId（如 cinema）查不到 builtin → 落 aqua；旧 user preset 保留 ✅

若上述均已满足，本任务无代码改动，仅记录验证结果。若有任何一处仍指向 'cinema' 或缺失，修正为 'aqua'。

- [ ] **Step 2: 验证测试**

Run: `node scripts/visual-test.js`（`app/`）
Expected: `RESULT ok=... fail=0`（Task 2 已同步计数）。

- [ ] **Step 3: 提交（如有改动）**

```bash
git add app/renderer/src/visual/store.ts
git commit -m "feat: store 收敛确认——旧主题 active 兜底落 aqua"
```

---

### Task 4: FluidEngine 升级为真实 WebGL2 流体仿真

**Files:**
- Modify: `app/renderer/src/visual/engines/FluidEngine.ts`
- 参考: `.superpowers/sdd/reference/aqua-src/fluid-shader.ts`、`fluid-tones.ts`、`fluid-interactions.ts`

**Interfaces:**
- Consumes: `AquaEngineParams`。
- Produces: `FluidEngine` 升级为 flow-map 双缓冲仿真；保留接口 `mount/apply/setVideoRect/setPointer/unmount/get element`。

- [ ] **Step 1: 阅读参考源**

读 `.superpowers/sdd/reference/aqua-src/fluid-shader.ts`（WebGL2 双缓冲 flow-map + DISPLAY_SHADER）、`fluid-tones.ts`（fluidToneColors，hue+217 分段色阶）、`fluid-interactions.ts`（涟漪）。

- [ ] **Step 2: 升级 FluidEngine**

将现有 `FluidEngine` 的着色器与渲染循环替换为参考实现的忠实移植：
- VERTEX_SHADER / FLOW_SHADER / DISPLAY_SHADER 逐字从参考源复制（WebGL2 `#version 300 es`）。
- 双缓冲：两个 FBO/纹理（quarter-res flow field，`flowWidth/flowHeight = width/4, height/4`），ping-pong；初始纹理 `rgba(0,128,128,255)`。
- 30fps 步进：`step = 1000/30`，`if (now - previous < step) return; previous = now - (now-previous)%step`。
- 鼠标：`u_mouse`（smoothX/smoothY，.12 插值）+ `u_velocity`（svx/svy，.94 衰减）；Windows 与触屏跳过 mousemove feed（`!coarse && !windows`）。
- 参数映射：`fluidHue/fluidDepth` → `fluidToneColors(dark, hue, depth)` → `color1/2/3`（暗色 `hsl(h,.85,ramp(0,.46,.62))` 等，参考 fluid-tones）。
- reduced-motion：`frame(performance.now())` 渲染一帧静态后 `cancelAnimationFrame`。
- DPR ≤ 1.5。
- 保留现有 `setVideoRect`（letterbox clip-path mask）与 `setPointer`。
- 涟漪交互（`attachFluidInteractions`）：`pointerover` stir 按钮 + `click` 径向涟漪（1500ms 8 方向）。移植为 FluidEngine 内部方法（`document.addEventListener` capture），`unmount` 时移除。
- 保留现有 `onVis`（cfg 判断恢复）+ REDUCE 门控。

- [ ] **Step 3: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过。

- [ ] **Step 4: 提交**

```bash
git add app/renderer/src/visual/engines/FluidEngine.ts
git commit -m "feat: FluidEngine 升级真实 WebGL2 flow-map 流体仿真（双缓冲/涟漪/30fps）"
```

---

### Task 5: CrittersEngine 升级（鱼 SVG + 粒子鲸鱼）

**Files:**
- Modify: `app/renderer/src/visual/engines/CrittersEngine.ts`
- Modify: `app/renderer/src/visual/visual.css`（critter 动画 + 鲸鱼样式）
- 参考: `.superpowers/sdd/reference/aqua-src/critters.ts`、`whale.ts`

**Interfaces:**
- Consumes: `AquaEngineParams`。
- Produces: `CrittersEngine` 升级：fish SVG 剪影 + bubble + plankton + 粒子鲸鱼；保留接口 `mount/apply/unmount/get element`。

- [ ] **Step 1: 阅读参考源**

读 `.superpowers/sdd/reference/aqua-src/critters.ts`（FISH_PATH SVG、bubble、plankton、AMBIENT_SCENE）、`whale.ts`（WHALE_SVG、GRID 60 亮度采样、粒子装配/尾摆/光照/指针推挤）。

- [ ] **Step 2: 升级 CrittersEngine**

- critters 元素改为内联 SVG（FISH_PATH 逐字从参考源复制；bubble 圆环；plankton 圆点），`data-kind` ∈ {fish, fish-left, bubble, plankton}，样式/位置内联（top/left/animation-duration/animation-delay/opacity 参考 AMBIENT_SCENE）。
- 鲸鱼改为**粒子鲸鱼**（参考 whale.ts）：
  - WHALE_SVG（24×18）内联，`new Image()` → `data:image/svg+xml` → sample 到 60×60 亮度网格（`hasBrightNeighbor` 去噪）。
  - 粒子：`{x,y,opacity,edge,sx,sy,sz}` 3D 散点，装配 `assembly = smoothstep(0,1,1-pow(1-raw,3))`。
  - 渲染：additive（`globalCompositeOperation='lighter'`）+ mix-blend-mode screen（浅色 multiply，`data-scheme`）。
  - 尾摆 `smoothstep(.5,4.5,p.x)*LOOSE*assembly`、光照 `LIGHT_X 4.5/LIGHT_Y 5.5/LIGHT_RANGE 14/SHADE_MIN .2/SHADE_MAX 1.116`、指针推挤 `MOUSE_RADIUS 4.9/STRENGTH .8/DECAY .2/DISTORT 5`。
  - 30fps；`FPS=30`；reduced-motion 渲染装配完成静态帧（`draw(1,2)`）后停止。
  - 居中于主列（Aurora 无侧边栏 → `window.innerWidth/2`，`size = round(clamp(220, 660, innerHeight*.76, width*.8))`）。
  - DPR ≤ 1.5。
- 保留 onPlayer 逻辑：播放页隐藏鲸鱼、critters 降透明 0.5（Video First）。

- [ ] **Step 3: visual.css 更新 critter/鲸鱼样式**

在 `app/renderer/src/visual/visual.css` 的 Aqua 区块，替换 `.vs-critter` 与 `.vs-whale` 样式为参考实现形态：
- critter 颜色 `#7ea4df`、bubble `#a9c6ef`、plankton `#7ea4df`；动画 keyframes（fish-swim / fish-swim-left / bubble-rise / plankton）逐字参考 `aqua.module.css` 对应 keyframes。
- 鲸鱼 `mix-blend-mode: screen`（浅色 multiply），居中 `transform: translate(-50%,-50%)`。
- reduced-motion 静默。

- [ ] **Step 4: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过。

- [ ] **Step 5: 提交**

```bash
git add app/renderer/src/visual/engines/CrittersEngine.ts app/renderer/src/visual/visual.css
git commit -m "feat: CrittersEngine 升级鱼 SVG 剪影 + 粒子鲸鱼（亮度网格采样）"
```

---

### Task 6: MeshEngine 新增（交互网格）

**Files:**
- Create: `app/renderer/src/visual/engines/MeshEngine.ts`
- Modify: `app/renderer/src/visual/controller.ts`（挂载接线，见 Task 8）
- 参考: `.superpowers/sdd/reference/aqua-src/mesh.ts`

**Interfaces:**
- Consumes: `AquaEngineParams`。
- Produces:
  - `class MeshEngine`
    - `mount(container: HTMLElement): void` —— 创建 `canvas.vs-mesh`。
    - `apply(p: AquaEngineParams | undefined): void` —— 启用/禁用（`p.enabled && p.mesh`）。
    - `unmount(): void`

- [ ] **Step 1: 阅读参考源**

读 `.superpowers/sdd/reference/aqua-src/mesh.ts`。

- [ ] **Step 2: 创建 `MeshEngine.ts`**

忠实移植参考实现：
- `SPACING 90 / REPEL_RADIUS 140 / REPEL_FORCE 30 / SPRING .05 / DAMPING .85 / LINE_GAP 10 / MIN_LINE_DIST 20 / LINE_COLOR rgba(60,100,160,α) / LINE_ALPHA .1 / DOT_ALPHA .2 / FPS 30`。
- 点阵 `cols = ceil(w/SPACING)+1`，`startX/startY` 居中。
- 30fps rAF；`idle` 停帧（`maxV < .01`）；`pointermove` 唤醒；`IntersectionObserver` 可见性。
- reduced-motion 或 coarse：渲染一帧静态网格。
- DPR ≤ 2。
- `apply(p)` 中 `const show = !!(p && p.enabled && p.mesh)`；`this.root.style.display = show ? 'block' : 'none'`；非 show 时停 rAF。

```ts
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
  }
  unmount(): void {
    this.stop();
    window.removeEventListener('pointermove', this.onMove);
    window.clearTimeout(this.resizeTimer);
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
```

- [ ] **Step 3: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过（controller 尚未接线，本任务只建类）。

- [ ] **Step 4: 提交**

```bash
git add app/renderer/src/visual/engines/MeshEngine.ts
git commit -m "feat: MeshEngine 交互网格（90px 弹簧点阵 + 指针排斥）"
```

---

### Task 7: SpotlightEngine 升级（spot-core 几何 + 倾斜配方）

**Files:**
- Modify: `app/renderer/src/visual/engines/SpotlightEngine.ts`
- 参考: `.superpowers/sdd/reference/aqua-src/spot-core.ts`、`spotlight.ts`

**Interfaces:**
- Consumes: `AquaEngineParams`。
- Produces: `SpotlightEngine` 升级：glow 180px + tilt `perspective(800px) rotateX(θx) rotateY(θy) scale(1.01)`；保留接口 `mount/apply/unmount`。

- [ ] **Step 1: 阅读参考源**

读 `.superpowers/sdd/reference/aqua-src/spot-core.ts`（visualRect/glassLocalRect/ensureGlow/startOverlayKeeper）、`spotlight.ts`（GLOW_RADIUS 180 / TILT_MAX .0175 / TILT_PERSPECTIVE 800 / SETTLE_MS 240 / easeBack / rAF 合并）。

- [ ] **Step 2: 升级 SpotlightEngine**

对齐参考实现配方：
- `GLOW_RADIUS = 180`、`GLOW_FALLBACK = 'rgba(90, 215, 255, 0.17)'`。
- glow 背景：`radial-gradient(${GLOW_RADIUS}px at ${px}px ${py}px, var(--vs-aqua-spot-color, ${GLOW_FALLBACK}), transparent 70%)`。
- tilt：`perspective(${TILT_PERSPECTIVE}px) rotateX(${tiltMax * -2 * dy}rad) rotateY(${tiltMax * 2 * dx}rad) scale(1.01)`，`tiltMax = 0.0175`；`transform-origin` 居中；reduced-motion 跳过。
- easeBack：tilt 结束后 `transition` 归位 → `setTimeout(SETTLE_MS=240)` 移除 inline transform。
- rAF 合并 pointermove 每帧单写。
- 保留现有 seam-stamp（`data-vs-spot`/`data-vs-press` 注入）与 teardown（transform 复位 + glowMap 清理，Revision 1 已修）。
- 播放页/设置页 span：spot 元素沿用现有 SPOT_SELECTORS。

- [ ] **Step 3: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过。

- [ ] **Step 4: 提交**

```bash
git add app/renderer/src/visual/engines/SpotlightEngine.ts
git commit -m "feat: SpotlightEngine 对齐参考配方（180px 聚光 + perspective800 倾斜 + easeBack）"
```

---

### Task 8: controller 编排升级 + MeshEngine 接线 + 视频壁纸

**Files:**
- Modify: `app/renderer/src/visual/controller.ts`
- Modify: `app/renderer/src/visual/visual.css`（video 壁纸样式）

**Interfaces:**
- Consumes: MeshEngine（Task 6）、FluidEngine/CrittersEngine/SpotlightEngine/EdgeFadeLayer。
- Produces: controller 挂载 MeshEngine；`applyEngines` 接线 `mesh.apply(p.aqua)`；`engineParams.aqua` 含新字段。

- [ ] **Step 1: 导入并实例化 MeshEngine**

```ts
import { MeshEngine } from './engines/MeshEngine';
```

```ts
const mesh = new MeshEngine();
```

- [ ] **Step 2: initVisualSystem 挂载**

在 `spotlight.mount();` 后追加：

```ts
  mesh.mount(root);
```

- [ ] **Step 3: applyEngines 接线**

在 `edgeFade.apply(p.aqua, ...)` 后追加：

```ts
  mesh.apply(p.aqua);
```

- [ ] **Step 4: destroyVisualSystem 反挂载**

在 `edgeFade.unmount();` 后追加：

```ts
  mesh.unmount();
```

- [ ] **Step 5: visual.css 追加 .vs-mesh 样式**

在 Aqua 区块追加：

```css
.vs-mesh {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none;
}
```

- [ ] **Step 6: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过。

- [ ] **Step 7: 提交**

```bash
git add app/renderer/src/visual/controller.ts app/renderer/src/visual/visual.css
git commit -m "feat: controller 编排 MeshEngine"
```

---

### Task 9: wallpaper-store（IndexedDB + FSA 视频壁纸）

**Files:**
- Create: `app/renderer/src/visual/engines/wallpaper-store.ts`
- 参考: `.superpowers/sdd/reference/aqua-video-wallpaper-reference.md`

**Interfaces:**
- Consumes: 无（纯工具模块）。
- Produces:
  - `saveVideoBlob(blob: Blob): Promise<string>` → `idb:<id>` 或 `''`
  - `loadVideoBlob(id: string): Promise<Blob | null>`
  - `deleteVideoBlob(id: string): Promise<void>`
  - `saveVideoHandle(handle: FileSystemFileHandle): Promise<boolean>`
  - `loadVideoHandle(): Promise<FileSystemFileHandle | null>`
  - `isVideoWallpaper(wallpaper: string): boolean`（`data:video/` | `idb:` | `fsa:` 前缀）

- [ ] **Step 1: 创建 `wallpaper-store.ts`**

逐字移植 `.superpowers/sdd/reference/aqua-video-wallpaper-reference.md` 的 wallpaper-store 部分为 TS。DB 名用 `aurora-aqua-media`（避免与参考插件冲突）。

```ts
const DB_NAME = 'aurora-aqua-media';
const STORE = 'wallpaper';
const DB_VERSION = 1;
const HANDLE_KEY = 'videoHandle';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
  });
}
function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function saveVideoBlob(blob: Blob): Promise<string> {
  try {
    const db = await openDb();
    const id = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await new Promise<void>((resolve, reject) => {
      const request = tx(db, 'readwrite').put(blob, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('blob put failed'));
    });
    db.close();
    return `idb:${id}`;
  } catch {
    return '';
  }
}

export async function loadVideoBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const request = tx(db, 'readonly').get(id);
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('blob get failed'));
    });
    db.close();
    return blob;
  } catch {
    return null;
  }
}

export async function deleteVideoBlob(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const request = tx(db, 'readwrite').delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
    db.close();
  } catch {}
}

export async function saveVideoHandle(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const request = tx(db, 'readwrite').put(handle, HANDLE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('handle put failed'));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadVideoHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDb();
    const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
      const request = tx(db, 'readonly').get(HANDLE_KEY);
      request.onsuccess = () => resolve((request.result as FileSystemFileHandle | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('handle get failed'));
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export function isVideoWallpaper(wallpaper: string): boolean {
  return wallpaper.startsWith('data:video/') || wallpaper.startsWith('idb:') || wallpaper.startsWith('fsa:');
}
```

- [ ] **Step 2: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过。

- [ ] **Step 3: 提交**

```bash
git add app/renderer/src/visual/engines/wallpaper-store.ts
git commit -m "feat: wallpaper-store IndexedDB 视频 blob + File System Access 句柄"
```

---

### Task 10: FluidEngine / CrittersEngine 视频壁纸应用 + video 元素

**Files:**
- Modify: `app/renderer/src/visual/engines/FluidEngine.ts`
- Modify: `app/renderer/src/visual/visual.css`
- 参考: `.superpowers/sdd/reference/aqua-video-wallpaper-reference.md`

**Interfaces:**
- Consumes: `wallpaper-store`（Task 9）。
- Produces: `FluidEngine` 壁纸层支持视频（`<video>` + objectURL + videoBlur/videoBrightness + autoplay muted 回落）；播放页隐藏视频壁纸。

- [ ] **Step 1: FluidEngine 壁纸层扩展视频支持**

在 `FluidEngine` 的壁纸层（`.vs-fluid-wallpaper`）增加 `<video>` 元素；`apply(p)` 中当 `p.backdrop === 'wallpaper'` 且 `isVideoWallpaper(p.wallpaper)` 时：
- `idb:` → `loadVideoBlob(id)` → `URL.createObjectURL(blob)` → `video.src`；替换时 revoke 旧 objectURL；`videoBlobId` 防重复。
- `fsa:` → `loadVideoHandle()` → `queryPermission('read')` granted → `getFile()` → objectURL → `video.src`。
- `data:video/` → 直接 `video.src = wallpaper`。
- `configureWallpaperVideo(video)`：`video.loop = true; if (!video.paused) return; video.play().catch(() => { video.muted = true; video.play().catch(() => {}); })`。
- 非视频时暂停并清 `src`。
- 写 CSS 变量 `--vs-aqua-video-blur` / `--vs-aqua-video-dim`（`(100 - videoBrightness)/100 * .65`）。
- 播放页（`setVideoRect` 非 null 或 controller 传 onPlayer 信号）隐藏视频壁纸：`<video>` 不加载（与 scene 同组受预算约束）。

实现要点：`apply` 需要知道 onPlayer。现有 `apply(p: AquaEngineParams | undefined)` 无 onPlayer 参数。改为 `apply(p: AquaEngineParams | undefined, onPlayer: boolean)`（与 CrittersEngine 同签名），controller 传 `state === 'playback' || state === 'immersive'`。

- [ ] **Step 2: 更新 controller 调用点**

`controller.ts` `applyEngines` 中：

```ts
  fluid.apply(p.aqua, state === 'playback' || state === 'immersive');
```

（替换现有 `fluid.apply(p.aqua);`。）

- [ ] **Step 3: visual.css 视频壁纸样式**

```css
.vs-fluid-wallpaper video {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; pointer-events: none;
  filter: blur(var(--vs-aqua-video-blur, 0px));
}
.vs-fluid-wallpaper[data-media="video"]::after {
  content: ""; position: absolute; inset: 0;
  background: rgb(255 255 255 / calc(var(--vs-aqua-video-dim, 0.36) * 1.3));
}
:root[data-theme="dark"] .vs-fluid-wallpaper[data-media="video"]::after {
  background: rgb(8 12 20 / var(--vs-aqua-video-dim, 0.36));
}
```

- [ ] **Step 4: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过。

- [ ] **Step 5: 提交**

```bash
git add app/renderer/src/visual/engines/FluidEngine.ts app/renderer/src/visual/visual.css app/renderer/src/visual/controller.ts
git commit -m "feat: 视频壁纸应用（idb/fsa/data:video + 自动播放回落 + 播放页隐藏）"
```

---

### Task 11: 内嵌 Space Grotesk 字体 + 字体栈对齐

**Files:**
- Create: `app/renderer/src/visual/fonts.css`
- Modify: `app/renderer/src/main.tsx`（import fonts.css）
- 参考: `.superpowers/sdd/reference/aqua-src/fonts.module.css`

**Interfaces:**
- Produces: `Space Grotesk Variable` @font-face 三段 woff2-variations data-URI；`--font` / `--vs-font-ui` 栈对齐 DSH（'Space Grotesk Variable', system CJK）。

- [ ] **Step 1: 创建 `fonts.css`**

从 `.superpowers/sdd/reference/aqua-src/fonts.module.css` 提取三段 `@font-face`（latin-ext / latin / 拉丁子集），data-URI 逐字复制，写为 `app/renderer/src/visual/fonts.css`：

```css
@font-face {
  font-family: 'Space Grotesk Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 300 700;
  src: url(data:font/woff2;base64,<BASE64_LATIN_EXT>) format("woff2-variations");
  unicode-range: U+102-103,U+110-111,U+128-129,U+168-169,U+1A0-1A1,U+1AF-1B0,U+300-301,U+303-304,U+308-309,U+323,U+329,U+1EA0-1EF9,U+20AB;
}
@font-face {
  font-family: 'Space Grotesk Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 300 700;
  src: url(data:font/woff2;base64,<BASE64_LATIN>) format("woff2-variations");
  unicode-range: U+100-2BA,U+2BD-2C5,U+2C7-2CC,U+2CE-2D7,U+2DD-2FF,U+304,U+308,U+329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;
}
@font-face {
  font-family: 'Space Grotesk Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 300 700;
  src: url(data:font/woff2;base64,<BASE64_LATIN_BASIC>) format("woff2-variations");
  unicode-range: U+??,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
```

（`<BASE64_*>` 占位——实施者从参考源 fonts.module.css 复制对应 data-URI 的 base64 内容，逐字不动。）

- [ ] **Step 2: main.tsx import fonts.css**

在 `app/renderer/src/main.tsx` 中追加（与现有 `./visual/visual.css` import 并列）：

```ts
import './visual/fonts.css';
```

- [ ] **Step 3: resolver 字体栈对齐**

`app/renderer/src/visual/resolver.ts` 的 `TYPEFACES` 中 `clean`（Aqua 的 typography）改为：

```ts
  clean: { display: '"Space Grotesk Variable", "Segoe UI Variable Display", "Segoe UI", sans-serif', ui: '"Space Grotesk Variable", "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif', mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace', headingWeight: 600, headingSpacing: '-0.01em' },
```

- [ ] **Step 4: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过（字体 CSS 不影响 TS）。

- [ ] **Step 5: 提交**

```bash
git add app/renderer/src/visual/fonts.css app/renderer/src/main.tsx app/renderer/src/visual/resolver.ts
git commit -m "feat: 内嵌 Space Grotesk Variable 字体 + 字体栈对齐 DSH"
```

---

### Task 12: VisualConsole 归并（移除 Aqua 页签，参数并入外观/氛围）

**Files:**
- Modify: `app/renderer/src/visual/VisualConsole.tsx`

**Interfaces:**
- Consumes: `VisualStore.setParam`（`aqua.*`）、`useActiveTheme`。
- Produces: 移除 `'aqua'` Tab；外观页签含 mode/流体/亮度/壁纸（图+视频）/壁纸模糊磨砂/视频模糊亮度；氛围页签含 mesh/edgeFade/spotlight/press/critters/whale。

- [ ] **Step 1: 移除 'aqua' Tab**

```ts
type Tab = 'preset' | 'appearance' | 'atmosphere' | 'particles' | 'motion' | 'player' | 'advanced';
```

```ts
const DEFAULT_TABS: Tab[] = ['preset', 'appearance', 'atmosphere', 'particles', 'motion', 'player'];
```

- [ ] **Step 2: 移除页签可见性过滤**

`GROUPS.filter(([id]) => id === 'advanced' || DEFAULT_TABS.includes(id)).filter(([id]) => id !== 'aqua' || ...)` 中的第二个 `.filter` 移除，恢复为：

```ts
          {GROUPS.filter(([id]) => id === 'advanced' || DEFAULT_TABS.includes(id)).map(([id, l]) => (
```

- [ ] **Step 3: SLIDERS 增加 aqua 参数到外观页签**

`SLIDERS['appearance']` 追加：

```ts
    { path: 'aqua.mode', label: '模式', min: 0, max: 1, step: 1, fmt: (v) => (v ? 'compat' : 'mica') },
    { path: 'aqua.fluidHue', label: '流体色相', min: 0, max: 360, step: 1, fmt: (v) => `${Math.round(v)}°` },
    { path: 'aqua.fluidDepth', label: '流体深度', min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}` },
    { path: 'aqua.bgBrightness', label: '背景亮度', min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}` },
    { path: 'aqua.wallpaperBlur', label: '壁纸模糊', min: 0, max: 40, step: 0.5, fmt: (v) => `${Math.round(v)}px` },
    { path: 'aqua.wallpaperFrost', label: '壁纸磨砂', min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}%` },
    { path: 'aqua.videoBlur', label: '视频模糊', min: 0, max: 40, step: 0.5, fmt: (v) => `${Math.round(v)}px` },
    { path: 'aqua.videoBrightness', label: '视频亮度', min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}%` },
```

**注意**：`aqua.mode` 是 'mica'|'compat' 字符串，不是数字 slider。改为 SEG_OPTS 处理：

```ts
  'aqua.mode': [['mica', '云母效果'], ['compat', '兼容模式']],
```

并将 SLIDERS 中 `aqua.mode` 行删除（用 segRow）。

- [ ] **Step 4: SWITCHES 增加 aqua 参数到氛围页签**

`SWITCHES['atmosphere']` 追加：

```ts
  atmosphere: [
    ['lighting.enabled', '环境光'],
    ['aqua.edgeFade', '边缘雾化'],
    ['aqua.spotlight', '光标聚光'],
    ['aqua.press', '悬浮按压'],
    ['aqua.critters', '海洋生物'],
    ['aqua.mesh', '交互网格'],
    ['aqua.whale', '粒子鲸鱼'],
  ],
```

- [ ] **Step 5: SEG_OPTS 增加背景源 + mode**

```ts
  'aqua.backdrop': [['fluid', '流体'], ['wallpaper', '壁纸']],
  'aqua.mode': [['mica', '云母效果'], ['compat', '兼容模式']],
```

- [ ] **Step 6: 外观页签追加 segRow + 壁纸行**

`paramsPane()` 中 `if (tab === 'appearance')` 块内追加：

```ts
      rows.push(segRow('aqua.mode', 'Aqua 模式'));
      rows.push(segRow('aqua.backdrop', '背景源'));
      rows.push(
        <div className="vc-row" key="wallpaper">
          <span>壁纸</span>
          <div className="vc-seg">
            <label className="vc-file" style={{ cursor: 'pointer' }}>
              选择图片
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fr = new FileReader();
                  fr.onload = () => { VisualStore.setParam('aqua.wallpaper', String(fr.result)); toast('已设置壁纸'); };
                  fr.readAsDataURL(f);
                  e.target.value = '';
                }} />
            </label>
            <label className="vc-file" style={{ cursor: 'pointer' }}>
              选择视频
              <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  VisualStore.setParam('aqua.backdrop', 'wallpaper');
                  import('./engines/wallpaper-store').then(({ saveVideoBlob }) => saveVideoBlob(f).then((id) => {
                    if (id) VisualStore.setParam('aqua.wallpaper', id);
                  }));
                  e.target.value = '';
                }} />
            </label>
            <button onClick={() => { VisualStore.setParam('aqua.wallpaper', ''); toast('已清除壁纸'); }}>清除</button>
          </div>
        </div>,
      );
```

- [ ] **Step 7: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过。

- [ ] **Step 8: 提交**

```bash
git add app/renderer/src/visual/VisualConsole.tsx
git commit -m "feat: VisualConsole 归并——Aqua 参数并入外观/氛围页签（图+视频壁纸）"
```

---

### Task 13: Settings 移除主题切换

**Files:**
- Modify: `app/renderer/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `VisualStore` / `useActiveTheme`。
- Produces: 移除「当前主题」seg；保留「打开 Visual Console」与明暗切换。

- [ ] **Step 1: 移除主题切换 seg**

`Settings.tsx` 中 `group === 'ui'` 块内的「当前主题」srow（`VisualStore.listPresets().map(...)`）删除，改为显示当前主题名 + 打开 Console：

```tsx
            <div className="srow">
              <span>当前主题<small>（Aqua · Visual System）</small></span>
              <button className="seg-action" onClick={() => VisualSystem.setConsoleOpen(true)}>打开 Visual Console</button>
            </div>
            <div className="srow">
              <span>详细参数</span>
              <button className="seg-action" onClick={() => VisualSystem.setConsoleOpen(true)}>打开 Visual Console</button>
            </div>
```

（若两行冗余，合并为一行。保留明暗切换 srow 不动。）

- [ ] **Step 2: 清理未用 import**

`Settings.tsx` 中 `VisualStore` 若不再被引用（`useActiveTheme` 仍用于高亮则保留），移除未用 import。检查 `activeTheme` 变量是否仍被使用，若否移除。

- [ ] **Step 3: 验证类型 + 构建**

Run: `npx tsc --noEmit`（`app/renderer/`）；`npm run build`（`app/`）
Expected: 零错误，build 通过。

- [ ] **Step 4: 提交**

```bash
git add app/renderer/src/pages/Settings.tsx
git commit -m "feat: Settings 移除主题切换，仅保留 Aqua + Visual Console 入口"
```

---

### Task 14: 文档 + 全量回归

**Files:**
- Modify: `docs/06-视觉主题系统设计.md`

- [ ] **Step 1: 追加 Revision 2 说明**

在 `docs/06-视觉主题系统设计.md` 末尾追加：

```markdown
## 18. Revision 2 — Aqua 全量移植（2026-08-17）

**来源：** 用户提供 DSH-Transparent-UI-Plugin 完整编译产物，Aqua 升级为参考实现的**全量忠实移植**。规格见 `docs/superpowers/specs/2026-08-17-aqua-ui-design.md` §11。

**变更：** 删除 6 个旧主题（Cinema/Aurora/Noir/OLED/Glass/Immersive），Aqua 唯一官方主题；真实 WebGL2 流体仿真（flow-map 双缓冲 + 涟漪）；粒子鲸鱼（SVG 亮度网格采样）；交互网格；mica/compat 双模式；图像+视频壁纸（IndexedDB + File System Access）；内嵌 Space Grotesk 字体；调色板对齐 DSH token；明暗双套 token 对比可读（visual-test 断言亮度差 ≥60）。
```

- [ ] **Step 2: 全量回归**

Run（`app/`）：
```bash
npx tsc --noEmit   # app/renderer/
npm run build
node scripts/visual-test.js
node scripts/hdr-test.js
node scripts/dmc-test.js
node scripts/pipe-test.js
node scripts/security-test.js
```
Expected: 全绿（visual-test `RESULT ok=... fail=0`；hdr 23/23；dmc 21/21；pipe PIPE OK；security 12/12）。

- [ ] **Step 3: 真机 QA 清单（手动，需 mpv + 显示器）**

```text
1. 启动 → 首页默认 Aqua：流体板流动、鲸鱼居中、网格点阵、鱼/气泡游动、边缘雾化、毛玻璃卡。
2. 明暗切换：Aqua dark 深海军蓝 / Aqua light 冷白蓝；字体对比可读（亮度差 ≥60）。
3. 外观页签：mode mica/compat 切换；流体色相/深度实时生效；背景源 fluid/wallpaper；图片壁纸、视频壁纸（idb）播放；壁纸模糊/磨砂/视频亮度可调。
4. 氛围页签：mesh/edgeFade/spotlight/press/critters/whale 开关实时生效。
5. 播放 16:9 与 2.35:1 视频：letterbox 边缘流体、中心露视频；全屏同宽高比流体隐藏；视频壁纸在播放页隐藏。
6. 黑场中心 lum ≤0.067、白场中心 ≥0.94 复测；drop-frame Δ=0。
7. 截图存档 prototype/redesign/qa-shots/（Home+Aqua 暗/浅、流体/壁纸、Console 外观/氛围、视频壁纸）。
```

- [ ] **Step 4: 提交**

```bash
git add docs/06-视觉主题系统设计.md
git commit -m "docs: 记录 Revision 2 Aqua 全量移植"
```

---

## Self-Review 记录

- **Spec 覆盖**：Revision 2 规格 §11 全部落到任务：schema（Task 1）→ registry 瘦身（Task 2）→ store 收敛（Task 3）→ 流体仿真（Task 4）→ 鲸鱼/critters（Task 5）→ mesh（Task 6）→ spotlight 配方（Task 7）→ controller 接线（Task 8）→ wallpaper-store（Task 9）→ 视频壁纸应用（Task 10）→ 字体（Task 11）→ Console 归并（Task 12）→ Settings 切换移除（Task 13）→ 文档/回归（Task 14）。
- **可读性**：调色板对齐 DSH + visual-test 亮度差 ≥60 断言（Task 2 Step 1）+ 实机 QA（Task 14 Step 3）覆盖 §11.2。
- **占位符**：`<BASE64_*>` 在 Task 11 是**有意占位**——实施者必须从参考源 fonts.module.css 逐字复制，计划明确标注；非计划缺陷。其余步骤均含完整代码。
- **类型一致性**：`FluidEngine.apply` 签名在 Task 10 改为 `(p, onPlayer)`，controller 调用点同步更新（Task 10 Step 2），CrittersEngine 已是同签名。`engineParams.aqua` 新字段（mode/mesh/videoBlur/videoBrightness）在 Task 1 定义、Task 2 resolver 透传、Task 4-10 引擎消费、Task 12 Console 调参，命名一致。
- **顺序依赖**：Task 1 → 2 → 3（schema→registry→store）；Task 4-7 引擎升级独立可并行（但按 SDD 顺序执行）；Task 8 依赖 Task 6；Task 10 依赖 Task 9；Task 12 依赖 Task 2（aqua 参数存在）+ Task 10（视频壁纸）。Task 2 的测试计数改动必须与 registry 删除同批提交（避免中间态红）。
