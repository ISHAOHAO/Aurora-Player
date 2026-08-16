import { useEffect, useState } from 'react';
import type { Settings } from '../bridge.d';
import { WindowControls, ResizeZones, dragHandler, useWindowDragRelease } from '../components/WindowChrome';
import { VisualStore } from '../visual/store';
import { VisualSystem } from '../visual/controller';
import { useActiveTheme } from '../visual/useVisual';

type Group = 'play' | 'video' | 'audio' | 'sub' | 'lib' | 'dlna' | 'ui';

const GROUPS: [Group, string][] = [
  ['play', '播放'], ['video', '视频'], ['audio', '音频'], ['sub', '字幕'], ['lib', '媒体库'], ['dlna', 'DLNA'], ['ui', 'UI'],
];

/** 一次性动作按钮：点击执行 → 短暂显示"已完成" */
function ActionButton({ label, doneLabel, action }: { label: string; doneLabel: string; action: () => Promise<unknown> }) {
  const [done, setDone] = useState(false);
  return (
    <button className="seg-action" disabled={done}
      onClick={async () => { await action(); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? doneLabel : label}
    </button>
  );
}

function applyTheme(theme: Settings['theme']) {
  if (theme === 'auto') {
    localStorage.removeItem('aurora-theme');
    document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } else {
    localStorage.setItem('aurora-theme', theme);
    document.documentElement.dataset.theme = theme;
  }
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [group, setGroup] = useState<Group>('play');
  const [shaderFiles, setShaderFiles] = useState<string[]>([]);
  const [shaderMsg, setShaderMsg] = useState<string | null>(null);
  // 视觉主题选择以 VisualStore 为唯一 runtime source（订阅驱动，切换即同步高亮）
  const activeTheme = useActiveTheme();

  useWindowDragRelease();

  useEffect(() => {
    window.aurora.getSettings().then((st) => {
      setS(st);
      if (st.shaderDir) window.aurora.shaderList().then(setShaderFiles);
    });
  }, []);

  const patch = async (p: Partial<Settings>) => {
    const next = await window.aurora.setSettings(p);
    setS(next);
    if ('theme' in p) applyTheme(next.theme);
  };

  if (!s) return <div className="settings-page"><div className="settings-body">加载中…</div></div>;

  return (
    <div className="settings-page">
      <ResizeZones />
      <header className="settings-topbar" onMouseDown={dragHandler()}>
        <button className="back" onClick={() => { location.hash = '#/home'; }}>← 返回</button>
        <div className="spacer" />
        <WindowControls />
      </header>
      <div className="settings-main">
        <nav className="settings-nav">
          {GROUPS.map(([k, label]) => (
            <button key={k} className={group === k ? 'on' : ''} onClick={() => setGroup(k)}>{label}</button>
          ))}
        </nav>
        <div className="settings-body">
        {group === 'play' && (
          <>
            <div className="srow">
              <span>记住播放进度</span>
              <button className={`switch${s.rememberPosition ? ' on' : ''}`} onClick={() => patch({ rememberPosition: !s.rememberPosition })} />
            </div>
            <div className="srow">
              <span>滚轮音量步进</span>
              <div className="seg">
                {[2, 5, 10].map((v) => (
                  <button key={v} className={s.volumeStep === v ? 'on' : ''} onClick={() => patch({ volumeStep: v })}>{v}%</button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>最近播放记录</span>
              <ActionButton label="清除记录" doneLabel="已清除" action={() => window.aurora.clearRecent()} />
            </div>
          </>
        )}
        {group === 'video' && (
          <>
            <div className="srow">
              <span>HDR 默认模式</span>
              <div className="seg">
                {[['auto', '自动'], ['passthrough', '直通'], ['tonemap', '色调映射']].map(([v, l]) => (
                  <button key={v} className={s.hdrMode === v ? 'on' : ''} onClick={() => patch({ hdrMode: v })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>默认色调映射算法</span>
              <div className="seg">
                {['spline', 'bt.2390', 'bt.2446a', 'hable', 'mobius', 'reinhard', 'clip'].map((a) => (
                  <button key={a} className={s.hdrAlgo === a ? 'on' : ''} onClick={() => patch({ hdrAlgo: a })}>{a}</button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>用户 Shader<small>（.glsl/.hook，静态校验禁 IO）</small></span>
              <button className="seg-action" onClick={async () => {
                const r = await window.aurora.shaderSetDir();
                if (r && 'error' in r) { setShaderMsg(r.error); return; }
                if (r && 'dir' in r) { setS((p) => ({ ...p!, shaderDir: r.dir, shaders: [] })); setShaderMsg(`发现 ${r.files.length} 个 Shader`); setShaderFiles(r.files); }
              }}>{s.shaderDir ? '更换目录…' : '选择目录…'}</button>
            </div>
            {s.shaderDir && (
              <div className="srow">
                <span>已启用 Shader<small>{s.shaders.length} / {shaderFiles.length || '?'}</small></span>
                <div className="seg">
                  {(shaderFiles.length ? shaderFiles : s.shaders).map((f) => (
                    <button key={f} className={s.shaders.includes(f) ? 'on' : ''}
                      onClick={async () => {
                        const next = s.shaders.includes(f) ? s.shaders.filter((x) => x !== f) : [...s.shaders, f];
                        const r = await window.aurora.shaderApply(next);
                        setS(await window.aurora.getSettings());
                        if (r && !r.ok) setShaderMsg(`已拦截：${r.bad.map((b) => `${b.file}(${b.forbidden.join(',')})`).join('; ')}`);
                        else setShaderMsg(null);
                      }}>{f}</button>
                  ))}
                </div>
              </div>
            )}
            {shaderMsg && <div className="srow"><span className="val">{shaderMsg}</span></div>}
          </>
        )}
        {group === 'audio' && (
          <>
            <div className="srow">
              <span>默认音量<span className="val timecode"> {s.defaultVolume}%</span></span>
              <input type="range" min={30} max={100} value={s.defaultVolume}
                onChange={(e) => patch({ defaultVolume: +e.target.value })} />
            </div>
            <div className="srow">
              <span>增益<span className="val timecode"> {s.audioGain > 0 ? '+' : ''}{s.audioGain} dB</span></span>
              <input type="range" min={-60} max={30} value={s.audioGain}
                onChange={(e) => patch({ audioGain: +e.target.value })} />
            </div>
            <div className="srow">
              <span>ReplayGain</span>
              <div className="seg">
                {[['off', '关闭'], ['track', '单曲'], ['album', '专辑']].map(([v, l]) => (
                  <button key={v} className={s.replayGain === v ? 'on' : ''} onClick={() => patch({ replayGain: v as Settings['replayGain'] })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>动态归一化<small>（dynaudnorm）</small></span>
              <button className={`switch${s.audioNormalize ? ' on' : ''}`} onClick={() => patch({ audioNormalize: !s.audioNormalize })} />
            </div>
            <div className="srow">
              <span>声道映射</span>
              <div className="seg">
                {[['auto-safe', '自动'], ['stereo', '立体声'], ['5.1', '5.1'], ['7.1', '7.1']].map(([v, l]) => (
                  <button key={v} className={s.audioChannels === v ? 'on' : ''} onClick={() => patch({ audioChannels: v })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>WASAPI 独占<small>（自动采样率切换，设备占用时回退）</small></span>
              <button className={`switch${s.audioExclusive ? ' on' : ''}`} onClick={() => patch({ audioExclusive: !s.audioExclusive })} />
            </div>
            <div className="srow">
              <span>Bitstream 透传<small>（SPDIF/HDMI）</small></span>
              <div className="seg">
                {[['none', '关闭'], ['ac3', 'AC-3'], ['eac3', 'E-AC-3'], ['dts', 'DTS'], ['dts-hd', 'DTS-HD'], ['true-hd', 'TrueHD']].map(([v, l]) => (
                  <button key={v} className={s.audioBitstream === v ? 'on' : ''} onClick={() => patch({ audioBitstream: v })}>{l}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {group === 'sub' && (
          <div className="srow">
            <span>默认字幕字号<span className="val timecode"> {s.subFontSize}</span></span>
            <input type="range" min={20} max={56} step={2} value={s.subFontSize}
              onChange={(e) => patch({ subFontSize: +e.target.value })} />
          </div>
        )}
        {group === 'lib' && (
          <>
            {(s.libraryFolders || []).length === 0 && (
              <div className="srow"><span className="val">还没有媒体库文件夹</span></div>
            )}
            {(s.libraryFolders || []).map((f) => (
              <div className="srow" key={f}>
                <span className="folder-path" title={f}>{f}</span>
                <button className="seg-action" onClick={() => patch({ libraryFolders: (s.libraryFolders || []).filter((x) => x !== f) })}>移除</button>
              </div>
            ))}
            <div className="srow">
              <span>添加文件夹<small>（本地或 \\服务器\共享 均可）</small></span>
              <button className="seg-action" onClick={async () => { await window.aurora.addLibraryFolder(); setS(await window.aurora.getSettings()); }}>选择文件夹…</button>
            </div>
            <div className="srow">
              <span>重新扫描</span>
              <ActionButton label="立即扫描" doneLabel="已触发" action={() => window.aurora.rescanLibrary()} />
            </div>
            <div className="srow">
              <span>清空媒体库<small>（清除已刮削条目，保留文件夹配置）</small></span>
              <ActionButton label="清空" doneLabel="已清空" action={() => window.aurora.clearLibrary()} />
            </div>
          </>
        )}
        {group === 'dlna' && (
          <>
            <div className="srow">
              <span>启用 DLNA 投屏接收</span>
              <button className={`switch${s.dlnaEnabled ? ' on' : ''}`} onClick={() => patch({ dlnaEnabled: !s.dlnaEnabled })} />
            </div>
            <div className="srow">
              <span>设备名称</span>
              <input className="text" defaultValue={s.dlnaFriendlyName}
                onBlur={(e) => e.target.value.trim() && patch({ dlnaFriendlyName: e.target.value.trim() })} />
            </div>
            <div className="srow">
              <span>后台接收投屏<small>（关闭主窗口后驻留托盘，可被投屏唤起）</small></span>
              <button className={`switch${s.bgCasting ? ' on' : ''}`} onClick={() => patch({ bgCasting: !s.bgCasting })} />
            </div>
            <div className="srow">
              <span>投屏控制权<small>（投屏期间本地操作限制，规格 §8）</small></span>
              <div className="seg">
                {[['none', '不锁定'], ['takeover', '投屏接管'], ['full', '完全锁定']].map(([v, l]) => (
                  <button key={v} className={s.lockPolicy === v ? 'on' : ''} onClick={() => patch({ lockPolicy: v as Settings['lockPolicy'] })}>{l}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {group === 'ui' && (
          <>
            <div className="srow">
              <span>当前主题<small>（Visual System）</small></span>
              <div className="seg">
                {VisualStore.listPresets().map((t) => (
                  <button key={t.id} className={activeTheme.activeThemeId === t.id ? 'on' : ''}
                    onClick={() => VisualStore.apply(t.id)}>{t.name}</button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>详细参数</span>
              <button className="seg-action" onClick={() => VisualSystem.setConsoleOpen(true)}>打开 Visual Console</button>
            </div>
            <div className="srow">
              <span>主题<small>（基础明暗）</small></span>
              <div className="seg">
                {[['auto', '跟随系统'], ['light', '浅色'], ['dark', '暗色']].map(([v, l]) => (
                  <button key={v} className={s.theme === v ? 'on' : ''} onClick={() => patch({ theme: v as Settings['theme'] })}>{l}</button>
                ))}
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
