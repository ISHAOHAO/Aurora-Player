# Aurora Player — Aqua 深海水主题 UI 设计文档

**状态：** 已确认（2026-08-17）
**范围：** 整体 UI 仿照 [DSH-Transparent-UI-Plugin](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)（Aqua 毛玻璃主题）重做为默认外观；现有 6 主题视觉系统保留为可选。
**约束：** 不动 mpv/IPC/DLNA/HDR 决策链/媒体库/播放逻辑/窗口生命周期/托盘/防火墙/硬解。

---

## 1. 已确认决策

| # | 决策 | 结论 |
|---|---|---|
| 1 | 落地范围 | **整体 UI 重做为 Aqua 风格**，作为默认外观 |
| 2 | 播放页处理 | **Video First + Aqua 控件**（控制层/顶栏毛玻璃）**+ 流体背景盖外圈边缘带**（不遮视频中心） |
| 3 | 特性清单 | 全部移植：深海调色板+毛玻璃 · 流体背景/壁纸 · 边缘渐变模糊 · 光标聚光+悬浮按压 · 粒子海洋生物 |
| 4 | 现有主题系统 | **Aqua 为默认，6 主题 + VisualConsole 降为可选** |
| 5 | 架构耦合 | **Aqua 是第 7 内置主题，扩展 schema**（非独立外壳层） |
| 6 | 实现路径 | 完整移植：扩展 schema + 新增 Fluid/Critters/Spotlight 引擎 + 边缘雾化层 |

---

## 2. 技术约束（播放页透明窗）

- 透明窗 + mpv 原生子窗口：DOM 层 `backdrop-filter` / `mix-blend` **无法**读取/混合到 mpv 视频。
- 播放页上「流体背景只盖外圈」：用视频 `w/h` 与窗口宽高比推导 letterbox 区域，把流体层 mask 到边缘带；中心区域保持透明露出视频。视频充满窗口（宽高比相同）时流体隐藏。
- 播放页毛玻璃控件 = 半透明染色（背后无 DOM 可模糊），暗色 `rgba(0,0,0,.4)` 底 + 内高光 + 细边框。

---

## 3. 架构与 Schema 扩展

### 3.1 Schema（types.ts）

```ts
export type BackgroundMode = 'solid' | 'gradient' | 'cover' | 'fluid' | 'wallpaper' | 'none';

export interface VisualTheme {
  // ...现有字段不变...
  aqua?: {
    backdrop: 'fluid' | 'wallpaper';     // 背景源
    fluidHue: number;                    // 0-360 流体色相
    fluidDepth: number;                  // 0-100 深饱和 ↔ 浅淡
    bgBrightness: number;                // 0-100（暗色 0-50 压暗 / 浅色 50-100 提亮，50 原样）
    wallpaper: string;                   // dataURL，空=无
    wallpaperBlur: number;  wallpaperFrost: number;
    edgeFade: boolean;                   // 顶/底边缘雾化带
    spotlight: boolean;                  // 光标聚光
    press: boolean;                      // hover 3D 按压
    critters: boolean;                   // 海洋生物（鱼/气泡/浮游）
    whale: boolean;                      // 粒子鲸鱼（居中）
  };
}
```

### 3.2 引擎编排（controller.ts + engines/）

```
controller → refresh()
  ├─ scene: BackgroundEngine   (mode='fluid'|'wallpaper' → 挂 FluidEngine / 壁纸层)
  ├─ atmosphere: AtmosphereEngine (grain/vignette/bloom，不变)
  ├─ lighting: LightingEngine (不变)
  ├─ particles: ParticleEngine (不变)
  ├─ aqua: FluidEngine + CrittersEngine + SpotlightEngine + EdgeFadeLayer
  └─ motion: MotionEngine (不变)
```

| 新增 | 职责 |
|---|---|
| `engines/FluidEngine.ts` | WebGL 流体板（移植 deepseek.com 流体着色器），全窗 canvas 挂在 `#vs-atmosphere`、UI 之下；色相/深度/亮度驱动 |
| `engines/CrittersEngine.ts` | 粒子鲸鱼（canvas）+ 鱼/气泡/浮游（CSS 动画 SVG 剪影，低开销） |
| `engines/SpotlightEngine.ts` | 往玻璃面板注入聚光 div（`pointermove` 写 inline background）+ hover 3D 倾斜 |
| `engines/EdgeFadeLayer.ts` | 顶/底 13px 渐变模糊带（CSS 挂载，悬浮滚动内容之上、玻璃卡之下） |

---

## 4. 玻璃卡片配方（resolver 产出令牌）

```css
/* 浅色玻璃卡片（浮层） */
--vs-glass-card-light: linear-gradient(180deg,
  color-mix(in srgb, rgb(255 255 255) calc(50% * var(--vs-frost,1)), transparent),
  color-mix(in srgb, rgb(255 255 255) calc(35% * var(--vs-frost,1)), transparent));
/* 暗色玻璃卡片：中性冷灰，非蓝（避免 frost 拉满显蓝 slab） */
--vs-glass-card-dark: linear-gradient(180deg,
  color-mix(in srgb, rgb(42 46 56) calc(50% * var(--vs-frost,1)), transparent),
  color-mix(in srgb, rgb(22 25 34) calc(50% * var(--vs-frost,1)), transparent));
```

- `--vs-frost` 由 `ui.glass`（0.05–1）映射：`frost = ui.glass * 1.4`。
- 卡片统一：`border-radius` 20px 大浮层 / 14px 面板 / 8px 原子；暗色边框 `rgba(148,180,220,.32)`、浅色 `rgba(19,45,83,.26)`；`inset 0 1px 0 rgba(255,255,255,.5)` 内高光；`0 10px 36px rgba(2,6,14,.5)` 外阴影；`backdrop-filter: blur(var(--vs-glass-blur))`。

### 页面浮层映射

| 页面 | 悬浮玻璃卡片元素 |
|---|---|
| 首页 | `topbar`、`hero-card`、`shortcuts` 磁贴、`poster` 封面、`url-modal`/`nas-browser` 弹窗 |
| 播放页 | `control-deck`（底部张开样式）、`top-info`、`pop-menu`/`console-drawer`/`cast-toast`、`win-float` |
| 设置页 | `settings-topbar`、`settings-nav`、分组面板（`srow` 卡片化）、`settings-head` |

### 交互细节（DSH 招牌）

- 光标聚光：玻璃卡注入 `data-vs-spot` → SpotlightEngine 写聚光 div；仅 Aqua 启用。
- hover 按压：`data-vs-press` 卡 `perspective(800px) rotateX/rotateY` 微倾斜（reduced-motion 跳过）。
- 边缘雾化：顶/底 13px `backdrop-filter: blur(5px)` + 轻色罩（浅微白/暗微黑）。
- 文字防糊：滚动正文 `text-shadow 0 0 1px` 光环。

---

## 5. Aqua 主题参数（registry.ts 第 7 主题）

```ts
{
  id: 'aqua', name: 'Aqua', source: 'builtin', version: 1,
  description: '深海水主题：毛玻璃浮层 · 流体背景 · 海洋生物 · 光标聚光',

  scene: { mode: 'fluid', bgOpacity: 0.9, cover: { follow: true, locked: false, auto: true } },
  lighting: { enabled: true, intensity: 0.45, blur: 34, spread: 0.55, saturation: 0.75, temperature: 0.8 },
  particles: { enabled: true, density: 0.16, speed: 0.2, size: 0.42, opacity: 0.4, depth: 0.35, reaction: 0.25,
    color: '#A9C6EF', colorSecondary: '#7EA4DF', glow: 0.18, blur: 1.4, foregroundRatio: 0.02,
    distribution: 'uneven', motion: 'drift' },
  motion: { enabled: true, camera: 0.2, parallax: 0.3, kenBurns: 0.5, transitionSpeed: 460 },
  atmosphere: { grain: 0.25, bloom: 0.22, vignette: 0.22, aberration: 0.1 },

  ui: { opacity: 0.92, glass: 0.72, blur: 20, border: 0.2, radius: 14, density: 'comfortable', accent: '#6E9BE8' },
  player: { controlOpacity: 0.85, autoHide: 3, metadata: 'normal', defaultPresentation: 'normal' },

  signature: { layout: 'glass', typography: 'clean', surface: 'glass', shape: 'translucent', density: 'medium', motion: 'medium', atmosphere: 'layered' },

  appearance: {
    light: {
      scene: { start: '#F4F8FD', middle: '#EAF1F9', end: '#DCE7F4', angle: 170 },
      base: '#F4F8FD', surface: '#FFFFFF', surface2: '#ECF2FA', text: '#13243E',
      accent: '#3F76D8', bgOpacity: 0.4, lightingIntensity: 0.5, grain: 0.2, vignette: 0.1,
    },
  },

  aqua: {
    backdrop: 'fluid', fluidHue: 320, fluidDepth: 25, bgBrightness: 50,
    wallpaper: '', wallpaperBlur: 0, wallpaperFrost: 0,
    edgeFade: true, spotlight: true, press: true, critters: true, whale: true,
  },
}
```

- 暗色：`base #0C121B`、`surface #111A27`、`text #EAF2FC`、accent `#6E9BE8`（resolver 从 `scene.fluid` 派生）。
- 浅色：`#F4F8FD` 冷白蓝、accent `#3F76D8`。
- 边框/描边：`rgba(148,180,220,…)` 暗色 / `rgba(19,45,83,…)` 浅色。

---

## 6. 默认值与迁移（store.ts / persist.ts）

1. 出厂默认：`store.ts` 初始 `activeThemeId = 'aqua'`（替换 `'cinema'`）。
2. 首次启动迁移：`migrateFromVisualMode` 旧 `visualMode` 映射不变；无 `visualMode`（全新）→ `aqua`；无对应项 → 落到 `aqua`。
3. 已有用户：`visual.json` 已有 `activeThemeId` → 保持不动。
4. `removePreset` / `resetActive` 兜底值 `'cinema'` 统一改为 `'aqua'`。
5. 编辑官方 Aqua → 自动 clone 为 Custom Copy（现有 `ensureEditable`，无需改动）。

---

## 7. VisualConsole「Aqua」页签

```ts
// 新 Tab：'aqua'（仅当激活主题存在 aqua 段时显示）
SLIDERS['aqua'] = [
  { path: 'aqua.fluidHue', label: '流体色相', min: 0, max: 360, step: 1, fmt: v => `${Math.round(v)}°` },
  { path: 'aqua.fluidDepth', label: '流体深度', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}` },
  { path: 'aqua.bgBrightness', label: '背景亮度', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}` },
  { path: 'aqua.wallpaperBlur', label: '壁纸模糊', min: 0, max: 40, step: 1, fmt: v => `${Math.round(v)}px` },
  { path: 'aqua.wallpaperFrost', label: '壁纸磨砂', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%` },
];
SWITCHES['aqua'] = [
  ['aqua.edgeFade', '边缘雾化'], ['aqua.spotlight', '光标聚光'],
  ['aqua.press', '悬浮按压'], ['aqua.critters', '海洋生物'], ['aqua.whale', '粒子鲸鱼'],
];
// 背景源：'aqua.backdrop' → [['fluid','流体'], ['wallpaper','壁纸']]
```

- **壁纸选择（零 IPC）**：VisualConsole 内用 `<input type="file" accept="image/*">` + `FileReader.readAsDataURL`，dataURL 通过 `setParam('aqua.wallpaper', url)` 写入主题。现有 IPC 面不变，无需新开 `main.js` 通道。（不新增 IPC —— 保持持久化边界与现有 4 个 visual IPC 一致。）
- 持久化纪律不变：slider 直写内存 + debounce 500ms 落盘，Save/SaveAs 立即写。

---

## 8. 测试与验收

| 类别 | 手段 |
|---|---|
| 单元/渲染层 | 扩展 `visual-test`：Aqua 主题切换、fluid/wallpaper 背景源切换、`aqua.*` 参数实时生效、Console Aqua 页签可见性、非 Aqua 主题无 aqua 页签 |
| 真机 QA | `prototype/redesign/qa-shots/` 补拍：Home+Aqua（暗/浅）、Player+Aqua（含 letterbox 边缘流体）、Console+Aqua、wallpaper 模式 |
| Video First 回归 | 黑场中心 lum ≤0.067 / 白场中心 ≥0.94 复测；letterbox 边缘带含流体、中心区域无覆盖 |
| 性能 | 流体 canvas DPR≤1.5、rAF 节流、页面离开/immersive/idle 停帧；critters 仅合成层；drop-frame Δ=0 复测 |
| 回归 | `npx tsc --noEmit`、`npm run build`、`visual-test`、`hdr-test`、`dmc-test`、`pipe-test` 全绿 |

---

## 9. 文件改动清单

```
types.ts        + BackgroundMode('fluid'|'wallpaper') + VisualTheme.aqua?
registry.ts     + Aqua 主题（第 7 内置）
resolver.ts     + aqua 令牌（玻璃卡片配方/流体验证/亮度罩/聚光/按压）+ engineParams.aqua
controller.ts   + FluidEngine/CrittersEngine/SpotlightEngine/EdgeFadeLayer 编排 + 视频矩形 mask
engines/FluidEngine.ts       新增（WebGL 流体着色器）
engines/CrittersEngine.ts    新增（鲸鱼 canvas + 鱼/气泡 CSS）
engines/SpotlightEngine.ts   新增（聚光 + 3D 按压）
engines/EdgeFadeLayer.ts     新增（顶/底雾化带）
visual.css      + aqua 玻璃卡片配方、聚光/按压/边缘雾化、页面浮层映射
VisualConsole.tsx  + aqua 页签
store.ts        默认 aqua + 迁移兜底 aqua
styles.css      + 播放页玻璃染色特判（如需）
docs/06-视觉主题系统设计.md  追加 Aqua 主题设计节
```

---

## 10. 不做的事（YAGNI）

- 不新增在线刮削/外部依赖（流体着色器为自研移植，零依赖）。
- 不改架构核心：Video First 预算、三类强度独立、IPC 持久化边界均保留。
- 不把 6 主题变成 6 个不同 App；Aqua 只作为默认主题与可选主题之一。
- 不做 Aqua 之外的额外主题。
