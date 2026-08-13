/**
 * Aurora Player — HDR 画质决策链（docs/02 §4.3）
 * 纯函数，可单测。输入 mpv 属性，输出模式 + 应用的 mpv 属性集。
 *
 * 决策矩阵（Auto 模式）：
 *   source_hdr && display_hdr  → passthrough（直通：target-colorspace-hint）
 *   source_hdr && !display_hdr → tonemap（HDR→SDR 色调映射）
 *   !source_hdr                → sdr（原生输出，不动色彩链）
 *
 * 覆盖：override.mode = 'auto' | 'passthrough' | 'tonemap'（仅 HDR 源生效）
 *       override.algo = 色调映射算法（tonemap 时生效）
 */
'use strict';

const PQ_NAMES = ['pq', 'smpte2084', 'smpte2084(pq)'];
const HLG_NAMES = ['hlg', 'arib-std-b67'];

const TONE_ALGOS = ['spline', 'bt.2390', 'bt.2446a', 'hable', 'mobius', 'reinhard', 'clip'];
const DEFAULT_ALGO = 'spline'; // libplacebo 推荐默认值（兼顾高光细节与亮度）

/** transfer 名称归一 → 'PQ' | 'HLG' | null */
function hdrKind(gamma) {
  const g = String(gamma || '').toLowerCase();
  if (PQ_NAMES.includes(g)) return 'PQ';
  if (HLG_NAMES.includes(g)) return 'HLG';
  return null;
}

/**
 * @param video   { gamma, primaries, sigPeak }  来自 video-params/*
 * @param display { hdr, peak }                  hdr: 显示器 HDR 能力（主进程从 VO 日志 "Queried output" 解析）
 * @param override { mode, algo }
 * @param tune    { targetPeak, targetContrast, saturation, hdrPeakPercentile }  高级调参（D23）
 */
function decide(video, display, override = {}, tune = {}) {
  const kind = hdrKind(video.gamma);
  const videoHdr = !!kind;
  const displayHdr = !!display.hdr;
  const algo = TONE_ALGOS.includes(override.algo) ? override.algo : DEFAULT_ALGO;

  const base = {
    videoHdr, kind,
    transfer: video.gamma || null,
    primaries: video.primaries || null,
    sigPeak: video.sigPeak || null,
    displayHdr,
    displayPeak: display.peak || null,
    algo,
    override: override.mode || 'auto',
  };

  // 高级调参 → mpv 属性（0/undefined = 不设置，走 mpv 自动）
  const tuneProps = {};
  if (typeof tune.saturation === 'number' && tune.saturation !== 0) tuneProps.saturation = tune.saturation;
  if (typeof tune.hdrPeakPercentile === 'number' && tune.hdrPeakPercentile > 0) tuneProps['hdr-peak-percentile'] = tune.hdrPeakPercentile;
  const tonemapTune = { ...tuneProps };
  if (tune.targetPeak > 0) tonemapTune['target-peak'] = tune.targetPeak;
  if (tune.targetContrast > 0) tonemapTune['target-contrast'] = tune.targetContrast;

  if (!videoHdr) {
    return {
      ...base, mode: 'sdr',
      reason: 'SDR 片源，原生输出（SDR→HDR 为实验项，默认关）',
      props: { 'target-colorspace-hint': 'no', ...tuneProps },
    };
  }

  // 用户强制覆盖（仅 HDR 源）
  if (override.mode === 'passthrough' || (override.mode !== 'tonemap' && displayHdr)) {
    return {
      ...base, mode: 'passthrough',
      reason: override.mode === 'passthrough'
        ? `用户强制直通：${kind} 元数据随帧透传至 HDR 显示器`
        : `HDR 片源(${kind}) + HDR 显示器，PQ/HLG 直通`,
      props: {
        'target-colorspace-hint': 'yes',
        'hdr-compute-peak': 'no',
        ...tuneProps,
      },
    };
  }

  return {
    ...base, mode: 'tonemap',
    reason: override.mode === 'tonemap'
      ? `用户强制色调映射：${kind} → SDR（${algo}）`
      : `HDR 片源(${kind}) 在 SDR 显示器上播放，色调映射（${algo}，感知色域映射）`,
    props: {
      'target-colorspace-hint': 'no',
      'tone-mapping': algo,
      'hdr-compute-peak': 'yes',       // 逐帧峰值检测，暗场/亮场自适应
      'gamut-mapping-mode': 'perceptual',
      ...tonemapTune,
    },
  };
}

module.exports = { decide, hdrKind, TONE_ALGOS, DEFAULT_ALGO };
