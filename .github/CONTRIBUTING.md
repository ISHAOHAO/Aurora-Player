# 贡献指南

感谢你对 Aurora Player 的兴趣！首次贡献请先阅读本指南。

## 快速开始

```bash
git clone https://github.com/ISHAOHAO/Aurora-Player.git
cd Aurora-Player/app
npm install
npm run dev   # 构建渲染层 + 启动 Electron
```

mpv 运行时需手动放入 `runtime/mpv/`，详见 [README](../README.md#3-下载-mpv-运行时)。

## 提交流程

1. 从 `main` 创建特性分支：`git checkout -b feat/your-feature`
2. 开发并本地自测（见下方检查项）
3. 遵循 Conventional Commits（中文提交信息）
4. 发起 Pull Request，描述改动与验证方式

## 提交前检查

```bash
cd app
npx tsc --noEmit          # TypeScript 零错误
npm run build             # 构建通过
node scripts/hdr-test.js  # HDR 决策链单测通过
```

涉及 DLNA / HDR / 窗口能力的改动，额外跑对应回归脚本。

## 提交规范

使用 Conventional Commits，提交信息用中文：

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `chore:` 杂项

示例：

```text
feat: NAS/SMB 源接入(UNC 路径入库)
fix: 全屏按钮只能进不能出 — 透明窗 isFullScreen() 不可靠
```

## 实现偏差记录

任何无法按规格完整实现的功能，必须在 [`docs/05-实现偏差清单.md`](../docs/05-实现偏差清单.md) 中登记 `决策要求 → 实际实现 → 原因 → 消化计划`，并标注所属里程碑。

## 代码规范

- 渲染层 TypeScript 开启 `strict`
- 主进程 / preload / dlna 为 CommonJS JavaScript
- 配置路径一律用正斜杠；JSON 解析失败需留痕，禁止静默吞错
- 不引入非必要依赖（DLNA 协议栈、媒体库刮削均为零依赖自研，延续该原则）

## 报告问题

- Bug 报告 / 功能建议：使用 Issue 模板
- 提问、想法、讨论：[Discussions](https://github.com/ISHAOHAO/Aurora-Player/discussions)
- 安全漏洞：见 [SECURITY.md](./SECURITY.md)
