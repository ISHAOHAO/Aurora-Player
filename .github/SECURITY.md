# 安全策略

## 报告漏洞

如果你发现安全漏洞，请**不要**在公开 Issue 中提交。

请通过 GitHub Security Advisory 私密上报：

<https://github.com/ISHAOHAO/Aurora-Player/security/advisories/new>

报告中请说明：

- 漏洞类型与影响范围
- 复现步骤
- 受影响版本

收到报告后会在 48 小时内确认，修复后在发布说明中致谢（如你愿意）。

## 支持的版本

仅最新主分支接受安全修复。

## 已知安全设计

- DLNA 防 SSRF：仅允许 http/https + RFC1918/回环/链路本地 IP（域名放行 NAS 主机名场景）
- XML 解析拒 DTD/ENTITY（防 XXE，设备描述 / DIDL-Lite / NFO 均覆盖）
- 网络 URL 白名单协议，禁止 `file://` 经网络路径跳本地
- Shader 目录沙箱化（规划中，见 docs/02 §4.5）
