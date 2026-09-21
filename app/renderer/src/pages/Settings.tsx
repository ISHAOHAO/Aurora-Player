import { useEffect, useRef, useState } from 'react';
import type { Settings, UpdateStatus } from '../bridge.d';
import { WindowControls, ResizeZones, dragHandler, useWindowDragRelease } from '../components/WindowChrome';
import { VisualSystem } from '../visual/controller';
import { applyThemePreference } from '../theme';

type Group = 'play' | 'video' | 'audio' | 'sub' | 'lib' | 'dlna' | 'ui' | 'about';

const GROUPS: [Group, string][] = [
  ['play', '播放'], ['video', '视频'], ['audio', '音频'], ['sub', '字幕'], ['lib', '媒体库'], ['dlna', 'DLNA'], ['ui', 'UI'], ['about', '关于'],
];

/** 一次性动作按钮：点击执行 → 短暂显示"已完成" */
function ActionButton({ label, doneLabel, confirmLabel, action }: {
  label: string;
  doneLabel: string;
  confirmLabel?: string;
  action: () => Promise<unknown>;
}) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState('');
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);
  return (
    <><button className="seg-action" disabled={done || busy}
      onClick={async () => {
        if (confirmLabel && !armed) {
          setArmed(true);
          if (confirmTimer.current) clearTimeout(confirmTimer.current);
          confirmTimer.current = setTimeout(() => setArmed(false), 4000);
          return;
        }
        setBusy(true); setError('');
        try { await action(); setDone(true); setArmed(false); setTimeout(() => setDone(false), 1500); }
        catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试'); }
        finally { setBusy(false); }
      }}>
      {done ? doneLabel : busy ? '处理中…' : armed ? confirmLabel : label}
    </button>{error && <span role="alert">{error}</span>}</>
  );
}

/** 关于 / 自动更新分组 */
function AboutGroup() {
  const [version, setVersion] = useState<string>('…');
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    window.aurora.getAppVersion().then(setVersion);
    let active = true;
    const accept = (next: UpdateStatus) => {
      if (active) setStatus(prev => (next.revision ?? 0) >= (prev.revision ?? 0) ? next : prev);
    };
    const off = window.aurora.onUpdateStatus(accept);
    window.aurora.getUpdateStatus().then(accept).catch(() => {});
    return () => { active = false; off(); };
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const r = await window.aurora.updateCheck();
      if (!r.ok) throw new Error(r.error || '检查失败');
    } catch (e) {
      setStatus(prev => ({ ...prev, state: 'error', message: e instanceof Error ? e.message : '检查失败' }));
      throw e;
    } finally { setChecking(false); }
  };

  const statusText: Record<string, string> = {
    idle: '未检查',
    unavailable: status.message || '当前环境不支持更新',
    checking: '正在检查更新…',
    available: `发现新版本 ${status.version ?? ''}`,
    latest: '已是最新版本',
    downloading: `正在下载更新 ${status.percent ?? 0}%`,
    downloaded: `新版本 ${status.version ?? ''} 已校验，点击安装更新`,
    error: `更新失败：${status.message ?? ''}`,
  };

  return (
    <>
      <div className="srow">
        <span>当前版本</span>
        <span className="val timecode">{version}</span>
      </div>
      <div className="srow">
        <span>更新状态</span>
        <span className="val">{statusText[status.state] ?? status.state}</span>
      </div>
      {status.state === 'downloading' && (
        <div className="srow">
          <span>下载进度</span>
          <div style={{ minWidth: 160, height: 6, background: 'rgba(255,255,255,.12)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${status.percent ?? 0}%`, height: '100%', background: '#4aa8ff' }} />
          </div>
        </div>
      )}
      <div className="srow">
        <span>检查更新</span>
        <ActionButton label="检查更新" doneLabel="已检查" action={check} />
        {checking && <span className="val">检查中…</span>}
      </div>
      {status.state === 'downloaded' && (
        <div className="srow">
          <span>安装更新</span>
          <button className="seg-action" onClick={async () => {
            try {
              const result = await window.aurora.updateInstallNow();
              if (!result.ok) throw new Error(result.error || '启动安装失败');
            } catch (e) {
              setStatus(prev => ({ ...prev, state: 'error', message: e instanceof Error ? e.message : '启动安装失败' }));
            }
          }}>退出并打开安装向导</button>
        </div>
      )}
      <div className="srow">
        <span className="val">未签名版本：更新后首次启动可能弹 SmartScreen「未知发布者」，点「仍要运行」即可继续。</span>
      </div>
    </>
  );
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [group, setGroup] = useState<Group>('play');
  const [shaderFiles, setShaderFiles] = useState<string[]>([]);
  const [shaderMsg, setShaderMsg] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const pendingPatch = useRef<Partial<Settings>>({});
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useWindowDragRelease();

  useEffect(() => {
    window.aurora.getSettings().then((st) => {
      setS(st);
      applyThemePreference(st.theme);
      if (st.shaderDir) window.aurora.shaderList().then(setShaderFiles);
    }).catch((e) => setSettingsError(e instanceof Error ? e.message : '设置加载失败'));
  }, []);

  const patch = async (p: Partial<Settings>) => {
    setSettingsError('');
    try {
      const next = await window.aurora.setSettings(p);
      setS(next);
      if ('theme' in p) applyThemePreference(next.theme);
      return next;
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : '设置保存失败，请重试');
      throw e;
    }
  };
  const commit = (p: Partial<Settings>) => { void patch(p).catch(() => {}); };
  const schedulePatch = (p: Partial<Settings>) => {
    setS((current) => current ? { ...current, ...p } : current);
    pendingPatch.current = { ...pendingPatch.current, ...p };
    if (patchTimer.current) clearTimeout(patchTimer.current);
    patchTimer.current = setTimeout(() => {
      const next = pendingPatch.current;
      pendingPatch.current = {};
      patchTimer.current = null;
      commit(next);
    }, 160);
  };
  useEffect(() => () => {
    if (patchTimer.current) clearTimeout(patchTimer.current);
    if (Object.keys(pendingPatch.current).length) void window.aurora.setSettings(pendingPatch.current).catch(() => {});
  }, []);

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
        <nav className="settings-nav" aria-label="设置分组">
          {GROUPS.map(([k, label]) => (
            <button key={k} className={group === k ? 'on' : ''} aria-current={group === k ? 'page' : undefined}
              onClick={() => setGroup(k)}>{label}</button>
          ))}
        </nav>
        <div className="settings-body">
        {settingsError && <div className="settings-error" role="alert">{settingsError}</div>}
        {group === 'play' && (
          <>
            <div className="srow">
              <span>记住播放进度</span>
              <button className={`switch${s.rememberPosition ? ' on' : ''}`} role="switch"
                aria-label="记住播放进度" aria-checked={s.rememberPosition}
                onClick={() => commit({ rememberPosition: !s.rememberPosition })} />
            </div>
            <div className="srow">
              <span>滚轮音量步进</span>
              <div className="seg">
                {[2, 5, 10].map((v) => (
                  <button key={v} className={s.volumeStep === v ? 'on' : ''} aria-pressed={s.volumeStep === v}
                    onClick={() => commit({ volumeStep: v })}>{v}%</button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>最近播放记录</span>
              <ActionButton label="清除记录" confirmLabel="再次点击确认" doneLabel="已清除" action={() => window.aurora.clearRecent()} />
            </div>
          </>
        )}
        {group === 'video' && (
          <>
            <div className="srow">
              <span>HDR 默认模式</span>
              <div className="seg">
                {[['auto', '自动'], ['passthrough', '直通'], ['tonemap', '色调映射']].map(([v, l]) => (
                  <button key={v} className={s.hdrMode === v ? 'on' : ''} aria-pressed={s.hdrMode === v}
                    onClick={() => commit({ hdrMode: v })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>默认色调映射算法</span>
              <div className="seg">
                {['spline', 'bt.2390', 'bt.2446a', 'hable', 'mobius', 'reinhard', 'clip'].map((a) => (
                  <button key={a} className={s.hdrAlgo === a ? 'on' : ''} aria-pressed={s.hdrAlgo === a}
                    onClick={() => commit({ hdrAlgo: a })}>{a}</button>
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
                    <button key={f} className={s.shaders.includes(f) ? 'on' : ''} aria-pressed={s.shaders.includes(f)}
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
                aria-label="默认音量" aria-valuetext={`${s.defaultVolume}%`}
                onChange={(e) => schedulePatch({ defaultVolume: +e.target.value })} />
            </div>
            <div className="srow">
              <span>增益<span className="val timecode"> {s.audioGain > 0 ? '+' : ''}{s.audioGain} dB</span></span>
              <input type="range" min={-60} max={30} value={s.audioGain}
                aria-label="音频增益" aria-valuetext={`${s.audioGain > 0 ? '+' : ''}${s.audioGain} dB`}
                onChange={(e) => schedulePatch({ audioGain: +e.target.value })} />
            </div>
            <div className="srow">
              <span>ReplayGain</span>
              <div className="seg">
                {[['off', '关闭'], ['track', '单曲'], ['album', '专辑']].map(([v, l]) => (
                  <button key={v} className={s.replayGain === v ? 'on' : ''} aria-pressed={s.replayGain === v}
                    onClick={() => commit({ replayGain: v as Settings['replayGain'] })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>动态归一化<small>（dynaudnorm）</small></span>
              <button className={`switch${s.audioNormalize ? ' on' : ''}`} role="switch"
                aria-label="动态归一化" aria-checked={s.audioNormalize}
                onClick={() => commit({ audioNormalize: !s.audioNormalize })} />
            </div>
            <div className="srow">
              <span>声道映射</span>
              <div className="seg">
                {[['auto-safe', '自动'], ['stereo', '立体声'], ['5.1', '5.1'], ['7.1', '7.1']].map(([v, l]) => (
                  <button key={v} className={s.audioChannels === v ? 'on' : ''} aria-pressed={s.audioChannels === v}
                    onClick={() => commit({ audioChannels: v })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="srow">
              <span>WASAPI 独占<small>（自动采样率切换，设备占用时回退）</small></span>
              <button className={`switch${s.audioExclusive ? ' on' : ''}`} role="switch"
                aria-label="WASAPI 独占" aria-checked={s.audioExclusive}
                onClick={() => commit({ audioExclusive: !s.audioExclusive })} />
            </div>
            <div className="srow">
              <span>Bitstream 透传<small>（SPDIF/HDMI）</small></span>
              <div className="seg">
                {[['none', '关闭'], ['ac3', 'AC-3'], ['eac3', 'E-AC-3'], ['dts', 'DTS'], ['dts-hd', 'DTS-HD'], ['true-hd', 'TrueHD']].map(([v, l]) => (
                  <button key={v} className={s.audioBitstream === v ? 'on' : ''} aria-pressed={s.audioBitstream === v}
                    onClick={() => commit({ audioBitstream: v })}>{l}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {group === 'sub' && (
          <div className="srow">
            <span>默认字幕字号<span className="val timecode"> {s.subFontSize}</span></span>
            <input type="range" min={20} max={56} step={2} value={s.subFontSize}
              aria-label="默认字幕字号" aria-valuetext={`${s.subFontSize}`}
              onChange={(e) => schedulePatch({ subFontSize: +e.target.value })} />
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
                <ActionButton label="移除" confirmLabel="确认移除" doneLabel="已移除"
                  action={() => patch({ libraryFolders: (s.libraryFolders || []).filter((x) => x !== f) })} />
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
              <ActionButton label="清空" confirmLabel="再次点击确认" doneLabel="已清空" action={() => window.aurora.clearLibrary()} />
            </div>
          </>
        )}
        {group === 'dlna' && (
          <>
            <div className="srow">
              <span>启用 DLNA 投屏接收</span>
              <button className={`switch${s.dlnaEnabled ? ' on' : ''}`} role="switch"
                aria-label="启用 DLNA 投屏接收" aria-checked={s.dlnaEnabled}
                onClick={() => commit({ dlnaEnabled: !s.dlnaEnabled })} />
            </div>
            <div className="srow">
              <span>设备名称</span>
              <input className="text" value={s.dlnaFriendlyName} aria-label="DLNA 设备名称"
                onChange={(e) => setS({ ...s, dlnaFriendlyName: e.target.value })}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value) commit({ dlnaFriendlyName: value });
                  else { setS({ ...s, dlnaFriendlyName: 'Aurora Player' }); commit({ dlnaFriendlyName: 'Aurora Player' }); }
                }} />
            </div>
            <div className="srow">
              <span>后台接收投屏<small>（关闭主窗口后驻留托盘，可被投屏唤起）</small></span>
              <button className={`switch${s.bgCasting ? ' on' : ''}`} role="switch"
                aria-label="后台接收投屏" aria-checked={s.bgCasting}
                onClick={() => commit({ bgCasting: !s.bgCasting })} />
            </div>
            <div className="srow">
              <span>投屏控制权<small>（投屏期间本地操作限制，规格 §8）</small></span>
              <div className="seg">
                {[['none', '不锁定'], ['takeover', '投屏接管'], ['full', '完全锁定']].map(([v, l]) => (
                  <button key={v} className={s.lockPolicy === v ? 'on' : ''} aria-pressed={s.lockPolicy === v}
                    onClick={() => commit({ lockPolicy: v as Settings['lockPolicy'] })}>{l}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {group === 'ui' && (
          <>
            <div className="srow">
              <span>主题<small>（Aqua · 基础明暗）</small></span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="seg">
                  {[['auto', '跟随系统'], ['light', '浅色'], ['dark', '暗色']].map(([v, l]) => (
                    <button key={v} className={s.theme === v ? 'on' : ''} aria-pressed={s.theme === v}
                      onClick={() => commit({ theme: v as Settings['theme'] })}>{l}</button>
                  ))}
                </div>
                <button className="seg-action" onClick={() => VisualSystem.setConsoleOpen(true)}>打开 Visual Console</button>
              </div>
            </div>
          </>
        )}
        {group === 'about' && (
          <AboutGroup />
        )}
        </div>
      </div>
    </div>
  );
}
