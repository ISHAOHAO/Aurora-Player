/**
 * visual/useVisual.ts — 业务层唯一接入面
 * useActiveTheme / usePresentation：主题与呈现状态（不可变快照，订阅驱动）。
 */
import { useSyncExternalStore } from 'react';
import { VisualStore } from './store';
import { VisualSystem } from './controller';
import { PlaybackProbe } from './playback';

/** 当前活动主题（id / name / source，revision 变化即更新） */
export function useActiveTheme() {
  return useSyncExternalStore(
    (cb) => VisualStore.on(cb),
    () => VisualStore.getSnapshot(),
  );
}

/** 当前呈现状态：normal | immersive */
export function usePresentation() {
  return useSyncExternalStore(
    (cb) => VisualSystem.on(cb),
    () => VisualSystem.getPresentation(),
  );
}

/** Visual Console 开合状态 */
export function useVisualConsoleOpen() {
  return useSyncExternalStore(
    (cb) => VisualSystem.on(cb),
    () => VisualSystem.getConsoleOpen(),
  );
}

/** 播放上下文（Player 已推送的真实状态） */
export function usePlaybackInfo() {
  return useSyncExternalStore(
    (cb) => PlaybackProbe.on(cb),
    () => PlaybackProbe.get(),
  );
}

/** 主题变更时触发一次（供页面做轻量响应，如封面重取色） */
export function useVisualStore() {
  return VisualStore;
}
