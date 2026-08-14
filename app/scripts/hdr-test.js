/** HDR 决策链单元测试：node scripts/hdr-test.js */
'use strict';
const { decide } = require('../main/hdr');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (got === want) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} — got ${got}, want ${want}`); }
};

console.log('== HDR 决策链单测 ==');

// SDR 源
let d = decide({ gamma: 'bt.1886', primaries: 'bt.709' }, { hdr: false });
eq('SDR 源 + SDR 显示器 → sdr', d.mode, 'sdr');
d = decide({ gamma: 'bt.709', primaries: 'bt.709' }, { hdr: true });
eq('SDR 源 + HDR 显示器 → sdr(实验项默认关)', d.mode, 'sdr');
eq('SDR 不启用色彩提示', d.props['target-colorspace-hint'], 'no');

// HDR10 (PQ)
d = decide({ gamma: 'pq', primaries: 'bt.2020', sigPeak: 2.5 }, { hdr: true });
eq('PQ + HDR 显示器 → 直通', d.mode, 'passthrough');
eq('直通开 hint', d.props['target-colorspace-hint'], 'yes');
eq('直通动态峰值 auto(元数据缺失时自检)', d.props['hdr-compute-peak'], 'auto');

d = decide({ gamma: 'smpte2084', primaries: 'bt.2020' }, { hdr: false });
eq('PQ(别名) + SDR 显示器 → 色调映射', d.mode, 'tonemap');
eq('默认算法 spline', d.props['tone-mapping'], 'spline');
eq('映射开启动态峰值', d.props['hdr-compute-peak'], 'yes');
eq('感知色域映射', d.props['gamut-mapping-mode'], 'perceptual');

// HLG
d = decide({ gamma: 'hlg', primaries: 'bt.2020' }, { hdr: true });
eq('HLG + HDR 显示器 → 直通', d.mode, 'passthrough');
d = decide({ gamma: 'arib-std-b67' }, { hdr: false });
eq('HLG(别名) + SDR → 色调映射', d.mode, 'tonemap');

// 覆盖
d = decide({ gamma: 'pq' }, { hdr: true }, { mode: 'tonemap', algo: 'bt.2390' });
eq('HDR 显示器上强制色调映射', d.mode, 'tonemap');
eq('覆盖算法 bt.2390', d.props['tone-mapping'], 'bt.2390');
d = decide({ gamma: 'pq' }, { hdr: false }, { mode: 'passthrough' });
eq('SDR 显示器上强制直通(用户负责)', d.mode, 'passthrough');
d = decide({ gamma: 'bt.709' }, { hdr: true }, { mode: 'passthrough' });
eq('SDR 源不受覆盖影响', d.mode, 'sdr');
d = decide({ gamma: 'pq' }, { hdr: false }, { mode: 'tonemap', algo: 'not-exist' });
eq('非法算法回退默认', d.props['tone-mapping'], 'spline');

// 高级调参（D23）
d = decide({ gamma: 'pq' }, { hdr: false }, {}, { targetPeak: 800, targetContrast: 1000, saturation: 0.1, hdrPeakPercentile: 99.5 });
eq('调参注入目标峰值', d.props['target-peak'], 800);
eq('调参注入对比度', d.props['target-contrast'], 1000);
eq('调参注入饱和度', d.props.saturation, 0.1);
eq('调参注入峰值百分位', d.props['hdr-peak-percentile'], 99.5);
d = decide({ gamma: 'pq' }, { hdr: false }, {}, {});
eq('未调参不注入 target-peak', d.props['target-peak'], undefined);
eq('未调参不注入 saturation', d.props.saturation, undefined);

console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
