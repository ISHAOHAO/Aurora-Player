# Aurora Player

> Win10/Win11 沉浸式视频播放器 —— 本地 / 网络 / DLNA 全能播放，HDR 画质决策链，媒体中心。

Aurora Player 是一款面向 Windows 11 的桌面视频播放器，以「电影镜头、粒子视觉与舞台」为设计语言，在 mpv 解码内核之上构建了完整的沉浸式体验：自绘控制层、HDR 画质决策、DLNA 投屏（MediaRenderer）、本地媒体库海报墙与 NAS/SMB 在线浏览。

---

## ✨ 特性

- **全能播放**：mpv 内核，覆盖 MP4/MKV/AVI/MOV/TS/WebM 等主流容器；硬件解码自动协商（D3D11VA / DXVA2 / NVDEC），失败自动降级到软件解码，不报「无法播放」。
- **HDR 画质决策链**：HDR10 / HLG 自动直通或色调映射，7 种 Tone Mapping 算法可选，支持目标峰值 / 对比度恢复 / 饱和度等实时调参。
- **DLNA 投屏**：完整实现 DLNA MediaRenderer（DMR），手机 / NAS / 电视可发现并推送播放，支持状态同步、控制权仲裁、后台待机接收投屏。
- **媒体库**：纯本地刮削海报墙（文件名 / nfo / 同目录封面解析，无在线依赖），剧集识别、无封面自动抽帧。
- **沉浸式 UI**：明暗双主题、环境光舞台（柔光场 + 粒子尘光）、三级 Glass 浮层、自绘控制层，UI 与视频引擎完全解耦。
- **缩略图预览**：进度条悬停显示真实帧缩略图 + 章节标记 + 时间气泡。
- **NAS / SMB 在线浏览**：UNC 路径直连点播，无需入库。
- **工程化细节**：mpv 独立子进程（崩溃自动恢复）、防火墙自检、系统托盘待机、续播记忆。

---

## 🧱 技术栈

| 层       | 选型                                                          |
| ------- | ----------------------------------------------------------- |
| 应用壳     | Electron 43                                                 |
| 渲染层     | React 19 + TypeScript（strict）+ Vite 8                       |
| 播放引擎    | mpv 0.41（子进程 `--wid` 嵌入，命名管道 JSON IPC）                      |
| DLNA 服务 | 零依赖自研协议栈（SSDP / SOAP / GENA），Electron `utilityProcess` 独立进程 |
| 媒体库     | JSON 持久化 + mpv `--vo=image` 抽帧（本地刮削，无 SQLite 依赖）            |

## 🏗️ 架构概览

```text
┌────────────────────────────────────────────────────────┐
│  Aurora Player（唯一主窗口，transparent）                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  React 渲染层（Vite 构建）                         │  │
│  │  #/home 首页 · #/settings 设置 · #/player 播放    │  │
│  └──────────────────────────────────────────────────┘  │
│        ▲ IPC（contextBridge + ipcRenderer）             │
│        │                                                │
│  ┌─────┴─────────────────────────────────────────────┐  │
│  │  主进程 main.js（状态轮询 2Hz → 推送 UI/DLNA）      │  │
│  │  · 播放会话 · HDR 决策链 · 媒体库 · 托盘 · 防火墙   │  │
│  └───┬──────────────┬───────────────┬───────────────┘  │
└──────┼──────────────┼───────────────┼──────────────────┘
       │ 命名管道       │ utilityProcess │ 子进程
       │ JSON-RPC      │ postMessage    │
┌──────▼──────┐  ┌─────▼──────┐  ┌──────▼───────┐
│ mpv.exe     │  │ dlna.js    │  │ mpv --vo=image│
│ 解码/渲染   │  │ SSDP/SOAP  │  │ 缩略图/封面抽帧│
└─────────────┘  └────────────┘  └──────────────┘
```

> **单窗透明方案**：唯一主窗口 `transparent: true`，mpv `--wid` 子窗口在下层透出，React 控制层叠加其上；Hash 路由同窗切换首页 / 设置 / 播放。详见 [`docs/05-实现偏差清单.md`](docs/05-实现偏差清单.md) 中的「黑屏事故与架构修正」。

## 📁 目录结构

```text
播发器/
├── app/                      # Electron 应用
│   ├── main/                 # 主进程（main.js 播放会话、hdr.js 画质决策链）
│   ├── preload/              # contextBridge 桥接层（preload.js）
│   ├── renderer/             # React 渲染层（src/pages、src/components）
│   │   ├── vite.config.ts
│   │   └── dist/             # 构建产物（gitignore）
│   ├── dlna/                 # DLNA 协议栈（ssdp/httpd/xml/dlna，零依赖）
│   ├── scripts/              # 测试与探针脚本（*.js 单测 / *.ps1 自动化验证）
│   └── package.json
├── docs/                     # 设计与规格文档（5 份）
├── prototype/                # M0 静态视觉原型（HTML/CSS，风格定稿）
├── runtime/                  # mpv 运行时 + 测试素材（gitignore，需自行下载）
│   ├── mpv/mpv.exe
│   └── library-test/
└── skills-lock.json          # Agent Skills CLI 锁定文件
```

---

## 🚀 安装步骤

### 1. 环境要求

| 依赖      | 版本                | 说明            |
| ------- | ----------------- | ------------- |
| Windows | 10 / 11（目标 Win10/Win11） | 目前仅支持 Windows |
| Node.js | ≥ 22              | 推荐使用 LTS      |
| npm     | 随 Node 附带         |               |
| mpv 运行时 | 0.41.x            | 见下一步，需手动下载    |

### 2. 克隆仓库

```bash
git clone <repo-url> aurora-player
cd aurora-player
```

### 3. 下载 mpv 运行时

`runtime/` 目录被 `.gitignore` 排除，mpv 二进制需手动获取：

1. 前往 [mpv.io/installation](https://mpv.io/installation/) 下载 Windows 构建（推荐 shinchiro 提供的 `x86_64` 版，**非 v3 版**以兼容旧 CPU）。
2. 解压后，将 `mpv.exe`（及其同目录的 `mpv.com`、`d3dcompiler_43.dll` 等文件）放入 `runtime/mpv/`。

最终结构：

```text
runtime/
└── mpv/
    ├── mpv.exe            # 主程序，main.js 按此路径查找
    ├── mpv.com
    ├── d3dcompiler_43.dll
    └── ...（构建自带的其他文件）
```

> 缺失 mpv 时启动会弹出「缺少 mpv 运行时」错误框。当前项目使用的基准版本为 **mpv v0.41.0（shinchiro 构建）**。

### 4. 安装依赖

依赖在 `app/` 目录下：

```bash
cd app
npm install
```

### 5. 构建并启动

```bash
# 构建渲染层（Vite 输出到 app/renderer/dist/）
npm run build

# 启动应用
npm start
```

或一条命令完成构建 + 启动：

```bash
npm run dev
```

> 首次启动会申请「专用网络」权限并自动添加 Windows 防火墙入站规则（DLNA 投屏需要局域网访问），请允许。

---

## 🎬 使用示例

### 启动与打开视频

```bash
# 直接启动，进入首页
cd app && npm start

# 命令行带文件路径，冷启动直接播放
npm start -- "D:\Movies\sample.mkv"
```

在应用内，通过以下任一方式打开视频：

- 首页「打开文件」磁贴 / Hero 卡片
- 菜单栏 `文件 → 打开视频…`（或 `Ctrl + O`）
- 系统托盘右键 → `打开视频…`
- 直接拖拽文件到播放器窗口

### 快捷键与鼠标操作

| 操作      | 方式                      |
| ------- | ----------------------- |
| 播放 / 暂停 | `空格` 或单击画面              |
| 全屏      | `F` 或双击画面               |
| 快进 / 快退 | `←` / `→`               |
| 音量      | 滚轮（`Shift + 滚轮` 为 Seek） |
| 静音      | `M`                     |
| 打开文件    | `Ctrl + O`              |
| 右键菜单    | 载入字幕、音轨 / 字幕轨切换等        |

> 播放中控制层 3 秒无操作自动隐藏，鼠标移至底部重新唤出；暂停时控制层常驻。

### DLNA 投屏

1. 确认设置页「DLNA」分组已开启（默认开启），设备名可自定义（如「王先生的影音室」）。
2. 在同一局域网内，用手机 / 平板 / NAS 的 DLNA 客户端（Android 自带投屏、BubbleUPnP、Jellyfin、Kodi 等）搜索设备，即可发现 **Aurora Player**。
3. 投屏后，播放页左上角显示 `CASTING · 设备名` 徽标，控制权遵循「本地 UI > 远程控制端」仲裁。

> 开启「后台接收投屏」后，关闭主窗口不会退出应用，DLNA 服务保持可发现，收到投屏自动唤起播放。

### 媒体库

1. 设置页 → `媒体库` 分组 → `添加文件夹`。
2. 扫描完成后，首页「媒体库」分区展示海报墙，文件名自动解析标题 / 年份 / 剧集（`S01E02`、`第N集`）。
3. 无封面视频自动抽帧生成封面；`nfo` 文件与同目录 `poster.jpg` / `cover.jpg` 优先。

### NAS / SMB 在线浏览

首页 `NAS` 磁贴 → 输入 UNC 路径（如 `\\192.168.1.10\movies` 或 `\\NAS\share`），即可在线浏览目录并点播，无需入库。首次访问需凭据时，点「去登录」在资源管理器中完成登录。

---

## 🛠️ 开发指南

### 开发模式

```bash
cd app
npm run dev    # 构建渲染层 + 启动 Electron
```

调试环境变量（主进程 `main.js` 支持）：

| 环境变量                             | 说明              |
| -------------------------------- | --------------- |
| `AURORA_VO=direct3d`             | 强制指定 mpv 视频输出驱动 |
| `AURORA_HWDEC=no`                | 关闭硬件解码（定位解码问题时） |
| `AURORA_MPV_EXTRA='["--x","y"]'` | 追加任意 mpv 启动参数   |

### 运行测试

测试脚本位于 `app/scripts/`：

| 脚本                          | 说明                             |
| --------------------------- | ------------------------------ |
| `node scripts/hdr-test.js`  | HDR 决策链单元测试                    |
| `node scripts/hdr-e2e.js`   | HDR 端到端验证（lavfi 生成测试片）         |
| `node scripts/dmc-test.js`  | DLNA 虚拟 DMC 验收（需先 `npm start`） |
| `node scripts/pipe-test.js` | mpv 命名管道 IPC 验证                |
| `scripts/*.ps1`             | 窗口 / 拖拽 / 缩放 / 截图等自动化探针        |

### 提交前检查

```bash
cd app
npx tsc --noEmit   # TypeScript 零错误
npm run build      # 构建通过
node scripts/hdr-test.js   # 决策链单测通过
```

---

## 📚 文档

设计规格与实现记录均位于 `docs/`：

| 文档                                              | 内容                                |
| ----------------------------------------------- | --------------------------------- |
| [01-UI-UX设计规范.md](docs/01-UI-UX设计规范.md)         | 设计令牌、Glass 材质、页面规范、组件、动效、错误态      |
| [02-音视频引擎技术设计.md](docs/02-音视频引擎技术设计.md)         | 引擎架构、解码降级链、HDR/色彩、音频、字幕、状态机       |
| [03-DLNA-UPnP技术规格.md](docs/03-DLNA-UPnP技术规格.md) | SSDP、SOAP 三服务、GENA、HTTP 拉流、真机兼容策略 |
| [04-测试与兼容性矩阵.md](docs/04-测试与兼容性矩阵.md)           | 素材规范、用例模板、GPU/显示器/DLNA 矩阵、验收门槛    |
| [05-实现偏差清单.md](docs/05-实现偏差清单.md)               | 规格 vs 实现偏差、架构决策、排障记录              |

---

## 🤝 贡献指南

欢迎贡献！请遵循以下约定：

### 提交规范

- 使用 Conventional Commits：`feat:`（新功能）、`fix:`（修复）、`docs:`（文档）、`refactor:`（重构）、`chore:`（杂项）。
- 提交信息使用中文，简洁说明动机与影响，例如：

```text
feat: NAS/SMB 源接入(UNC 路径入库)
fix: 全屏按钮只能进不能出 — 透明窗 isFullScreen() 不可靠,改事件自跟踪
```

### 代码规范

- 渲染层 TypeScript 开启 `strict`，提交前保证 `npx tsc --noEmit` 零错误、`npm run build` 通过。
- 主进程 / preload / dlna 为 CommonJS JavaScript，保持与现有风格一致。
- 配置路径一律使用正斜杠；JSON 解析失败需留痕，禁止静默吞错。
- 不要引入非必要依赖：DLNA 协议栈、媒体库刮削均为零依赖自研，延续该原则。

### 实现偏差记录（重要约定）

本项目遵循「实现受限项自行降级并记录」原则：任何无法按规格完整实现的功能，必须在 [`docs/05-实现偏差清单.md`](docs/05-实现偏差清单.md) 中登记 `决策要求 → 实际实现 → 原因 → 消化计划`，并标注所属里程碑。

### 测试要求

- 新功能优先附带可复现的测试脚本（单测 `.js` 或自动化探针 `.ps1`）。
- 涉及 DLNA / HDR / 窗口能力的改动，跑对应回归脚本后再提交。

### 提交流程

1. 从 `main` 分支创建特性分支。
2. 开发并本地自测（tsc / build / 相关脚本）。
3. 提交时遵循上述 Commit 规范。
4. 发起 Pull Request，描述改动与验证方式。

---

## ⚖️ 许可证

本项目自身代码采用 **GNU General Public License v3.0 (GPL-3.0-or-later)** 开源，详见根目录 [`LICENSE`](LICENSE)。

- **版权声明**：Copyright (C) 2026 Howie Meng. 本程序为自由软件，可依据 GPL-3.0 条款重新分发或修改；分发时无任何担保。详见许可证全文。
- **mpv 内核**：内置播放内核 [mpv](https://mpv.io) 采用 **GPL-2.0-or-later** 许可（本项目以独立子进程方式集成，与 UI 进程通过命名管道 IPC 通信，进程间隔离）。分发时须同时遵守 mpv 的许可条款并附其声明，mpv 源码获取方式见 [mpv.io/installation](https://mpv.io/installation/)。
- **兼容性说明**：GPL-3.0 与 mpv 的 GPL-2.0-or-later 兼容（后者允许升级到更高版本），二者并存不产生许可冲突。
- **第三方依赖**：Electron、React 等依赖分别遵循各自许可（MIT 等），以 `node_modules` 内各包的 LICENSE 为准。
- 更多许可相关决策记录见 `docs/05-实现偏差清单.md`。

---

## 📌 当前状态

- **里程碑**：M0 视觉原型 → M1 播放骨架 → M2 完整 UI → M3 播放能力 → M4 DLNA → M5 HDR/打磨 **均已交付**；DLNA 手机投屏、HDR 显示器画质已通过真机验收。
- **进行中**：P1 批次（缩略图真实帧、高级控制台分页、媒体库海报墙、DLNA 预载 / 会话表 / 锁定策略 / 高级调参等已落地，部分功能项继续消化）。
- 版本号：`0.1.0`（早期开发阶段，尚未发布安装包）。
