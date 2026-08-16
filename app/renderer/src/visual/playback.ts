/**
 * visual/playback.ts — PlaybackProbe
 * Player/Home 只负责推送已有状态（§15：Player 不做视觉逻辑），
 * 视觉系统据此决定 Normal/Immersive 与预算。
 */
export interface PlaybackInfo {
  playing: boolean;
  paused: boolean;
  idle: boolean;           // UI 自动隐藏（仅隐藏控制层，≠ Immersive）
  fullscreen: boolean;
  title: string | null;
  fileId: string | null;   // 当前媒体文件（frame palette 缓存键）
  time: number;            // 当前播放位置（frame 取色用）
  coverUrl: string | null; // 当前海报（cover palette 用）
  videoW: number | null;
  videoH: number | null;
}

let state: PlaybackInfo = {
  playing: false, paused: true, idle: false, fullscreen: false,
  title: null, fileId: null, time: 0, coverUrl: null,
  videoW: null, videoH: null,
};
const subs = new Set<() => void>();

export const PlaybackProbe = {
  update(patch: Partial<PlaybackInfo>): void {
    state = { ...state, ...patch };
    subs.forEach((cb) => cb());
  },
  get(): PlaybackInfo { return state; },
  on(cb: () => void): () => void { subs.add(cb); return () => subs.delete(cb); },
};
