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
| 媒体库     | SQLite（`node:sqlite`）持久化 + mpv `--vo=image` 抽帧（本地刮削，无在线依赖）            |

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
aurora-player/
├── app/                      # Electron 应用
│   ├── main/                 # 主进程
│   │   ├── main.js           # 播放会话、窗口管理、托盘、防火墙
│   │   ├── hdr.js            # HDR 画质决策链（纯函数，可单测）
│   │   └── db.js             # 媒体数据库（SQLite，WAL 模式）
│   ├── preload/              # contextBridge 桥接层（preload.js）
│   ├── renderer/             # React 渲染层
│   │   ├── src/
│   │   │   ├── pages/        # 页面组件（Home / Player / Settings）
│   │   │   ├── components/   # 通用组件（WindowChrome 等）
│   │   │   ├── bridge.d.ts   # IPC 类型声明
│   │   │   └── main.tsx      # 入口
│   │   ├── vite.config.ts
│   │   └── dist/             # 构建产物（gitignore）
│   ├── dlna/                 # DLNA 协议栈（零依赖自研）
│   │   ├── ssdp.js           # SSDP 设备发现
│   │   ├── httpd.js          # HTTP 拉流服务
│   │   ├── xml.js            # UPnP SOAP/GENA XML 处理
│   │   └── dlna.js           # DMR 入口（utilityProcess）
│   ├── scripts/              # 测试与探针脚本
│   │   ├── hdr-test.js       # HDR 决策链单元测试
│   │   ├── hdr-e2e.js        # HDR 端到端验证
│   │   ├── dmc-test.js       # DLNA 虚拟 DMC 验收
│   │   ├── pipe-test.js      # mpv 命名管道 IPC 验证
│   │   └── *.ps1             # 窗口/拖拽/缩放/截图等自动化探针
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
| Windows | 10 / 11           | 目前仅支持 Windows |
| Node.js | ≥ 22              | 推荐使用 LTS      |
| npm     | 随 Node 附带         |               |
| mpv 运行时 | 0.41.x            | 见下一步，需手动下载    |
| GPU     | 支持 D3D11 / DXVA2 | 硬件解码必需；无 GPU 可软件解码 |

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

### 6. 安装常见问题

| 问题 | 原因 | 解决方案 |
| --- | --- | --- |
| 启动报「缺少 mpv 运行时」 | `runtime/mpv/mpv.exe` 不存在 | 按步骤 3 下载 mpv 并放入正确路径 |
| `npm install` 报 Node 版本不兼容 | Node.js < 22 | 升级到 Node 22 LTS（推荐 `nvm use 22`） |
| `npm run build` 报 TypeScript 错误 | 渲染层类型检查未通过 | 运行 `npx tsc --noEmit` 查看具体错误 |
| 启动后白屏/黑屏 | 渲染层未构建或 `dist/` 为空 | 先执行 `npm run build` 再 `npm start` |
| 防火墙弹窗被拒绝 | DLNA 投屏需要局域网入站规则 | 手动在 Windows 防火墙中放行，或重新启动应用并允许 |
| 视频播放无画面但有声音 | mpv 视频输出驱动不兼容 | 设置环境变量 `AURORA_VO=direct3d` 后重试 |
| 硬件解码失败 | GPU 不支持 D3D11VA/DXVA2 | 设置环境变量 `AURORA_HWDEC=no` 使用软件解码 |

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

### HDR 画质配置

Aurora Player 内置 HDR 画质决策链，自动根据视频源和显示器能力选择最佳输出策略：

**自动模式（默认）**：无需手动配置，决策链自动判断：

| 视频源 | 显示器 | 行为 |
| --- | --- | --- |
| HDR10 / HLG | HDR 显示器 | 直通（Passthrough），保留原始 HDR 信号 |
| HDR10 / HLG | SDR 显示器 | 色调映射（Tonemap），HDR→SDR 转换 |
| SDR | 任意 | 原生输出，不动色彩链 |

**手动覆盖**：设置页 → `画质` 分组：

- **模式**：`自动` / `直通` / `色调映射`
- **算法**：`spline`（默认，推荐）/ `bt.2390` / `bt.2446a` / `hable` / `mobius` / `reinhard` / `clip`
- **高级调参**：目标峰值（nits）、对比度恢复、饱和度（-1 ~ +1）、峰值检测百分位

> HDR 决策链为纯函数实现（`app/main/hdr.js`），可通过 `node scripts/hdr-test.js` 独立验证。

### 视觉模式

设置页 → `视觉` 分组，提供 6 种视觉模式：

| 模式 | 说明 |
| --- | --- |
| `cinema` | 默认模式，电影镜头柔光场 + 粒子尘光 |
| `aurora` | 极光氛围，增强粒子效果 |
| `minimal` | 极简模式，仅保留基础控制 |
| `glass` | Glass 浮层增强，毛玻璃质感 |
| `oled` | 纯黑背景，OLED 友好 |
| `custom` | 自定义，手动调节各视觉参数 |

### 音频高级设置

设置页 → `音频` 分组，支持：

- **增益**：-60 ~ +30 dB
- **10 段均衡器**：-12 ~ +12 dB 每段
- **ReplayGain**：off / track / album
- **动态归一化**：dynaudnorm 响度均衡
- **声道映射**：auto-safe / stereo / 5.1 / 7.1
- **WASAPI 独占**：低延迟音频输出
- **SPDIF 透传**：ac3 / eac3 / dts / dtshd / truehd

### DLNA 投屏

1. 确认设置页「DLNA」分组已开启（默认开启），设备名可自定义（如「王先生的影音室」）。
2. 在同一局域网内，用手机 / 平板 / NAS 的 DLNA 客户端（Android 自带投屏、BubbleUPnP、Jellyfin、Kodi 等）搜索设备，即可发现 **Aurora Player**。
3. 投屏后，播放页左上角显示 `CASTING · 设备名` 徽标，控制权遵循「本地 UI > 远程控制端」仲裁。

> 开启「后台接收投屏」后，关闭主窗口不会退出应用，DLNA 服务保持可发现，收到投屏自动唤起播放。

### 媒体库

1. 设置页 → `媒体库` 分组 → `添加文件夹`。
2. 扫描完成后，首页「媒体库」分区展示海报墙，文件名自动解析标题 / 年份 / 剧集（`S01E02`、`第N集`）。
3. 无封面视频自动抽帧生成封面；`nfo` 文件与同目录 `poster.jpg` / `cover.jpg` 优先。

**文件名识别规则**：

| 文件名示例 | 解析结果 |
| --- | --- |
| `电影名 (2024).mkv` | 标题：电影名，年份：2024 |
| `剧集名.S01E02.1080p.mkv` | 标题：剧集名，季：1，集：2 |
| `剧集名.第3集.mkv` | 标题：剧集名，集：3 |

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

| 环境变量                             | 说明              | 示例                              |
| -------------------------------- | --------------- | ------------------------------- |
| `AURORA_VO=direct3d`             | 强制指定 mpv 视频输出驱动 | 定位视频渲染问题                        |
| `AURORA_HWDEC=no`                | 关闭硬件解码          | 排查解码失败时使用                       |
| `AURORA_MPV_EXTRA='["--x","y"]'` | 追加任意 mpv 启动参数   | `AURORA_MPV_EXTRA='["--profile=gpu-hq"]'` |

> 环境变量在 Windows PowerShell 中设置：`$env:AURORA_VO="direct3d"; npm start`

### 项目脚本

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 构建渲染层（Vite → `renderer/dist/`） |
| `npm start` | 启动 Electron 应用（需先 build） |
| `npm run dev` | 一键构建 + 启动 |

### 运行测试

测试脚本位于 `app/scripts/`：

| 脚本                          | 说明                             | 前置条件 |
| --------------------------- | ------------------------------ | --- |
| `node scripts/hdr-test.js`  | HDR 决策链单元测试                    | 无 |
| `node scripts/hdr-e2e.js`   | HDR 端到端验证（lavfi 生成测试片）         | 无 |
| `node scripts/dmc-test.js`  | DLNA 虚拟 DMC 验收 | 需先 `npm start` 启动应用 |
| `node scripts/pipe-test.js` | mpv 命名管道 IPC 验证                | 无 |
| `scripts/*.ps1`             | 窗口 / 拖拽 / 缩放 / 截图等自动化探针        | 需应用运行中 |

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
docs: 补充 HDR 决策链使用说明
refactor: 抽取播放状态机为独立模块
chore: 升级 Electron 43.4 → 43.5
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

### 分支与提交流程

1. **创建分支**：从 `main` 分支创建特性分支，命名规则：
   - `feat/xxx` — 新功能
   - `fix/xxx` — 缺陷修复
   - `refactor/xxx` — 重构
   - `docs/xxx` — 文档更新
2. **开发并自测**：确保 `npx tsc --noEmit`、`npm run build`、相关测试脚本均通过。
3. **提交**：遵循上述 Commit 规范，每个提交保持原子性（一个提交解决一个问题）。
4. **发起 Pull Request**：
   - 标题格式与 Commit 规范一致：`feat: xxx` / `fix: xxx`
   - 描述中说明：改动内容、动机、验证方式、关联的偏差编号（如有）
   - 涉及 UI 改动时附带截图
5. **Code Review**：至少一位维护者审查通过后合并，采用 Squash Merge 保持主线整洁。

### Issue 报告

提交 Issue 时请包含以下信息：

- **环境**：Windows 版本、GPU 型号、显示器型号（HDR 相关问题时务必提供）
- **复现步骤**：逐步描述如何触发问题
- **预期行为**：你期望发生什么
- **实际行为**：实际发生了什么
- **日志/截图**：如有可能，附带控制台输出或截图

### 发布流程

> 当前版本 `0.1.0`，尚未建立正式发布流程。以下为规划中的流程：

1. 在 `main` 分支更新 `app/package.json` 版本号
2. 运行完整测试套件（TypeScript 检查 + 构建 + HDR/DLNA 测试）
3. 创建 Git Tag（格式 `v0.x.0`）
4. 构建 Windows 安装包（Electron Builder）
5. 发布 Release Notes，包含变更列表与已知问题

---

## ❓ 常见问题（FAQ）

### 通用

**Q：支持 macOS / Linux 吗？**

A：目前仅支持 Windows 10/11。项目使用 mpv `--wid` 子窗口嵌入方案，依赖 Windows 窗口管理机制。跨平台支持暂无计划，但欢迎社区贡献。

**Q：为什么播放器窗口是透明的？**

A：这是架构设计的关键——Electron 主窗口设为 `transparent: true`，mpv 子窗口在下层透出，React 控制层叠加其上。如果窗口不透明，Chromium 的 DComp 合成层会遮盖 mpv 子窗口导致黑屏。详见 [`docs/05-实现偏差清单.md`](docs/05-实现偏差清单.md) 中的「黑屏事故与架构修正」。

**Q：续播记忆怎么工作？**

A：播放进度自动保存到 SQLite 数据库（`play_history` 表），下次打开同一文件时自动从上次位置继续。可通过设置页关闭此功能。

### 播放相关

**Q：某些视频无法播放或花屏？**

A：尝试以下步骤：
1. 设置环境变量 `AURORA_HWDEC=no` 关闭硬件解码，确认是否为解码器问题
2. 设置环境变量 `AURORA_VO=direct3d` 切换视频输出驱动
3. 如果问题依旧，请在 Issue 中附上视频文件编码信息（可用 MediaInfo 查看）

**Q：HDR 视频在 SDR 显示器上颜色偏灰？**

A：这是正常的色调映射结果。可尝试在设置页调整：
- 切换 Tone Mapping 算法（推荐 `spline` 或 `bt.2446a`）
- 调高饱和度（+0.1 ~ +0.3）
- 适当调高目标峰值

**Q：4K 视频播放卡顿？**

A：确认硬件解码是否正常启用（看控制台日志中 `hwdec` 字段）。如果显示 `no`，说明在使用软件解码，需要：
- 更新 GPU 驱动
- 确认 GPU 支持 D3D11VA / NVDEC
- 关闭其他占用 GPU 的程序

### DLNA 相关

**Q：手机搜不到 Aurora Player？**

A：排查步骤：
1. 确认手机和电脑在同一局域网
2. 确认 Windows 防火墙已放行应用（首次启动时会弹窗）
3. 确认设置页 DLNA 已开启
4. 某些路由器开启了 AP 隔离，需关闭

**Q：投屏后无法控制播放？**

A：控制权遵循「本地 UI > 远程控制端」仲裁。如果本地正在操作，远程控制端会被暂时拒绝。可在设置页调整「锁定策略」：`none`（不锁定）/ `takeover`（投屏接管）/ `full`（完全锁定）。

### 媒体库相关

**Q：扫描后某些视频没有显示？**

A：检查文件扩展名是否为支持的格式（MP4/MKV/AVI/MOV/TS/WebM）。如果文件名包含特殊字符，可能影响解析，请在 Issue 中反馈。

**Q：可以在线刮削封面和元数据吗？**

A：目前不支持在线刮削（TMDB 等），这是既定约束。媒体库使用本地刮削：文件名解析、`nfo` 文件、同目录 `poster.jpg` / `cover.jpg`，无封面时自动抽帧。

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
- **已完成**：P1/P2 批次全部落地（缩略图真实帧、高级控制台分页、媒体库海报墙、DLNA 预载 / 会话表 / 锁定策略 / 高级调参、全局搜索、视觉模式、用户 Shader、音频高级处理、自动性能降级、SQLite 媒体数据库等），偏差清单 D1–D35 全部消化。
- **真机终验通过**：D21（DV P5/P8、HDR10+ 逐格式矩阵）、D22（跨屏 HDR ≤1 帧黑屏量化实测）已通过真机验证；在线刮削（TMDB）按既定约束不做。至此规格偏差全部闭环。
- 版本号：`0.1.0`（早期开发阶段，尚未发布安装包）。
