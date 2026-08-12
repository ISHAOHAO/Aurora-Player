# Aurora Player — DLNA/UPnP 技术规格

**版本：** v1.0（基于 PRD 拆分）
**定位：** DLNA 是核心能力而非附加功能。Aurora 实现完整的 **DLNA MediaRenderer（DMR）**，可被手机/平板/NAS/PC 控制端发现、推送与控制。
**参考标准：** UPnP AV Architecture v1/v2、AVTransport:1、RenderingControl:1、ConnectionManager:1、DLNA Guidelines。
**独立进程：** `aurora-dlna.exe`（可常驻后台，独立于 UI 生命周期）。

---

## 1. 角色与总体流程

```text
Control Point (手机/NAS/PC)
   │ ① SSDP 发现
   │ ② GET Device Description XML
   │ ③ SetAVTransportURI(media URL)
   │ ④ Play / Pause / Seek / Stop / SetVolume
   ▼
Aurora DLNA Service (aurora-dlna.exe)
   │ ⑤ HTTP Range 拉流
   ▼
Media Engine (aurora-engine.exe) → 解码 → 渲染
   │ ⑥ LastChange 事件回推状态
   ▼
Control Point 显示 Playing/Paused/Position/Volume
```

---

## 2. SSDP 发现

### 2.1 基本要求

- 监听多播 `239.255.255.250:1900`（UDP），同时处理：
  - `M-SEARCH`（响应 `upnp:rootdevice`、`urn:schemas-upnp-org:device:MediaRenderer:1`、`ssdp:all`）
  - 周期性发送 `NOTIFY ssdp:alive`（默认间隔 900s，MaxAge=1800）
  - 关闭/退出时发送 `NOTIFY ssdp:byebye`
- 网络变更（网卡增删、IP 变化、VPN 切换）→ 重新 byebye + alive 全量宣告。
- 多张网卡：默认在全部私有网络接口上宣告；设置中可选择绑定接口。
- 响应头必须包含：`LOCATION`、`ST/USN`、`SERVER: Windows/11 UPnP/1.0 Aurora/1.0`、`CACHE-CONTROL`。

### 2.2 设备身份

| 字段 | 默认值 | 用户可改 |
| --- | --- | --- |
| friendlyName | `Aurora Player`（首次启动可改为如“王先生的影音室”） | ✓ |
| deviceType | `urn:schemas-upnp-org:device:MediaRenderer:1` | 固定 |
| UDN | `uuid:` 持久化随机 UUID（重装保持可选） | 固定 |
| manufacturer / modelName | Aurora / Aurora Player | 固定 |
| 图标 | 48/120px PNG，深色底 | 固定 |

---

## 3. Device & Service Description

### 3.1 根设备描述（`GET /devicedesc.xml`）

必须暴露三个服务：

| 服务 | serviceType | SCPD | 控制 URL | 事件 URL |
| --- | --- | --- | --- | --- |
| ConnectionManager | `urn:schemas-upnp-org:service:ConnectionManager:1` | `/scpd/cm.xml` | `/ctrl/cm` | `/evt/cm` |
| AVTransport | `urn:schemas-upnp-org:service:AVTransport:1` | `/scpd/avt.xml` | `/ctrl/avt` | `/evt/avt` |
| RenderingControl | `urn:schemas-upnp-org:service:RenderingControl:1` | `/scpd/rc.xml` | `/ctrl/rc` | `/evt/rc` |

XML 生成规则：UTF-8、命名空间完整、禁止外部实体/DTD（防 XXE），解析端同样强制。

### 3.2 协议能力宣告（ConnectionManager::GetProtocolInfo）

按**实际稳定可播能力**生成，禁止虚报。首发基线：

```text
http-get:*:video/mp4:*                    (H.264/HEVC+AAC/MP3)
http-get:*:video/x-matroska:*             (MKV 全组合)
http-get:*:video/webm:*
http-get:*:video/mpeg:*                   (TS/PS)
http-get:*:video/x-msvideo:*              (AVI)
http-get:*:video/quicktime:*
http-get:*:video/x-ms-wmv:*
http-get:*:video/x-flv:*
http-get:*:video/MP2T:*
http-get:*:audio/mpeg:*, audio/mp4:*, audio/flac:*, audio/wav:* ...
```

带 DLNA.ORG_PN 的 profile 标识仅在经过真机验证后追加（如 `AVC_MP4_HP_HD_AAC`）。

---

## 4. AVTransport 服务

### 4.1 必须实现的 Action

| Action | 说明 | 备注 |
| --- | --- | --- |
| SetAVTransportURI | 设置媒体 URL + CurrentURIMetaData(DIDL-Lite) | 支持 http/https；解析 title/artist/协议信息 |
| SetNextAVTransportURI | 预载下一首 | P1 |
| Play | Speed=1 起播 | 异步：先回应答，内部 LOADING→PLAYING |
| Pause / Stop | 暂停/停止 | Stop 保留最后帧 2s 后淡出 |
| Seek | `REL_TIME`（HH:MM:SS）与 `X_DLNA_REL_BYTE` | 直播/不可 seek → 返回 710/711 错误并禁用 UI seek |
| GetTransportInfo | CurrentTransportState 等 | |
| GetPositionInfo | Track/TrackDuration/RelTime/AbsTime | 秒级精度 |
| GetMediaInfo | 当前 URI/元数据 | |
| GetTransportSettings | PlayMode 等 | |
| GetCurrentTransportActions | 按当前状态动态返回可用动作 | 直播流仅 Play/Stop |

### 4.2 状态映射

```text
DLNA:      STOPPED / PLAYING / PAUSED_PLAYBACK / TRANSITIONING / NO_MEDIA_PRESENT
引擎:      IDLE    / PLAYING  / PAUSED         / BUFFERING·LOADING / IDLE(无源)
```

BUFFERING 期间向 CP 报告 `TRANSITIONING` 超过 10s 时回退真实状态，避免 CP 误判卡死。

### 4.3 Seek 细则

- 时间 Seek：以 `REL_TIME` 为准；同时接受 `ABS_TIME`。
- 字节 Seek（`X_DLNA_REL_BYTE`）：仅对可计算码率的 CBR 内容近似支持。
- HTTP 拉流必须发 `Range:` 请求；源服务器不支持 Range → 标记不可 seek 并在 `GetCurrentTransportActions` 中剔除 Seek。
- HLS/直播：Seek 禁用；DVR 型 HLS 可按窗口 seek（二期）。

---

## 5. RenderingControl 服务

| Action | 说明 |
| --- | --- |
| GetVolume / SetVolume | 0–100 映射到引擎音量曲线（感知对数） |
| GetMute / SetMute | |
| ListPresets / SelectPreset | 至少提供 `FactoryDefaults` |
| GetVolumeDBRange | 供 CP 显示 dB 范围 |

实例 `InstanceID=0`，Channel 支持 `Master`。

---

## 6. Eventing（GENA）

- 支持 `SUBSCRIBE / UNSUBSCRIBE / 续订`，`TIMEOUT: Second-1800` 起。
- 状态变更通过 `LastChange`（AVTransport）与音量变化（RenderingControl）推送，合并去抖 200ms。
- CP 回调不可达：连续 3 次失败 → 标记订阅失效并清理，不得阻塞播放线程。
- 事件发送在独立线程池，带背压保护。

---

## 7. HTTP 媒体拉流

```text
CP 提供 URL → Aurora 作为 HTTP Client 拉流:
  GET <url>  (支持 Range, 重定向 ≤5 次, 10s 连接超时)
  ↓
FFmpeg avio → demux → decode → render
```

要求：
- 跟随 301/302/307；HTTPS 证书校验开启（局域网自签名提供“信任此设备”选项）。
- 支持 chunked、keep-alive；User-Agent 标识 `Aurora/1.0 (DLNA DMR)`。
- 元数据解析：DIDL-Lite 中的 `dc:title`、`upnp:class`、`res@protocolInfo/size/duration/resolution` 用于 UI 展示与能力预判。
- 防 SSRF：仅允许 CP 同网段/RFC1918 地址（用户可在高级设置放开）；禁止 `file://`、`smb://` 等危险 scheme。

---

## 8. 播放状态反馈与 UI 集成

- 投屏期间 UI 左上角显示 `CASTING · <CP 设备名/IP>`；CP 可实时看到 Playing/Paused/Stopped + Position/Duration/Volume/Mute（经 GetPositionInfo 轮询或事件）。
- 控制权仲裁（优先级从高到低）：

```text
本地 UI 操作  >  远程 CP 控制  >  后台自动化
```

本地用户操作时若 CP 正在控制：执行本地操作并向 CP 推送状态（LastChange），不弹冲突提示；连续 3 秒内双向互抢 → Toast 提示“正在由 <设备> 投放”。

- 锁定策略（设置可选）：不锁定（默认）/ 投屏接管（本地仅音量字幕等有限控制）/ 完全锁定（仅允许停止投屏）。

---

## 9. 网络与防火墙

- 端口：UDP 1900（SSDP，系统共享）、TCP 随机高位端口（设备描述+控制+事件，启动时选择并写入防火墙规则）。
- 首次启动：请求“专用网络”权限并向用户解释（“DLNA 投屏需要访问局域网”）；不申请公网入站。
- 防火墙自检：DLNA 服务启动后本地回环验证 + 组播宣告抓包自检；失败则 UI 提示“DLNA 服务可能被 Windows 防火墙阻止”+ [一键修复]（调用 netsh 添加规则）。
- 待机模式：开启“后台接收投屏”后，关闭主窗口 → 托盘常驻，`aurora-dlna.exe` 保持可发现，收到 SetAVTransportURI 自动唤起 UI 播放。

---

## 10. 兼容性策略（真实设备优先）

验收不以 XML Schema 通过为准，以**真机矩阵**为准（详见测试文档 §DLNA 矩阵）：

| 类别 | 代表端 |
| --- | --- |
| Android | 主流品牌手机自带投屏、BubbleUPnP、LocalCast 等 |
| iOS | iPhone/iPad 第三方 DLNA Client |
| NAS | Synology、QNAP、Jellyfin、Emby、Plex DLNA、Kodi、MiniDLNA/ReadyMedia |
| Windows | Media Player、第三方 DMC |

分级：A 完全可用 / B 播放正常高级功能受限 / C 可发现不可稳定控制 / D 不可用。发布门槛：主流组合 ≥ A/B。

**容错细节（血泪清单）：**
- 部分 CP 发送空 `CurrentURIMetaData` 或不规范 XML → 容错解析，不拒绝播放。
- 部分 CP 不订阅事件纯轮询 → GetPositionInfo 必须低开销（<5ms）。
- 部分 CP 在 Play 后立即 Pause 探测 → 状态机允许 PLAYING⇄PAUSED 快速切换不丢流。
- 部分 NAS 的 URL 含未转义中文/空格 → 宽容 URL 解析。
- Seek 到片尾 ±2s → 自动转 STOPPED 并报告 `END_OF_MEDIA`。

---

## 11. 状态机（DLNA 侧）

```text
OFFLINE → DISCOVERABLE → IDLE(可被发现, 无媒体)
IDLE → RECEIVING(SetAVTransportURI) → PLAYING ⇄ PAUSED
PLAYING/PAUSED → STOPPED → IDLE
任意状态 → DISCONNECTING(网络丢失) → DISCOVERABLE(自动恢复宣告)
```

每次迁移写入 `dlna_session` 表（时间、CP 标识、URI、结果），供诊断与统计。

---

## 12. 错误码与上报

| 场景 | UPnP 错误码 | UI 表现 |
| --- | --- | --- |
| 非法 Seek 模式 | 710 | Toast + 禁用 seek |
| 资源不存在/拉流失败 | 714/自定义 | 错误卡片（原因+重试） |
| 当前状态不允许该操作 | 701 | 忽略并回报真实状态 |
| 媒体格式不支持 | 715 | 明确提示不支持的编码组合 |

所有 DLNA 会话错误进入 `logs/dlna.log`，诊断包一键导出包含：设备描述 XML、最近 20 条 SOAP 交互（脱敏）、网络环境摘要。

---

## 13. 性能指标

| 指标 | 目标 |
| --- | --- |
| 被 CP 发现 | ≤3s（同一子网） |
| SetAVTransportURI → 首帧 | ≤5s（局域网 HTTP） |
| Play/Pause 响应 | ≤300ms |
| Seek 响应（本地缓存命中） | ≤1s |
| 事件推送延迟 | ≤500ms |
| 待机内存占用 | ≤80 MB |

---

## 14. 未来扩展（不进 MVP）

- DLNA MediaServer（把本机媒体库共享给电视/音箱）
- DLNA Control Point（发现家中其他 DMR 并控制）
- 多实例/多房间同步播放
