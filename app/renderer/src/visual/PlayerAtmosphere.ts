/**
 * visual/PlayerAtmosphere.ts — 播放态 → 视觉预算
 * 关键（修正 12）：UI idle ≠ Immersive。
 *  - idle 只隐藏控制层
 *  - Immersive 必须由 手动切换 / 用户偏好(theme.defaultPresentation) / 明确的全屏策略 进入
 *  - 用户显式退出后，不会因再次 idle 自动重入
 */
import type { PlaybackContext, RouteState } from './types';

export type ImmersiveOverride = boolean | null;   // null = 未手动指定

export function computeRouteState(ctx: PlaybackContext): RouteState {
  if (ctx.route !== 'player') return ctx.route === 'settings' ? 'settings' : 'browse';
  return ctx.presentation === 'immersive' ? 'immersive' : 'playback';
}

export function derivePresentation(
  ctx: Pick<PlaybackContext, 'fullscreen' | 'playing'>,
  themeDefault: 'normal' | 'immersive',
  manual: ImmersiveOverride,
): 'normal' | 'immersive' {
  if (manual !== null) return manual ? 'immersive' : 'normal';
  if (themeDefault === 'immersive' && (ctx.fullscreen || ctx.playing)) return 'immersive';
  return 'normal';
}
