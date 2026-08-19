# Aurora Player 发版与自动更新指南

本项目的自动更新机制：**electron-builder 打包 + electron-updater 静默自动更新**，
版本真相源托管在 **Gitee**（国内访问稳定，不需自建服务器）。

## 约束背景
- 未购买代码签名证书 → 不静默弹窗要求手动下载，改用「启动后台检查 → 自动下载 → 退出时静默安装」。
- 安装作用域为 **per-user**（装到 `%LOCALAPPDATA%`），免管理员、免 UAC。
- 无签名代价：更新后首次启动会弹一次 Windows SmartScreen「未知发布者」，点「仍要运行」即可。

## 产物
- `release/AuroraPlayer-Setup-<ver>.exe` — NSIS 安装包（自动更新载体，支持文件关联勾选 + 自选安装目录）
- `release/AuroraPlayer-Setup-<ver>.exe.blockmap` — 差分包（仅下变化字节）
- `release/AuroraPlayer-Setup-<ver>.msi` — MSI 安装包（仅作首次/手动安装渠道，electron-updater 不认 MSI）
- `release/latest.yml` — electron-builder 生成的标准更新清单
- `update/latest.yml` — 改写为 Gitee 绝对直链版的真相源（提交进仓库）

## 本地打包
```bash
# 0. 同步 mpv 运行时（extraResources 从 app/runtime/mpv 取，二者均被 gitignore）
#    根目录 runtime/mpv 是 canonical 副本，build 前需保证 app/runtime/mpv 存在：
mkdir -p app/runtime && cp -r runtime/mpv app/runtime/mpv
# 1. 装依赖（首次需要，electron-builder 装在独立目录 .eb-deps 避免 prune rolldown）
#    见下方"构建环境"说明
# 2. 渲染层构建
npm run build
# 3. 打包 NSIS + MSI（不自动发布）
npm run dist:win          # 等价于 electron-builder --win nsis msi --publish never
```


## 发布到 Gitee（发版三步）
1. Gitee 仓库 →「管理 → 发行版」→ 新建发行版，标签 `v<版本号>`（基于 `main`）。
2. 上传附件：`release/AuroraPlayer-Setup-<ver>.exe` + `.exe.blockmap` + `.msi`。
3. 生成并提交真相源：
   ```bash
   node scripts/publish-gitee.js        # 读取 release/latest.yml → 写 update/latest.yml
   git add update/latest.yml
   git commit -m "release: v<版本号>"
   git push origin main
   ```

完成后，已装此版 `.exe` 的用户启动 App 即自动检查 → 后台下载 → 退出时静默安装。

## 构建环境注意（Windows / 沙箱）
- 用 `NODE_OPTIONS=""` 去掉注入的超时 trash 垫片；必要时整体提权/关闭沙箱。
- electron-builder 装在项目根独立目录 `.eb-deps`（避免 npm prune 掉 vite 的 rolldown 平台包）；
  npm cache 挪到项目内 `.npm-cache`。
- 镜像：
  - `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
  - `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`
- `package.json` 里 `build.npmRebuild:false`（本项目无原生模块，否则会锁住 electron.exe 导致 rename 死锁）。
- MSI 在沙箱/无 Windows Installer 服务环境会卡在 `light.exe` 的 ICE 校验（`LGHT0217: Windows Installer Service could not be accessed`）。已通过 `build.msi.additionalLightArgs: ["-sval"]` 跳过整套 MSI 校验解决（不影响安装功能）。
- electron-builder 26.x 已移除顶层 `build.msi` 对象；MSI 选项只接受 `oneClick/perMachine/runAfterFinish/createDesktopShortcut/createStartMenuShortcut/menuCategory/shortcutName/upgradeCode/warningsAsErrors/additionalWixArgs/additionalLightArgs`，**没有** `allowToChangeInstallationDirectory`（该选项仅 NSIS 有）。

## 文件关联
安装时「文件关联」勾选页让用户选择是否绑定 `.mp4/.mkv/.avi/.mov/.flv/.wmv/.webm/.ts/.m2ts/.mpeg/.mpg`。
注册表写在 `HKCU\Software\Classes`（per-user），卸载时仅清理本程序写入的关联。

## 版本号
单一真相源 = `app/package.json` 的 `version`。打包文件名、`latest.yml`、App 内「关于」展示全由其派生。
发版前先改 `version` 再打包。
