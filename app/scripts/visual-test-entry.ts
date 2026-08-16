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

let ok = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { ok++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}

/* 1. registry */
check('registry 7 个官方主题', REGISTRY.length === 7);
check('主题 id 唯一', new Set(REGISTRY.map((t) => t.id)).size === 7);
check('listThemes 返回 builtin', listThemes().every((t) => t.source === 'builtin'));
check('getBuiltinTheme 深拷贝', getBuiltinTheme('cinema') !== getBuiltinTheme('cinema'));
check('cloneTheme 独立', (() => { const a = cloneTheme(getBuiltinTheme('noir')!); a.ui.accent = '#000'; return getBuiltinTheme('noir')!.ui.accent !== '#000'; })());

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
check('7 主题 dark accent 各自不同', accents.size === 7);

/* 2b. Appearance 独立维度（问题 1）：Light/Dark 产出不同且语义正确 */
{
  const c = getBuiltinTheme('cinema')!;
  const dark = resolve(c, { state: 'browse', appearance: 'dark' });
  const light = resolve(c, { state: 'browse', appearance: 'light' });
  check('Cinema Light ≠ Dark bg', dark.cssVars['--vs-bg'] !== light.cssVars['--vs-bg']);
  check('Cinema Light 为浅色背景', (() => { const m = /#([0-9a-f]{6})/i.exec(light.cssVars['--vs-bg']); if (!m) return false; const n = parseInt(m[1], 16); const l = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.6 + (n & 255) * 0.1; return l > 150; })());
  check('Cinema Light 文字为深色', (() => { const m = /#([0-9a-f]{6})/i.exec(light.cssVars['--vs-text']); if (!m) return false; const n = parseInt(m[1], 16); const l = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.6 + (n & 255) * 0.1; return l < 100; })());
}

/* 2c. 六主题 × Light/Dark 可读性：text 与 bg 对比足够 */
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
  check('14 组合 text/bg 对比可读（≥60 亮度差）', okC === 14);
}

/* 2d. OLED Light ≠ OLED Dark（Phase 4.y：亮白参考模式 vs 纯黑影院） */
{
  const lum = (hex: string) => { const m = /#([0-9a-f]{6})/i.exec(hex); if (!m) return 0; const n = parseInt(m[1], 16); return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.6 + (n & 255) * 0.1; };
  const o = getBuiltinTheme('oled')!;
  const d = resolve(o, { state: 'browse', appearance: 'dark' });
  const l = resolve(o, { state: 'browse', appearance: 'light' });
  check('OLED Dark 纯黑', lum(d.cssVars['--vs-bg']) < 5);
  check('OLED Light 亮白参考', lum(l.cssVars['--vs-bg']) > 240);
  check('OLED Light 深色文字', lum(l.cssVars['--vs-text']) < 30);
}

/* 2e. Theme Distinctiveness（Phase 4.y）：Typography / Surface / Shape 真正不同 */
{
  const fonts = new Set<string>();
  const shadows = new Set<string>();
  const radii = new Set<string>();
  for (const t of REGISTRY) {
    const r = resolve(t, { state: 'browse', appearance: 'dark' });
    fonts.add(r.cssVars['--vs-font-display']);
    shadows.add(r.cssVars['--vs-shadow']);
    radii.add(r.cssVars['--vs-r-md']);
  }
  check('display 字体 ≥2 套（Noir=衬线 / 其余无衬线）', fonts.size >= 2);
  check('font-display 含衬线（Noir serif）', getBuiltinTheme('noir')!.signature?.typography === 'serif');
  check('surface 阴影语言 ≥3 种', shadows.size >= 3);
  check('shape 圆角语言 ≥3 档', radii.size >= 3);
  check('全部主题有 signature', REGISTRY.every((t) => t.signature && t.signature.surface));
}

/* 2f. 差异化对（Cinema vs Noir / OLED / Glass / Immersive）视觉不同 */
{
  const sigs = Object.fromEntries(REGISTRY.map((t) => [t.id, t.signature!]));
  check('Cinema vs Noir 布局语言不同', sigs.cinema.layout !== sigs.noir.layout && sigs.cinema.typography !== sigs.noir.typography && sigs.cinema.surface !== sigs.noir.surface);
  check('Cinema vs OLED 布局语言不同', sigs.cinema.layout !== sigs.oled.layout && sigs.cinema.surface !== sigs.oled.surface);
  check('Cinema vs Glass 布局语言不同', sigs.cinema.surface !== sigs.glass.surface && sigs.cinema.shape !== sigs.glass.shape);
  check('Cinema vs Immersive 布局语言不同', sigs.cinema.layout !== sigs.immersive.layout && sigs.cinema.surface !== sigs.immersive.surface && sigs.cinema.density !== sigs.immersive.density);
  const cinemaR = resolve(getBuiltinTheme('cinema')!, { state: 'browse', appearance: 'dark' });
  const noirR = resolve(getBuiltinTheme('noir')!, { state: 'browse', appearance: 'dark' });
  check('Cinema shadow ≠ Noir shadow（Noir=无阴影）', cinemaR.cssVars['--vs-shadow'] !== noirR.cssVars['--vs-shadow'] && noirR.cssVars['--vs-shadow'] === 'none');
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
  check('Aqua scene mode=fluid 有兜底底色', (dark.cssVars['--vs-bg'] || '').length > 0);
  const light = resolve(a, { state: 'browse', appearance: 'light' });
  check('Aqua light 有 --vs-glass-card-light', (light.cssVars['--vs-glass-card-light'] || '').includes('linear-gradient'));
  const c = getBuiltinTheme('cinema')!;
  check('Cinema 无 aqua 引擎参数', resolve(c, { state: 'browse', appearance: 'dark' }).engineParams.aqua == null);
}

/* 3. Video First 硬上限（修正 1） */
{
  const big = cloneTheme(getBuiltinTheme('immersive')!);   // bgOpacity 0.84
  const b = resolve(big, { state: 'browse' }).engineParams;
  check('browse bgOpacity 封顶 0.20', Math.abs(b.scene.opacity - STATE_BUDGETS.browse.bgOpacityMax) < 1e-9);
  const im = resolve(big, { state: 'immersive' }).engineParams;
  check('immersive bgOpacity 封顶 0.28 且播放页场景低语(×0.2)', Math.abs(im.scene.opacity - STATE_BUDGETS.immersive.bgOpacityMax * 0.2) < 1e-9);
}

/* 4. 状态分级：atmosphere 组门控 */
{
  const t = getBuiltinTheme('immersive')!;
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
  const t = getBuiltinTheme('cinema')!;
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
  const t = getBuiltinTheme('glass')!;
  check('player scene blend=screen', resolve(t, { state: 'playback' }).engineParams.scene.blend === 'screen');
  check('browse scene blend=normal', resolve(t, { state: 'browse' }).engineParams.scene.blend === 'normal');
}

/* 7. store：编辑官方主题 → 自动 Custom Copy；预设 CRUD */
(async () => {
  await VisualStore.apply('cinema');
  check('apply 后为官方主题', VisualStore.getActiveMeta().source === 'builtin');
  VisualStore.setParam('lighting.intensity', 0.9);
  check('编辑后自动复制为 user', VisualStore.getActiveMeta().source === 'user');
  check('编辑值生效', Math.abs(VisualStore.getActiveTheme().lighting.intensity - 0.9) < 1e-6);
  const saved = await VisualStore.saveAs('我的测试主题');
  check('saveAs 成功', !!saved && VisualStore.getActiveMeta().name === '我的测试主题');
  await VisualStore.apply('noir');
  check('切换 Noir', VisualStore.getActiveMeta().name === 'Noir');
  await VisualStore.resetActive();
  check('reset 回 Cinema', VisualStore.getActiveMeta().name === 'Cinema');
  // 官方主题未被修改
  check('官方主题未被污染', getBuiltinTheme('cinema')!.lighting.intensity === 0.25);

  // 8. State Sync（Phase 4.y 问题 2）：逐主题切换，store 与选中始终一致
  for (const id of ['cinema', 'aurora', 'noir', 'oled', 'glass', 'immersive', 'aqua']) {
    await VisualStore.apply(id);
    check(`state sync: apply(${id}) → activeThemeId`, VisualStore.activeThemeId === id && VisualStore.getActiveMeta().name.toLowerCase() === id);
  }
  // Custom：编辑 → Custom Copy，active 显示副本而非官方
  await VisualStore.apply('cinema');
  VisualStore.setParam('ui.accent', '#FF00AA');
  check('custom copy active 而非 Cinema', VisualStore.getActiveMeta().source === 'user' && VisualStore.getActiveMeta().name.startsWith('Custom Copy'));
  check('listPresets 含 custom copy', VisualStore.listPresets().some((p) => p.source === 'user' && p.name.startsWith('Custom Copy')));
  // 选中态 identity：Settings 以 activeThemeId 比对 preset id（内置 id 与预设 id 不混淆）
  await VisualStore.resetActive();
  check('reset 后 identity 回 Cinema', VisualStore.activeThemeId === 'cinema');
  const noUserSelected = VisualStore.listPresets().filter((p) => p.id === VisualStore.activeThemeId && p.source === 'user').length === 0;
  check('内置主题选择不被 user preset 混淆', noUserSelected);

  console.log(`RESULT ok=${ok} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})();
