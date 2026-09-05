# Aurora Player 构建与发布指南

应用版本以 `app/package.json` 为准，并同步 `app/package-lock.json` 顶层和根包版本。当前构建版本为 **1.0.2**：新增 Gitee 分片下载、校验和合并更新。确定版本并生成安装包不等于已经公开发布。

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

- 更新源：Gitee main 分支的 update/latest-split.json（旧客户端仍读取 latest.yml）。
- 包地址：Gitee Release 分片附件，在清单中使用绝对地址，客户端校验并合并。
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

验证完成后，先生成待发布分片，再按下一节上传附件和验证，最后提交更新清单：

```powershell
node app/scripts/publish-gitee.js
```

脚本读取与 app/package.json 相同版本目录中的 latest.yml，验证安装包后生成分片。生成不等于已经上传或公开发布；生产清单需要在远程验证后单独提交。

## Gitee 免费分片发布（新客户端）

新客户端读取 `update/latest-split.json`，从 Gitee Release 下载最多 80MiB 的分片，按清单顺序流式合并，再校验完整 EXE 的 SHA-512。每片最多尝试三次；失败后重新检查更新会复用已校验的分片。当前不提供单片内部断点续传和差量下载。下载缓存位于用户数据目录的 `split-updates`；保留缓存用于重试，请预留约两倍安装包大小的磁盘空间，历史缓存可在应用退出后手动清理。

下载完成不会在普通退出时安装。用户点击“退出并打开安装向导”后，客户端重新校验 EXE，成功启动 NSIS 向导才退出播放器。向导继续处理安装位置、权限提示和完成后的启动选项。哈希证明文件与清单一致；发布者仍须保护 Gitee 账号、主分支和清单，哈希不能替代代码签名。

### 发布顺序

1. 修改版本号（package.json 与 package-lock.json 一致），运行 `npm run dist:win` 生成包含新更新器的安装包。不要把旧的 v1.0.1 安装包当成包含本次修改的版本。
2. 在 app 目录运行 `npm run release:manifest`。脚本检查打包清单中的版本和 EXE SHA-512，在 `release/v<版本>/gitee-split/` 生成 EXE 分片和 `latest-split.json`，MSI 分片及其独立清单位于 `msi/`。不会修改生产 `update/latest.yml` 或 `update/latest-split.json`。
3. 将 EXE 的所有 `.partNNN` 附件上传到同名 Gitee Release。需要提供 MSI 时，再上传 MSI 分片。附件名不要改动。若 Gitee 实际附件地址与生成的地址不同，修改待发布 JSON 中各片的 URL；大小和哈希保持不变。
4. 从仓库根运行 `node app/scripts/verify-split-release.js release/v<版本>/gitee-split/latest-split.json`。它会匿名下载所有远程分片并验证最终文件；失败时不要发布清单。需要保留合并文件时，可追加一个尚不存在的输出 EXE 路径。MSI 同理，使用 msi 子目录清单并指定 .msi 输出路径。
5. 做一次旧安装版到新安装版的 Windows 升级验证。然后将 EXE 清单复制为 `update/latest-split.json` 并提交发布。不要将 MSI 清单放进自动更新入口。清单最后发布，版本附件不可原地替换。

### 首次迁移

不含分片更新器的旧客户端无法识别新 JSON，需要用户手动安装一次新版。可以提供已合并完整包的免费备用下载渠道，或让有 Node.js 的用户使用上述验证脚本合并下载。旧 `latest.yml` 仅为旧更新协议保留，不要向其中写入分片地址。新客户端首次发布前缺少 `latest-split.json` 会显示更新错误，不会自动回退到旧协议。

### 验证边界

本地测试覆盖分片合并、缓存复用、损坏重试、完整校验失败、错误清单及版本比较。Gitee 的附件类型/数量/容量规则、匿名直链、实际大陆下载速度和真实 Windows 安装升级必须另行验证；本地生成分片不代表已上传或平台已接受。
