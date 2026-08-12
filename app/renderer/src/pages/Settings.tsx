import { useEffect, useState } from 'react';
import type { Settings } from '../bridge.d';

type Group = 'play' | 'video' | 'audio' | 'sub' | 'dlna' | 'ui';

const GROUPS: [Group, string][] = [
  ['play', '播放'], ['video', '视频'], ['audio', '音频'], ['sub', '字幕'], ['dlna', 'DLNA'], ['ui', 'UI'],
];

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

  useEffect(() => { window.aurora.getSettings().then(setS); }, []);

  const patch = async (p: Partial<Settings>) => {
    const next = await window.aurora.setSettings(p);
    setS(next);
    if ('theme' in p) applyTheme(next.theme);
  };

  if (!s) return <div className="settings-page"><div className="settings-body">加载中…</div></div>;

  return (
    <div className="settings-page">
      <div className="ambient-stage"><div className="particles" /></div>
      <nav className="settings-nav">
        <button className="back" onClick={() => { location.hash = '#/home'; location.reload(); }}>← 返回</button>
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
          </>
        )}
        {group === 'audio' && (
          <div className="srow">
            <span>默认音量<span className="val timecode"> {s.defaultVolume}%</span></span>
            <input type="range" min={30} max={100} value={s.defaultVolume}
              onChange={(e) => patch({ defaultVolume: +e.target.value })} />
          </div>
        )}
        {group === 'sub' && (
          <div className="srow">
            <span>默认字幕字号<span className="val timecode"> {s.subFontSize}</span></span>
            <input type="range" min={20} max={56} step={2} value={s.subFontSize}
              onChange={(e) => patch({ subFontSize: +e.target.value })} />
          </div>
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
          </>
        )}
        {group === 'ui' && (
          <div className="srow">
            <span>主题</span>
            <div className="seg">
              {[['auto', '跟随系统'], ['light', '浅色'], ['dark', '暗色']].map(([v, l]) => (
                <button key={v} className={s.theme === v ? 'on' : ''} onClick={() => patch({ theme: v as Settings['theme'] })}>{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
