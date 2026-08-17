/**
 * visual-test-entry.ts — Visual Engine 纯逻辑单测（registry/resolver/store）
 * 由 scripts/visual-test.js 经 vite lib(cjs) 打包后在 node 运行。
 * 不触碰 DOM / IPC（store 的持久化在无 window 时安全降级）。
 */
import { REGISTRY, getBuiltinTheme, listThemes, cloneTheme } from '../renderer/src/visual/registry';
import { resolve } from '../renderer/src/visual/resolver';
import { STATE_BUDGETS } from '../renderer/src/visual/types';
import { VisualStore } from '../renderer/src/visual/store';
import type { VisualTheme } from '../renderer/src/visual/types';
import { videoMaskPolygon } from '../renderer/src/visual/engines/FluidEngine';

let ok = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { ok++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}

/* 1. registry */
check('registry 1 个官方主题', REGISTRY.length === 1);
check('主题 id 唯一', new Set(REGISTRY.map((t) => t.id)).size === 1);
check('listThemes 返回 builtin', listThemes().every((t) => t.source === 'builtin'));
check('getBuiltinTheme 深拷贝', getBuiltinTheme('aqua') !== getBuiltinTheme('aqua'));
check('cloneTheme 独立', (() => { const a = cloneTheme(getBuiltinTheme('aqua')!); a.ui.accent = '#000'; return getBuiltinTheme('aqua')!.ui.accent !== '#000'; })());

/* 2. resolver：每个主题产出完整视觉状态（dark + light） */
const NEEDED_VARS = ['--bg-base', '--text-primary', '--accent', '--ov-text', '--cv-hi', '--vs-accent', '--vs-glass-bg', '--vs-chrome-opacity', '--vs-density', '--vs-player-opacity'];
const accents = new Set<string>();
for (const t of REGISTRY) {
  for (const appearance of ['dark', 'light'] as const) {
    const r = resolve(t, { state: 'browse', appearance });
    const missing = NEEDED_VARS.filter((k) => r.cssVars[k] == null || r.cssVars[k] === '');
    check(`resolver ${t.id}/${appearance} cssVars 完整`, missing.length === 0);
    check(`resolver ${t.id}/${appearance} engineParams 完整`, !!(r.engineParams.scene && r.engineParams.particles && r.engineParams.motion && r.engineParams.ui));
  }
  accents.add(resolve(t, { state: 'browse', appearance: 'dark' }).cssVars['--vs-accent']);
}
check('Aqua dark accent 存在', accents.size === 1);

/* 2b. Appearance 独立维度（问题 1）：Light/Dark 产出不同且语义正确 */
{
  const c = getBuiltinTheme('aqua')!;
  const dark = resolve(c, { state: 'browse', appearance: 'dark' });
  const light = resolve(c, { state: 'browse', appearance: 'light' });
  check('Aqua Light ≠ Dark bg', dark.cssVars['--vs-bg'] !== light.cssVars['--vs-bg']);
  check('Aqua Light 为浅色背景', (() => { const m = /#([0-9a-f]{6})/i.exec(light.cssVars['--vs-bg']); if (!m) return false; const n = parseInt(m[1], 16); const l = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.6 + (n & 255) * 0.1; return l > 150; })());
  check('Aqua Light 文字为深色', (() => { const m = /#([0-9a-f]{6})/i.exec(light.cssVars['--vs-text']); if (!m) return false; const n = parseInt(m[1], 16); const l = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.6 + (n & 255) * 0.1; return l < 100; })());
}

/* 2c. 1 主题 × Light/Dark 可读性：text 与 bg 对比足够 */
{
  const lum = (hex: string) => { const m = /#([0-9a-f]{6})/i.exec(hex); if (!m) return 0; const n = parseInt(m[1], 16); return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.6 + (n & 255) * 0.1; };
  let okC = 0;
  for (const t of REGISTRY) {
    for (const appearance of ['dark', 'light'] as const) {
      const r = resolve(t, { state: 'browse', appearance });
      const contrast = Math.abs(lum(r.cssVars['--vs-text']) - lum(r.cssVars['--vs-bg']));
      if (contrast > 60) okC++;
    }
  }
  check('2 组合 text/bg 对比可读（≥60 亮度差）', okC === 2);
}

/* 2g. Aqua 主题：aqua 段 → 令牌 + engineParams.aqua */
{
  const a = getBuiltinTheme('aqua')!;
  check('Aqua 主题含 aqua 段', !!a.aqua);
  const dark = resolve(a, { state: 'browse', appearance: 'dark' });
  check('Aqua dark 有 --vs-glass-card-dark', (dark.cssVars['--vs-glass-card-dark'] || '').includes('linear-gradient'));
  check('Aqua dark 有 --vs-frost', Number(dark.cssVars['--vs-frost']) > 0);
  check('Aqua engineParams.aqua.enabled', dark.engineParams.aqua?.enabled === true);
  check('Aqua aqua.fluidHue 传递', dark.engineParams.aqua?.fluidHue === 320);
  check('Aqua aqua.mode=mica', dark.engineParams.aqua?.mode === 'mica');
  check('Aqua aqua.mesh=true', dark.engineParams.aqua?.mesh === true);
  check('Aqua aqua.videoBlur=6', dark.engineParams.aqua?.videoBlur === 6);
  check('Aqua scene mode=fluid 有兜底底色', (dark.cssVars['--vs-bg'] || '').length > 0);
  const light = resolve(a, { state: 'browse', appearance: 'light' });
  check('Aqua light 有 --vs-glass-card-light', (light.cssVars['--vs-glass-card-light'] || '').includes('linear-gradient'));
}

/* 2h. videoMaskPolygon：letterbox mask 几何 */
{
  const bars = videoMaskPolygon({ top: 60, bottom: 540, left: 0, right: 960 }, 960, 600);
  check('水平 bars mask 含 top/bottom 且中心镂空',
    bars.includes('100% 60px, 0 60px') && bars.includes('0 60px, 0 540px') && bars.includes('0 540px, 100% 540px') && !bars.includes('0 60px, 100% 540px'));
  const pill = videoMaskPolygon({ top: 0, bottom: 600, left: 180, right: 780 }, 960, 600);
  check('垂直 pillarbox mask 含 left/right 条且中心镂空',
    pill.includes('180px 100%, 780px 100%') && !pill.includes('0 100%, 780px 0'));
  const full = videoMaskPolygon({ top: 0, bottom: 600, left: 0, right: 960 }, 960, 600);
  check('全窗 mask 退化为空 polygon', full.includes('100% 100%, 100% 100%'));
}

/* 3. Video First 硬上限（修正 1） */
{
  const big = cloneTheme(getBuiltinTheme('aqua')!);   // bgOpacity 0.9
  const b = resolve(big, { state: 'browse' }).engineParams;
  check('browse bgOpacity 封顶 0.20', Math.abs(b.scene.opacity - STATE_BUDGETS.browse.bgOpacityMax) < 1e-9);
  const im = resolve(big, { state: 'immersive' }).engineParams;
  check('immersive bgOpacity 封顶 0.28 且播放页场景低语(×0.2)', Math.abs(im.scene.opacity - STATE_BUDGETS.immersive.bgOpacityMax * 0.2) < 1e-9);
}

/* 4. 状态分级：atmosphere 组门控 */
{
  const t = getBuiltinTheme('aqua')!;
  const browse = resolve(t, { state: 'browse' }).engineParams;
  const play = resolve(t, { state: 'playback' }).engineParams;
  const imm = resolve(t, { state: 'immersive' }).engineParams;
  check('browse 禁 bloom', browse.bloom === 0);
  check('browse 禁 vignette', browse.vignette === 0);
  check('browse 禁 motion', browse.motion.enabled === false);
  check('playback 开 bloom', play.bloom > 0);
  check('immersive 开 motion', imm.motion.enabled === true);
  check('settings 禁粒子', resolve(t, { state: 'settings' }).engineParams.particles.density === 0);
}

/* 5. 三类强度独立（修正 2） */
{
  const t = getBuiltinTheme('aqua')!;
  const hi = { ...t, ui: { ...t.ui, opacity: 0.95 } };
  const lo = { ...t, ui: { ...t.ui, opacity: 0.4 } };
  const a = resolve(hi, { state: 'playback' });
  const b = resolve(lo, { state: 'playback' });
  check('ui.opacity 影响 UI 组', Math.abs(a.engineParams.ui.chromeOpacity - b.engineParams.ui.chromeOpacity) > 0.1);
  check('ui.opacity 不影响 Scene 组', Math.abs(a.engineParams.light.opacity - b.engineParams.light.opacity) < 1e-9);
  check('ui.opacity 不影响 Atmosphere 组', Math.abs(a.engineParams.grain - b.engineParams.grain) < 1e-9);
}

/* 6. 播放页 blend = screen（视频优先合成） */
{
  const t = getBuiltinTheme('aqua')!;
  check('player scene blend=screen', resolve(t, { state: 'playback' }).engineParams.scene.blend === 'screen');
  check('browse scene blend=normal', resolve(t, { state: 'browse' }).engineParams.scene.blend === 'normal');
}

/* 7. store：编辑官方主题 → 自动 Custom Copy；预设 CRUD */
(async () => {
  await VisualStore.apply('aqua');
  check('apply 后为官方主题', VisualStore.getActiveMeta().source === 'builtin');
  VisualStore.setParam('lighting.intensity', 0.9);
  check('编辑后自动复制为 user', VisualStore.getActiveMeta().source === 'user');
  check('编辑值生效', Math.abs(VisualStore.getActiveTheme().lighting.intensity - 0.9) < 1e-6);
  const saved = await VisualStore.saveAs('我的测试主题');
  check('saveAs 成功', !!saved && VisualStore.getActiveMeta().name === '我的测试主题');
  await VisualStore.apply('aqua');
  check('切换 Aqua', VisualStore.getActiveMeta().name === 'Aqua');
  await VisualStore.resetActive();
  check('reset 回 Aqua', VisualStore.getActiveMeta().name === 'Aqua');
  // 官方主题未被修改
  check('官方主题未被污染', getBuiltinTheme('aqua')!.lighting.intensity === 0.45);

  // 8. State Sync（Phase 4.y 问题 2）：逐主题切换，store 与选中始终一致
  for (const id of ['aqua']) {
    await VisualStore.apply(id);
    check(`state sync: apply(${id}) → activeThemeId`, VisualStore.activeThemeId === id && VisualStore.getActiveMeta().name.toLowerCase() === id);
  }
  // Custom：编辑 → Custom Copy，active 显示副本而非官方
  await VisualStore.apply('aqua');
  VisualStore.setParam('ui.accent', '#FF00AA');
  check('custom copy active 而非 Aqua', VisualStore.getActiveMeta().source === 'user' && VisualStore.getActiveMeta().name.startsWith('Custom Copy'));
  check('listPresets 含 custom copy', VisualStore.listPresets().some((p) => p.source === 'user' && p.name.startsWith('Custom Copy')));
  // 选中态 identity：Settings 以 activeThemeId 比对 preset id（内置 id 与预设 id 不混淆）
  await VisualStore.resetActive();
  check('reset 后 identity 回 Aqua', VisualStore.activeThemeId === 'aqua');
  const noUserSelected = VisualStore.listPresets().filter((p) => p.id === VisualStore.activeThemeId && p.source === 'user').length === 0;
  check('内置主题选择不被 user preset 混淆', noUserSelected);

  console.log(`RESULT ok=${ok} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})();
