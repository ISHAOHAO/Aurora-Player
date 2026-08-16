// 冒烟测试：registry / resolver / store / shell 渲染（DOM shim）
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const load = (f) => eval(fs.readFileSync(path.join(dir, f), 'utf8'));

// --- DOM shim ---
const localStorageMock = (() => { const m = new Map(); return {
  getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)),
  removeItem: (k) => m.delete(k),
}; })();
global.window = {};
global.localStorage = localStorageMock;
global.document = { createElement: () => ({ style: {}, set textContent(v) {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {} };
global.location = { hash: '', search: '' };
global.matchMedia = () => ({ matches: false, addEventListener() {} });
global.Image = function () { this.onload = null; };

load('js/data.js');
load('js/visual/registry.js');
load('js/visual/resolver.js');
load('js/visual/store.js');
load('js/shell-c.js');

// shell 需要的 PROTO 垫片
const settings = {
  rememberPosition: true, volumeStep: 5, hdrMode: 'auto', hdrAlgo: 'spline',
  replayGain: 'off', audioNormalize: true, audioChannels: 'auto-safe',
  audioExclusive: true, audioBitstream: 'none', subFontSize: 34,
  defaultVolume: 72, audioGain: 0, dlnaEnabled: true, dlnaFriendlyName: '王先生的影音室',
  bgCasting: true, lockPolicy: 'none', theme: 'dark', visualMode: 'cinema',
};
const state = { page: 'home', query: '', filter: 'all', group: 'play', settings, modal: null, paused: true, pct: 64, volume: 72, mute: false, drawer: false, menu: null, fullscreen: false };
const atoms = {
  winControls: () => '<div class="vs-win-controls"></div>',
  icon: () => '<svg></svg>',
  themeIcon: () => '<svg></svg>',
};
window.PROTO = { state, atoms, DATA: window.DATA };

let ok = 0, fail = 0;
const check = (n, c) => { if (c) { ok++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n); } };

// 1. registry
const themes = window.VISUAL.registry.list();
check('registry lists 6 official themes', themes.length === 6);
check('theme ids unique', new Set(themes.map((t) => t.id)).size === 6);

// 2. resolver：每个主题产出完整视觉状态
for (const t of window.VISUAL.registry.defaults) {
  const r = window.VISUAL.resolver.resolve(t, { state: 'browse' });
  const needed = ['--vs-bg', '--vs-text', '--vs-accent', '--vs-glass-bg', '--vs-density', '--vs-player-opacity'];
  const missing = needed.filter((k) => r.cssVars[k] == null);
  check('resolver ' + t.id + ' cssVars 完整', missing.length === 0);
  check('resolver ' + t.id + ' engineParams 完整', r.engineParams.scene && r.engineParams.particles && r.engineParams.motion != null);
}

// 3. resolver 状态分级：browse 无 bloom / player 有
{
  const t = window.VISUAL.registry.getFull('immersive');
  const b = window.VISUAL.resolver.resolve(t, { state: 'browse' }).engineParams;
  const p = window.VISUAL.resolver.resolve(t, { state: 'player' }).engineParams;
  check('状态分级 browse bloom=0', b.bloom === 0);
  check('状态分级 player bloom>0', p.bloom > 0);
}

// 4. store：编辑官方主题 → 自动 Custom Copy
{
  window.VISUAL.store.apply('cinema');
  const metaBefore = window.VISUAL.store.getActiveMeta();
  check('apply 后为官方主题', metaBefore.source === 'builtin');
  window.VISUAL.store.setParam('lighting.intensity', 0.9);
  const metaAfter = window.VISUAL.store.getActiveMeta();
  check('编辑后自动复制为 user', metaAfter.source === 'user');
  const t = window.VISUAL.store.getActiveTheme();
  check('编辑值已生效', Math.abs(t.lighting.intensity - 0.9) < 1e-6);
  const saved = window.VISUAL.store.saveAs('我的测试主题');
  check('saveAs 返回新预设', !!saved && window.VISUAL.store.getActiveMeta().name === '我的测试主题');
  window.VISUAL.store.apply('noir');
  check('切换到 Noir 成功', window.VISUAL.store.getActiveMeta().name === 'Noir');
  window.VISUAL.store.resetActive();
  check('reset 回 Cinema', window.VISUAL.store.getActiveMeta().name === 'Cinema');
}

// 5. shell 渲染
for (const p of ['home', 'settings', 'player']) {
  state.page = p;
  try {
    const html = window.SHELL[p]();
    const minLen = p === 'home' ? 500 : 300;
    check('shell/' + p + ' 渲染', html && html.length > minLen);
  } catch (e) {
    check('shell/' + p + ' 渲染', false);
    console.log('   error: ' + e.message);
  }
}

// 6. search 态
state.query = '星际';
try { window.SHELL.home(); check('shell/home(search)', true); } catch (e) { check('shell/home(search)', false); console.log('   ' + e.message); }
state.query = '';

console.log('RESULT ok=' + ok + ' fail=' + fail);
process.exit(fail ? 1 : 0);
