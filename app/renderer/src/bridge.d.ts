/** window.aurora — preload 暴露的桥接 API 类型 */
export interface NasEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface RecentItem {
  path: string;
  name: string;
  at: number;
  position?: number;
  duration?: number;
}

export interface PlayerStats {
  codec: string | null;
  w: number | null;
  h: number | null;
  fps: number | null;
  vfFps: number | null;
  drops: number | null;
  hwdec: string | null;
  vo: string | null;
  vBitrate: number | null;
  aBitrate: number | null;
  cacheDur: number | null;
}

export interface PlayerStatus {
  title: string | null;
  path: string | null;
  timePos: number | null;
  duration: number | null;
  pause: boolean | null;
  volume: number | null;
  mute: boolean | null;
  idle: boolean;
  casting?: { cp: string; title?: string } | null;
  lockPolicy?: 'none' | 'takeover' | 'full';
  stats?: PlayerStats;
}

export interface DlnaState {
  running: boolean;
  friendlyName: string;
  port: number;
}

export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  rememberPosition: boolean;
  volumeStep: number;
  defaultVolume: number;
  subFontSize: number;
  hdrMode: string;
  hdrAlgo: string;
  dlnaEnabled: boolean;
  dlnaFriendlyName: string;
  bgCasting: boolean;
  lockPolicy: 'none' | 'takeover' | 'full';
  libraryFolders: string[];
  targetPeak: number;
  targetContrast: number;
  saturation: number;
  hdrPeakPercentile: number;
}

export interface LibrarySpecs {
  res: '4K' | '1080p' | '720p' | null;
  hdr: 'HDR10' | 'HDR10+' | 'Dolby Vision' | 'HLG' | null;
  sub: 'ASS' | null;
}

export interface LibraryItem {
  path: string;
  name: string;
  title: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  size: number;
  mtime: number;
  poster: string | null;
  specs?: LibrarySpecs;
}

export interface Track {
  id: number;
  type: 'video' | 'audio' | 'sub';
  lang: string | null;
  title: string | null;
  codec: string | null;
  selected: boolean;
  default: boolean;
}

export interface Chapter {
  title: string | null;
  time: number;
}

export interface HdrInfo {
  videoHdr: boolean;
  kind: 'PQ' | 'HLG' | null;
  transfer: string | null;
  primaries: string | null;
  sigPeak: number | null;
  displayHdr: boolean;
  displayPeak: number | null;
  mode: 'passthrough' | 'tonemap' | 'sdr';
  reason: string;
  algo: string;
  override: string;
}

export interface PlayerMeta {
  tracks: Track[];
  chapters: Chapter[];
  hdr?: HdrInfo | null;
}

/** D25 播放失败错误（四段式：标题/原因/已尝试/操作） */
export interface PlayError {
  file: string;
  reason: string;
  attempted: string;
}

export interface AuroraBridge {
  platform: string;
  versions: { electron: string; node: string };
  /** 转发任意 mpv IPC 命令,resolve 为 mpv 的 data 字段 */
  mpv: (...args: unknown[]) => Promise<unknown>;
  /** 弹出打开文件对话框并开始播放 */
  openFile: () => Promise<void>;
  /** 打开指定路径(M1+ 最近播放续播用) */
  openPath: (path: string, seek?: number) => Promise<void>;
  /** 停止播放并关闭播放窗口 */
  stop: () => Promise<void>;
  /** 最近播放列表 */
  getRecent: () => Promise<RecentItem[]>;
  /** DLNA 服务状态 */
  getDlnaState: () => Promise<DlnaState>;
  /** 设置读取/部分更新(返回合并后完整设置) */
  getSettings: () => Promise<Settings>;
  setSettings: (patch: Partial<Settings>) => Promise<Settings>;
  /** 媒体库 */
  getLibrary: () => Promise<LibraryItem[]>;
  rescanLibrary: () => Promise<boolean>;
  /** 清空媒体库条目(保留文件夹配置) */
  clearLibrary: () => Promise<boolean>;
  /** 清除最近播放记录 */
  clearRecent: () => Promise<boolean>;
  addLibraryFolder: () => Promise<string[]>;
  /** NAS 在线浏览：列目录(文件夹+视频)，在线点播不入库 */
  listNas: (dir: string) => Promise<{ ok: boolean; unc?: string; entries?: NasEntry[]; error?: string; needAuth?: boolean }>;
  openNasExplorer: (unc: string) => Promise<void>;
  onLibraryUpdated: (cb: (items: LibraryItem[]) => void) => () => void;
  /** 主进程路由切换指令（nav:goto，值为 home/settings/player） */
  onNavigate: (cb: (route: string) => void) => () => void;
  /** 播放状态推送(播放会话期间 ~2Hz) */
  onStatus: (cb: (s: PlayerStatus) => void) => () => void;
  /** 元数据推送(file-loaded 时:轨道/章节) */
  onMeta: (cb: (m: PlayerMeta) => void) => () => void;
  /** 投屏互抢 Toast（规格 §8：正在由 <设备> 投放） */
  onCastToast: (cb: (text: string) => void) => () => void;
  /** 切换播放窗口全屏 */
  toggleFullscreen: () => Promise<void>;
  /** HDR 覆盖：mode auto/passthrough/tonemap, algo 色调映射算法 */
  setHdrOverride: (o: { mode: string; algo?: string | null }) => Promise<void>;
  /** 载入外部字幕(文件对话框 → sub-add) */
  addSubtitle: () => Promise<void>;
  /** 缩略图查询：时间(s) → 最近帧 file:// URL，未就绪返回 null */
  getThumb: (time: number) => Promise<string | null>;
  /** 快照：导出原始视频帧 PNG，返回保存路径（D31，Ctrl+S） */
  screenshot: () => Promise<string | null>;
  /** 播放失败重试（software=true 时强制软件解码，D25） */
  retryPlayback: (software?: boolean) => Promise<boolean>;
  /** 导出 mpv 日志，返回保存路径（D25） */
  exportLog: () => Promise<string | null>;
  /** 播放失败推送（end-file reason=error，D25） */
  onPlayError: (cb: (e: PlayError) => void) => () => void;
  /** 手动窗口拖拽（透明窗 app-region 失效的替代方案） */
  dragStart: () => void;
  dragEnd: () => void;
  /** 手动边缘缩放：dir ∈ n/s/e/w/ne/nw/se/sw */
  resizeStart: (dir: string) => void;
  resizeEnd: () => void;
  minimizeWindow: () => void;
  toggleMaximize: () => void;
  closeWindow: () => void;
}

declare global {
  interface Window {
    aurora: AuroraBridge;
  }
}

export {};
