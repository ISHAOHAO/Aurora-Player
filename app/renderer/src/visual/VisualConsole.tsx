/**
 * visual/VisualConsole.tsx — 导演台（右缘贴边滑出）
 * 分页：Preset / 外观 / 氛围 / 粒子 / 运动 / 播放器 / 高级（默认折叠）
 * 实时调参：setParam → store → resolver → CSS 变量/引擎（不走 IPC，见修正 3）
 */
import { useEffect, useState } from 'react';
import { VisualStore } from './store';
import { VisualSystem } from './controller';
import { useActiveTheme, usePresentation, useVisualConsoleOpen } from './useVisual';

type Tab = 'preset' | 'appearance' | 'atmosphere' | 'particles' | 'motion' | 'player' | 'advanced';

const GROUPS: [Tab, string][] = [
  ['preset', 'Preset'], ['appearance', '外观'], ['atmosphere', '氛围'],
  ['particles', '粒子'], ['motion', '运动'], ['player', '播放器'], ['advanced', '高级'],
];
const DEFAULT_TABS: Tab[] = ['preset', 'appearance', 'atmosphere', 'particles', 'motion', 'player'];

interface SliderDef { path: string; label: string; min: number; max: number; step: number; fmt: (v: number) => string; }
const SLIDERS: Record<string, SliderDef[]> = {
  appearance: [
    { path: 'scene.bgOpacity', label: '背景不透明度', min: 0.1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'scene.gradient.angle', label: '渐变角度', min: 0, max: 360, step: 5, fmt: (v) => `${Math.round(v)}°` },
    { path: 'ui.opacity', label: '界面透明度', min: 0.3, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'ui.glass', label: '玻璃量', min: 0.05, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'ui.blur', label: '玻璃模糊', min: 0, max: 48, step: 1, fmt: (v) => `${Math.round(v)}px` },
    { path: 'ui.radius', label: '圆角', min: 0, max: 20, step: 1, fmt: (v) => `${Math.round(v)}px` },
    { path: 'ui.border', label: '边框', min: 0, max: 0.35, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'aqua.fluidHue', label: '流体色相', min: 0, max: 360, step: 1, fmt: (v) => `${Math.round(v)}°` },
    { path: 'aqua.fluidDepth', label: '流体深度', min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}` },
    { path: 'aqua.bgBrightness', label: '背景亮度', min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}` },
    { path: 'aqua.wallpaperBlur', label: '壁纸模糊', min: 0, max: 40, step: 0.5, fmt: (v) => `${Math.round(v)}px` },
    { path: 'aqua.wallpaperFrost', label: '壁纸磨砂', min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}%` },
    { path: 'aqua.videoBlur', label: '视频模糊', min: 0, max: 40, step: 0.5, fmt: (v) => `${Math.round(v)}px` },
    { path: 'aqua.videoBrightness', label: '视频亮度', min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}%` },
  ],
  atmosphere: [
    { path: 'lighting.intensity', label: '光照强度', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'lighting.blur', label: '光照扩散', min: 0, max: 60, step: 1, fmt: (v) => `${Math.round(v)}px` },
    { path: 'lighting.spread', label: '光照范围', min: 0.1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'lighting.saturation', label: '光饱和', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'lighting.temperature', label: '色温', min: 0.4, max: 1.6, step: 0.02, fmt: (v) => v.toFixed(2) },
    { path: 'atmosphere.grain', label: '胶片颗粒', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'atmosphere.bloom', label: '泛光', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'atmosphere.vignette', label: '暗角', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'atmosphere.aberration', label: '色差', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  ],
  particles: [
    { path: 'particles.density', label: '密度', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'particles.speed', label: '速度', min: 0, max: 1.2, step: 0.02, fmt: (v) => v.toFixed(2) },
    { path: 'particles.size', label: '大小', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'particles.opacity', label: '不透明度', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'particles.depth', label: '景深', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'particles.reaction', label: '避让反应', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  ],
  motion: [
    { path: 'motion.camera', label: '运镜', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'motion.parallax', label: '视差', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'motion.kenBurns', label: 'Ken Burns', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'motion.transitionSpeed', label: '过渡时长', min: 120, max: 800, step: 20, fmt: (v) => `${Math.round(v)}ms` },
  ],
  player: [
    { path: 'player.controlOpacity', label: '控制层透明度', min: 0.2, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'player.autoHide', label: '自动隐藏', min: 1, max: 8, step: 0.5, fmt: (v) => `${v.toFixed(1)}s` },
  ],
  advanced: [
    { path: 'advanced.particleDepth', label: '粒子景深深度', min: 0, max: 2, step: 0.05, fmt: (v) => v.toFixed(2) },
    { path: 'advanced.lightFalloff', label: '光照衰减', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { path: 'advanced.bloomSamples', label: '泛光采样', min: 2, max: 8, step: 1, fmt: (v) => `${Math.round(v)}` },
  ],
};
const SEG_OPTS: Record<string, [string, string][]> = {
  'scene.mode': [['solid', '纯色'], ['gradient', '渐变'], ['cover', '封面']],
  'ui.density': [['compact', '紧凑'], ['comfortable', '舒适'], ['spacious', '宽舒']],
  'player.metadata': [['minimal', '极简'], ['normal', '常规'], ['technical', '技术']],
  'advanced.motionCurve': [['linear', 'linear'], ['ease', 'ease'], ['cinematic', 'cinematic']],
  'advanced.performance': [['balanced', '平衡'], ['high', '高画质'], ['eco', '节能']],
  'aqua.backdrop': [['fluid', '流体'], ['wallpaper', '壁纸']],
  'aqua.mode': [['mica', '云母效果'], ['compat', '兼容模式']],
};
const SWITCHES: Record<string, [string, string][]> = {
  atmosphere: [
    ['lighting.enabled', '环境光'],
    ['aqua.edgeFade', '边缘雾化'],
    ['aqua.spotlight', '光标聚光'],
    ['aqua.press', '悬浮按压'],
    ['aqua.critters', '海洋生物'],
    ['aqua.mesh', '交互网格'],
    ['aqua.whale', '粒子鲸鱼'],
  ],
  particles: [['particles.enabled', '粒子']],
  motion: [['motion.enabled', '运动']],
  player: [['player.defaultPresentation', 'Immersive 默认']],
  advanced: [['advanced.extremeOpacity', '极端透明度']],
};

function valueOf(path: string): unknown {
  const t = VisualStore.getActiveTheme();
  const seg = path.split('.');
  let o: unknown = t;
  for (const s of seg) o = (o as Record<string, unknown>)?.[s];
  return o;
}

export function VisualConsole() {
  const active = useActiveTheme();
  const presentation = usePresentation();
  const open = useVisualConsoleOpen();
  const [tab, setTab] = useState<Tab>('preset');
  const [msg, setMsg] = useState<string | null>(null);

  const toast = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 2200);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
      if (e.key === 'v' || e.key === 'V') {
        // 播放页 V = 切换 Immersive（§12）；其他页 V = 呼出控制台（§13）
        if (location.hash.startsWith('#/player')) {
          VisualSystem.setConsoleOpen(false);
          VisualSystem.toggleImmersive();
        } else {
          VisualSystem.setConsoleOpen(!open);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const onPlayer = location.hash.startsWith('#/player');

  const presetPane = () => {
    const list = VisualStore.listPresets();
    const activeId = VisualStore.activeThemeId;
    const meta = VisualStore.getActiveMeta();
    const isUser = meta.source === 'user';
    return (
      <div className="vc-pane">
        <div className="vc-presets">
          {list.map((p) => (
            <button key={p.id} className={`vc-preset ${p.id === activeId ? 'on' : ''}`}
              onClick={() => { VisualStore.apply(p.id); toast(`已应用：${p.name}`); }}>
              <i className="vc-swatch" style={{ background: p.id === activeId ? VisualStore.getActiveTheme().ui.accent : '#777' }} />
              <span className="nm">{p.name}</span>
              <span className="tag">{p.source === 'builtin' ? '官方' : '我的'}</span>
            </button>
          ))}
        </div>
        <div className="vc-actions">
          <button onClick={() => { VisualStore.flush(); toast('已保存'); }}>保存</button>
          <button onClick={() => { const n = prompt('预设名称', meta.name + ' · 我的'); if (n?.trim()) { VisualStore.saveAs(n.trim()); toast(`已另存为：${n.trim()}`); } }}>另存为…</button>
          <button onClick={() => { const n = prompt('重命名', meta.name); if (n?.trim()) { if (isUser) VisualStore.renamePreset(activeId, n.trim()); else VisualStore.saveAs(n.trim()); toast('已重命名'); } }}>重命名</button>
          <button onClick={() => { VisualStore.duplicatePreset(activeId); toast('已复制'); }}>复制</button>
          {isUser && <button onClick={() => { VisualStore.removePreset(activeId); toast('已删除'); }}>删除</button>}
          <button onClick={() => { VisualStore.resetActive(); toast('已重置为 Aqua'); }}>重置</button>
          <button onClick={() => { VisualStore.exportActive(); toast('已导出'); }}>导出</button>
          <button onClick={() => { VisualStore.importFromFile().then((t) => toast(t ? `已导入：${t.name}` : '导入取消')); }}>导入</button>
        </div>
      </div>
    );
  };

  const segRow = (path: string, label: string) => (
    <div className="vc-row" key={path}>
      <span>{label}</span>
      <div className="vc-seg">
        {(SEG_OPTS[path] ?? []).map(([v, l]) => (
          <button key={v} className={String(valueOf(path)) === v ? 'on' : ''}
            onClick={() => VisualStore.setParam(path, v)}>{l}</button>
        ))}
      </div>
    </div>
  );

  const paramsPane = () => {
    const rows: React.ReactNode[] = [];
    (SWITCHES[tab] ?? []).forEach(([path, label]) => {
      rows.push(
        <div className="vc-row" key={path}>
          <span>{label}</span>
          <button className={`vc-switch ${valueOf(path) ? 'on' : ''}`}
            onClick={() => VisualStore.setParam(path, !valueOf(path))} />
        </div>,
      );
    });
    if (tab === 'appearance') {
      rows.push(
        <div className="vc-row" key="accent">
          <span>强调色</span>
          <input type="color" value={String(valueOf('ui.accent') ?? '#888')}
            onChange={(e) => VisualStore.setParam('ui.accent', e.target.value)} />
        </div>,
      );
      rows.push(segRow('scene.mode', '背景模式'));
      rows.push(segRow('ui.density', '密度'));
      rows.push(segRow('aqua.mode', 'Aqua 模式'));
      rows.push(segRow('aqua.backdrop', '背景源'));
      rows.push(
        <div className="vc-row" key="wallpaper">
          <span>壁纸</span>
          <div className="vc-seg">
            <label className="vc-file" style={{ cursor: 'pointer' }}>
              选择图片
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fr = new FileReader();
                  fr.onload = () => { VisualStore.setParam('aqua.wallpaper', String(fr.result)); toast('已设置壁纸'); };
                  fr.readAsDataURL(f);
                  e.target.value = '';
                }} />
            </label>
            <label className="vc-file" style={{ cursor: 'pointer' }}>
              选择视频
              <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime" style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  VisualStore.setParam('aqua.backdrop', 'wallpaper');
                  import('./engines/wallpaper-store').then(({ saveVideoBlob }) => saveVideoBlob(f).then((id) => {
                    if (id) VisualStore.setParam('aqua.wallpaper', id);
                  }));
                  e.target.value = '';
                }} />
            </label>
            <button onClick={() => { VisualStore.setParam('aqua.wallpaper', ''); toast('已清除壁纸'); }}>清除</button>
          </div>
        </div>,
      );
    }
    if (tab === 'player') rows.push(segRow('player.metadata', '元数据密度'));
    if (tab === 'advanced') rows.push(segRow('advanced.motionCurve', '运动曲线'), segRow('advanced.performance', '性能档'));
    (SLIDERS[tab] ?? []).forEach((d) => {
      const v = Number(valueOf(d.path)) || d.min;
      rows.push(
        <div className="vc-row" key={d.path}>
          <span>{d.label}</span>
          <div className="vc-slider">
            <input type="range" min={d.min} max={d.max} step={d.step} value={v}
              onChange={(e) => VisualStore.setParam(d.path, parseFloat(e.target.value))} />
            <span className="vc-val">{d.fmt(v)}</span>
          </div>
        </div>,
      );
    });
    if (tab === 'advanced') {
      rows.push(
        <p className="vc-note" key="note">
          高级参数用于实验与性能档位，不影响默认体验。extremeOpacity 允许超出常规透明度范围（仍受 Video First 硬上限约束）。
        </p>,
      );
    }
    return <div className="vc-rows">{rows}</div>;
  };

  return (
    <>
      <button id="vs-console-btn" title="Visual Console（V）" onClick={() => VisualSystem.setConsoleOpen(!open)}>
        <span className="glyph">◈</span><span className="label">视觉</span>
      </button>
      <aside id="vs-console" className={open ? 'open' : ''} aria-hidden={!open}>
        <div className="vc-head">
          <span className="vc-title">Visual Console</span>
          <span className="vc-active">{active.activeName} · {presentation === 'immersive' ? 'Immersive' : 'Normal'}</span>
          <button className="vc-x" onClick={() => VisualSystem.setConsoleOpen(false)}>✕</button>
        </div>
        <div className="vc-tabs">
          {GROUPS.filter(([id]) => id === 'advanced' || DEFAULT_TABS.includes(id)).map(([id, l]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>
          ))}
        </div>
        <div className="vc-body">{tab === 'preset' ? presetPane() : paramsPane()}</div>
        <div className="vc-foot">
          {onPlayer ? (
            <button className={`vc-immersive ${presentation === 'immersive' ? 'on' : ''}`}
              onClick={() => VisualSystem.toggleImmersive()}>
              {presentation === 'immersive' ? '退出 Immersive' : '进入 Immersive'}
            </button>
          ) : null}
          <span className="vc-hint">{msg ?? '改动实时生效 · 编辑官方主题自动生成 Custom Copy'}</span>
        </div>
      </aside>
    </>
  );
}
