# Aurora Player 构建与发布指南

应用版本以 `app/package.json` 为准，并同步 `app/package-lock.json` 顶层和根包版本。当前构建版本为 **1.0.1**：汇总 1.0.0 之后的修复与体验优化，按补丁版本递增。确定版本并生成安装包不等于已经公开发布。

## 环境准备

使用 Windows x64、Node.js 24.13.0 或经验证的兼容版本。在项目根目录执行：

```powershell
npm ci --prefix app
npm ci --prefix build-tools
```

`app/package-lock.json` 固定应用依赖；`build-tools/package-lock.json` 固定 electron-builder 及构建工具，避免依赖机器上的全局命令或 `.eb-deps`。

Electron 首次使用可能下载二进制。受限环境可将下载缓存放进项目目录，而无需更改安全限制：

```powershell
$env:electron_config_cache = Join-Path (Get-Location) '.eb-cache/electron'
node app/node_modules/electron/install.js
$env:ELECTRON_BUILDER_CACHE = Join-Path (Get-Location) '.eb-cache'
```

## mpv 运行时

唯一来源是根目录 `runtime/mpv`。无需复制到 app/runtime。

`app/build-resources/runtime-manifest.json` 固定 mpv.exe、mpv.com 和 d3dcompiler_43.dll 的 SHA-256。需取得与清单一致的 Windows x64 发行文件；有意升级时同时审查二进制来源、版本和清单，再验证播放。不要为了让构建通过而直接替换散列。

```powershell
npm --prefix app run runtime:check
```

开发态从项目根目录查找 mpv；打包态从 Electron resourcesPath/runtime/mpv 查找。

## 检查与打包

```powershell
npm --prefix app run check
npm --prefix app run dist:win
```

`check` 顺序执行回归检查、HDR 测试、视觉测试、类型检查和 Vite 构建。`dist:win` 先执行这些门槛及运行时校验，再生成 NSIS EXE 与 MSI，不自动发布。

`dist:win` 调用 `scripts/package-win.js`：构建中间文件保存在 `.release-build/v<版本>/`，可交付文件汇集到 `release/v<版本>/`。使用已有 Electron 本地运行时，避免重复下载；默认不上传发布。

每次变更版本，先编写 `docs/releases/RELEASE-NOTES-v<版本>.md`。打包脚本核对版本和锁文件，验证 EXE 与更新清单的 SHA-512/大小，复制 EXE、MSI、blockmap、latest.yml 和版本说明，并生成 SHA256SUMS.txt。若该版本目录已有安装产物，脚本会停止，避免覆盖；应先归档上一构建或递增版本。

当前目录约定：

```text
release/
├── README.md                 # 最新版本入口与归档说明
├── v1.0.1/                   # 当前安装包、版本说明、更新元数据、校验和
└── archive/v1.0.0/           # 旧版说明、元数据与历史候选安装包
.release-build/
├── v1.0.1/                  # 当前 win-unpacked、打包日志及暂存产物
└── archive/v1.0.0/           # 旧构建中间文件
```

`release/` 和 `.release-build/` 均不入库；版本说明的可追踪源文件保存在 `docs/releases/`。build-tools 自身的包版本独立于应用版本，无需随应用递增。

MSI 当前保留 `-sval` 跳过 ICE 校验的兼容配置，因此仍须在有 Windows Installer 服务的测试环境完成安装验证，不能把生成 MSI 当作完整安装验收。

## 文件打开方式

安装时可选择把 Aurora 添加到视频文件的“打开方式”，仅写入应用自己的 ProgID 和 OpenWithProgids 值。默认播放器仍由用户在 Windows 中选择。

卸载只删除本应用拥有的值，保留扩展名键和第三方子键。升级卸载阶段保留关联偏好。历史旧版曾覆盖扩展名默认值而没有备份；不能恢复未知的历史默认值，只能在该值仍指向 Aurora 时清理它。

## 更新机制

- 更新源：Gitee main 分支的 update/latest.yml。
- 包地址：Gitee Release 附件，在清单中使用绝对地址。
- NSIS 是自动更新载体；MSI 用于手动安装渠道。
- 开发态不访问生产更新源，界面显示不可用原因。
- 关于页读取最新状态快照，再接收后续状态变化。
- SHA-512 校验下载文件与清单一致；它不独立证明发布者身份，也不能替代发布源保护或代码签名。

## 发布前验收

1. 选择新的正式版本号，重新运行检查和打包。
2. 在测试环境验证冷/热文件关联打开、中文/空格路径、安装/升级/卸载。
3. 用测试更新源验证同版本、有新版本、失败清单、断网、已下载后重进关于页、重启安装。
4. 复验 HDR/GPU、跨屏、手机/NAS 和长时间投屏。
5. 保留测试环境、素材、日志和结论，更新偏差清单与发布说明。

## 发布到 Gitee

验证完成后，创建对应版本的发行版，从 `release/v<版本>/` 上传 EXE、EXE.blockmap、MSI，并附上版本说明和校验和。然后生成清单：

```powershell
node app/scripts/publish-gitee.js
```

脚本只读取与 app/package.json 相同版本目录中的 latest.yml，并拒绝版本不匹配的清单。人工核对版本、散列和附件直链后再提交 update/latest.yml。脚本生成清单不等于已经上传附件或公开发布。仅在本地整理版本时，不运行此发布清单写入步骤，生产清单继续指向已发布版本。
