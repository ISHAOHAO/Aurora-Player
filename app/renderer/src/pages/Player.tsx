import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerMeta, PlayerStatus, Track } from '../bridge.d';

const IDLE_MS = 3000; // 规范 §3.2：静止 3 秒隐藏控制层

function fmt(t: number | null): string {
  if (t == null || isNaN(t)) return '--:--';
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function trackLabel(t: Track): string {
  const parts = [t.lang?.toUpperCase(), t.title, t.codec?.toUpperCase()].filter(Boolean);
  return parts.length ? parts.join(' · ') : `#${t.id}`;
}

/* ================= 轨道菜单 ================= */
function TrackMenu({ title, tracks, onPick, onClose, allowOff }: {
  title: string; tracks: Track[]; allowOff?: boolean;
  onPick: (id: number | 'no') => void; onClose: () => void;
}) {
  return (
    <div className="pop-menu glass-2" onClick={(e) => e.stopPropagation()}>
      <div className="head">{title}</div>
      {allowOff && (
        <button className={`mi${tracks.every((t) => !t.selected) ? ' on' : ''}`} onClick={() => { onPick('no'); onClose(); }}>
          关闭
        </button>
      )}
      {tracks.map((t) => (
        <button key={t.id} className={`mi${t.selected ? ' on' : ''}`} onClick={() => { onPick(t.id); onClose(); }}>
          {trackLabel(t)}
          {t.default && <span className="tag">默认</span>}
        </button>
      ))}
      {tracks.length === 0 && <div className="head">无可用轨道</div>}
    </div>
  );
}

/* ================= 控制台抽屉（规范 §3.3 子集） ================= */
type Tab = 'basic' | 'video' | 'audio' | 'sub';

const HDR_MODE_LABEL = { passthrough: '直通', tonemap: '色调映射', sdr: '原生 SDR' } as const;
const TONE_ALGOS = ['spline', 'bt.2390', 'bt.2446a', 'hable', 'mobius', 'reinhard', 'clip'];

function ConsoleDrawer({ meta, onLocalMeta, onClose }: {
  meta: PlayerMeta | null;
  onLocalMeta: (m: PlayerMeta) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('basic');
  const [speed, setSpeed] = useState(1);
  const [subDelay, setSubDelay] = useState(0);
  const [audioDelay, setAudioDelay] = useState(0);
  const [subSize, setSubSize] = useState(34);

  useEffect(() => {
    (async () => {
      const [sp, sd, ad, ss] = await Promise.all([
        window.aurora.mpv('get_property', 'speed'),
        window.aurora.mpv('get_property', 'sub-delay'),
        window.aurora.mpv('get_property', 'audio-delay'),
        window.aurora.mpv('get_property', 'sub-font-size'),
      ]);
      if (typeof sp === 'number') setSpeed(sp);
      if (typeof sd === 'number') setSubDelay(sd);
      if (typeof ad === 'number') setAudioDelay(ad);
      if (typeof ss === 'number') setSubSize(ss);
    })();
  }, []);

  const set = (prop: string, v: unknown) => window.aurora.mpv('set_property', prop, v);
  const pickTrack = (type: 'audio' | 'sub', id: number | 'no') => {
    set(type === 'audio' ? 'aid' : 'sid', id);
    if (!meta) return;
    onLocalMeta({
      ...meta,
      tracks: meta.tracks.map((t) => t.type === type ? { ...t, selected: t.id === id } : t),
    });
  };

  const audioTracks = meta?.tracks.filter((t) => t.type === 'audio') ?? [];
  const subTracks = meta?.tracks.filter((t) => t.type === 'sub') ?? [];

  return (
    <div className="console-drawer glass-2" onClick={(e) => e.stopPropagation()}>
      <div className="tabs">
        <button className={tab === 'basic' ? 'on' : ''} onClick={() => setTab('basic')}>基础</button>
        <button className={tab === 'video' ? 'on' : ''} onClick={() => setTab('video')}>视频</button>
        <button className={tab === 'audio' ? 'on' : ''} onClick={() => setTab('audio')}>音频</button>
        <button className={tab === 'sub' ? 'on' : ''} onClick={() => setTab('sub')}>字幕</button>
        <button disabled title="M5+">高级</button>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} title="关闭">✕</button>
      </div>
      <div className="body">
        {tab === 'basic' && (
          <>
            <div className="row">
              <label>播放速度<span className="val timecode">{speed.toFixed(2)}x</span></label>
              <div className="seg">
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((v) => (
                  <button key={v} className={Math.abs(speed - v) < 0.01 ? 'on' : ''}
                    onClick={() => { setSpeed(v); set('speed', v); }}>{v}x</button>
                ))}
              </div>
            </div>
            <div className="row">
              <label>画面比例</label>
              <div className="seg">
                {[['-1', '原始'], ['16:9', '16:9'], ['4:3', '4:3'], ['2.35:1', '2.35:1']].map(([v, l]) => (
                  <button key={v} onClick={() => set('video-aspect-override', v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="row">
              <label>A-B 循环</label>
              <div className="seg">
                <button onClick={() => window.aurora.mpv('ab-loop-a')}>设置 A 点</button>
                <button onClick={() => window.aurora.mpv('ab-loop-b')}>设置 B 点</button>
                <button onClick={() => { window.aurora.mpv('ab-loop-clear'); }}>清除</button>
              </div>
            </div>
          </>
        )}
        {tab === 'video' && (
          <>
            <div className="row">
              <label>片源检测</label>
              <div className="info-grid">
                <span>格式</span><span>{meta?.hdr?.videoHdr ? `${meta.hdr.kind === 'HLG' ? 'HLG' : 'HDR10/PQ'} · ${meta.hdr.primaries || '?'} · 峰值 ${meta.hdr.sigPeak ?? '?'}x` : 'SDR'}</span>
                <span>显示器</span><span>{meta?.hdr?.displayHdr ? `HDR 开启（${Math.round(meta.hdr.displayPeak || 0)} nits）` : 'SDR / 系统 HDR 关'}</span>
                <span>决策</span><span>{meta?.hdr ? HDR_MODE_LABEL[meta.hdr.mode] : '—'}</span>
                <span>原因</span><span className="reason">{meta?.hdr?.reason || '—'}</span>
              </div>
            </div>
            <div className="row">
              <label>HDR 模式{meta?.hdr?.override !== 'auto' && <span className="val">（已覆盖）</span>}
                {!meta?.hdr?.videoHdr && <span className="val">（仅 HDR 片源可切换）</span>}
              </label>
              <div className="seg">
                {[['auto', '自动'], ['passthrough', '直通'], ['tonemap', '色调映射']].map(([v, l]) => (
                  <button key={v} className={(meta?.hdr?.override || 'auto') === v ? 'on' : ''}
                    disabled={!meta?.hdr?.videoHdr && v !== 'auto'}
                    title={!meta?.hdr?.videoHdr && v !== 'auto' ? '当前片源是 SDR，仅 HDR 片源可切换' : undefined}
                    onClick={() => window.aurora.setHdrOverride({ mode: v, algo: meta?.hdr?.algo })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="row">
              <label>色调映射算法<span className="val">{meta?.hdr?.algo}</span></label>
              <div className="seg">
                {TONE_ALGOS.map((a) => (
                  <button key={a} className={meta?.hdr?.algo === a ? 'on' : ''}
                    onClick={() => window.aurora.setHdrOverride({ mode: meta?.hdr?.override || 'auto', algo: a })}>{a}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {tab === 'audio' && (
          <>
            <div className="row">
              <label>音轨</label>
              <div className="seg">
                {audioTracks.map((t) => (
                  <button key={t.id} className={t.selected ? 'on' : ''} onClick={() => pickTrack('audio', t.id)}>
                    {trackLabel(t)}
                  </button>
                ))}
                {audioTracks.length === 0 && <span className="val">无</span>}
              </div>
            </div>
            <div className="row">
              <label>音频延迟<span className="val timecode">{audioDelay.toFixed(1)}s</span></label>
              <div className="stepper">
                <button onClick={() => { const v = +(audioDelay - 0.1).toFixed(1); setAudioDelay(v); set('audio-delay', v); }}>−</button>
                <span className="v timecode">{audioDelay.toFixed(1)}s</span>
                <button onClick={() => { const v = +(audioDelay + 0.1).toFixed(1); setAudioDelay(v); set('audio-delay', v); }}>+</button>
              </div>
            </div>
          </>
        )}
        {tab === 'sub' && (
          <>
            <div className="row">
              <label>字幕轨</label>
              <div className="seg">
                <button className={subTracks.every((t) => !t.selected) ? 'on' : ''} onClick={() => pickTrack('sub', 'no')}>关闭</button>
                {subTracks.map((t) => (
                  <button key={t.id} className={t.selected ? 'on' : ''} onClick={() => pickTrack('sub', t.id)}>
                    {trackLabel(t)}
                  </button>
                ))}
                {subTracks.length === 0 && <span className="val">无内嵌字幕</span>}
              </div>
            </div>
            <div className="row">
              <label>字幕延迟<span className="val timecode">{subDelay.toFixed(1)}s</span></label>
              <div className="stepper">
                <button onClick={() => { const v = +(subDelay - 0.1).toFixed(1); setSubDelay(v); set('sub-delay', v); }}>−</button>
                <span className="v timecode">{subDelay.toFixed(1)}s</span>
                <button onClick={() => { const v = +(subDelay + 0.1).toFixed(1); setSubDelay(v); set('sub-delay', v); }}>+</button>
              </div>
            </div>
            <div className="row">
              <label>字号<span className="val timecode">{subSize}</span></label>
              <div className="stepper">
                <button onClick={() => { const v = Math.max(16, subSize - 2); setSubSize(v); set('sub-font-size', v); }}>−</button>
                <span className="v timecode">{subSize}</span>
                <button onClick={() => { const v = Math.min(64, subSize + 2); setSubSize(v); set('sub-font-size', v); }}>+</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ================= 播放页 ================= */
export default function Player() {
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [meta, setMeta] = useState<PlayerMeta | null>(null);
  const [idle, setIdle] = useState(false);
  const [menu, setMenu] = useState<'sub' | 'audio' | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [bubble, setBubble] = useState<{ x: number; t: number; ch: string | null } | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => window.aurora.onStatus(setStatus), []);
  useEffect(() => window.aurora.onMeta(setMeta), []);

  /* ----- 自动隐藏（播放中 3s 无操作；暂停/菜单/抽屉打开时常驻） ----- */
  const paused = status?.pause ?? true;
  const pinned = paused || menu !== null || drawer || ctxMenu !== null;

  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(() => {
    wake();
    const onMove = () => wake();
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [wake]);

  useEffect(() => { if (pinned) wake(); }, [pinned, wake]);

  /* ----- 键盘转发 ----- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ': e.preventDefault(); window.aurora.mpv('cycle', 'pause'); break;
        case 'ArrowRight': window.aurora.mpv('seek', 5); break;
        case 'ArrowLeft': window.aurora.mpv('seek', -5); break;
        case 'ArrowUp': e.preventDefault(); window.aurora.mpv('add', 'volume', 5); break;
        case 'ArrowDown': e.preventDefault(); window.aurora.mpv('add', 'volume', -5); break;
        case 'm': case 'M': window.aurora.mpv('cycle', 'mute'); break;
        case 'f': case 'F': window.aurora.toggleFullscreen(); break;
        case 'Escape': setMenu(null); setDrawer(false); setCtxMenu(null); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ----- 单击暂停 / 双击全屏（e.detail 去抖） ----- */
  const onVideoClick = (e: React.MouseEvent) => {
    setCtxMenu(null);
    setMenu(null);
    if (e.detail === 1) {
      clickTimer.current = setTimeout(() => window.aurora.mpv('cycle', 'pause'), 240);
    } else if (e.detail === 2) {
      if (clickTimer.current) clearTimeout(clickTimer.current);
      window.aurora.toggleFullscreen();
    }
  };

  /* ----- 进度条 ----- */
  const dur = status?.duration ?? 0;
  const seekFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    window.aurora.mpv('seek', frac * 100, 'absolute-percent');
  };
  const onSeekHover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dur <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = frac * dur;
    const ch = meta?.chapters.filter((c) => c.time <= t).pop()?.title ?? null;
    setBubble({ x: e.clientX - rect.left, t, ch });
  };

  const pos = status?.timePos ?? 0;
  const pct = dur > 0 ? (pos / dur) * 100 : 0;
  // 视频就绪（拿到首个有效状态）后才透出下层 mpv 画面，否则保持黑场
  const ready = !!status && !status.idle && status.title != null;

  const audioTracks = meta?.tracks.filter((t) => t.type === 'audio') ?? [];
  const subTracks = meta?.tracks.filter((t) => t.type === 'sub') ?? [];

  const pickTrack = (type: 'audio' | 'sub', id: number | 'no') => {
    window.aurora.mpv('set_property', type === 'audio' ? 'aid' : 'sid', id);
    if (meta) {
      setMeta({ ...meta, tracks: meta.tracks.map((t) => t.type === type ? { ...t, selected: t.id === id } : t) });
    }
  };

  /* ----- 手动拖拽窗口（透明窗 app-region 失效的替代） ----- */
  useEffect(() => {
    const up = () => window.aurora.dragEnd();
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  const onDragMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    window.aurora.dragStart();
  };

  return (
    <div
      className={`overlay${ready ? ' ready' : ''}${idle && !pinned ? ' idle' : ''}`}
      onClick={onVideoClick}
      onWheel={(e) => window.aurora.mpv('add', 'volume', e.deltaY < 0 ? 2 : -2)}
      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
    >
      {/* 顶部拖拽条：拖动移窗，双击全屏；阻断单击穿透到播放暂停 */}
      <div className="drag-strip"
        onMouseDown={onDragMouseDown}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => { e.stopPropagation(); window.aurora.toggleFullscreen(); }}
      />

      {/* 顶部信息条 */}
      <div className="top-info" onMouseDown={onDragMouseDown} onClick={(e) => e.stopPropagation()}>
        {status?.casting && (
          <div className="casting-badge glass-1">
            <div className="live" />
            CASTING · {status.casting.cp}
          </div>
        )}
        <div className="title">{status?.title || '加载中…'}</div>
        {meta?.hdr?.videoHdr && (
          <span className="hdr-tag">
            {meta.hdr.kind === 'HLG' ? 'HLG' : 'HDR10'}{meta.hdr.mode === 'passthrough' ? ' · 直通' : meta.hdr.mode === 'tonemap' ? ' · 映射' : ''}
          </span>
        )}
        <div className="spacer" />
        <button className="icon-btn" title="关闭并返回首页" onClick={(e) => { e.stopPropagation(); window.aurora.stop(); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* 底部控制层 */}
      <div className="control-deck glass-1" onClick={(e) => e.stopPropagation()}>
        <div className="seek-zone" onPointerLeave={() => setBubble(null)}>
          {bubble && dur > 0 && (
            <div className="seek-bubble glass-2" style={{ left: bubble.x }}>
              <span className="timecode">{fmt(bubble.t)}</span>
              {bubble.ch && <span className="ch">{bubble.ch}</span>}
            </div>
          )}
          <div className="seekbar" onPointerDown={seekFromEvent} onPointerMove={onSeekHover}>
            <div className="played" style={{ width: `${pct}%` }} />
            {dur > 0 && meta?.chapters.map((c, i) => (
              <div key={i} className="chapter-dot" style={{ left: `${(c.time / dur) * 100}%` }} />
            ))}
            <div className="knob" style={{ left: `${pct}%` }} />
          </div>
        </div>

        <div className="controls-row">
          <button className="primary-btn" title="播放/暂停 (空格)" onClick={() => window.aurora.mpv('cycle', 'pause')}>
            {paused ? (
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.03 1.03 0 0 0 0-1.76l-11-6.86A1.03 1.03 0 0 0 8 5.14z"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>
            )}
          </button>

          <div className="time timecode"><b>{fmt(pos)}</b> / {fmt(dur)}</div>

          <div className="volume">
            <button className="icon-btn" title="静音 (M)" onClick={() => window.aurora.mpv('cycle', 'mute')}>
              {status?.mute || status?.volume === 0 ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M22 9l-6 6M16 9l6 6"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8"/></svg>
              )}
            </button>
            <div className="vol-track" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              window.aurora.mpv('set_property', 'volume', Math.round(frac * 100));
            }}>
              <i style={{ width: `${status?.mute ? 0 : (status?.volume ?? 0)}%` }} />
            </div>
          </div>

          <div className="right">
            <button className="icon-btn" title="字幕轨" onClick={() => setMenu(menu === 'sub' ? null : 'sub')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 14h4M12 14h6M6 17h2M10 17h4"/></svg>
            </button>
            <button className="icon-btn" title="音轨" onClick={() => setMenu(menu === 'audio' ? null : 'audio')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18V6l12-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="18.5" cy="15" r="2.5"/></svg>
            </button>
            <button className="icon-btn" title="控制台" onClick={() => setDrawer(!drawer)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2.2"/><circle cx="8" cy="16" r="2.2"/></svg>
            </button>
            <button className="icon-btn" title="全屏 (F)" onClick={() => window.aurora.toggleFullscreen()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* 轨道菜单 */}
      {menu === 'sub' && <TrackMenu title="字幕轨" tracks={subTracks} allowOff onPick={(id) => pickTrack('sub', id)} onClose={() => setMenu(null)} />}
      {menu === 'audio' && <TrackMenu title="音轨" tracks={audioTracks} onPick={(id) => pickTrack('audio', id)} onClose={() => setMenu(null)} />}

      {/* 控制台抽屉 */}
      {drawer && <ConsoleDrawer meta={meta} onLocalMeta={setMeta} onClose={() => setDrawer(false)} />}

      {/* 右键菜单 */}
      {ctxMenu && (
        <div className="pop-menu glass-2" style={{ left: ctxMenu.x, top: ctxMenu.y, bottom: 'auto', right: 'auto', position: 'fixed' }}
          onClick={(e) => e.stopPropagation()}>
          <button className="mi" onClick={() => { window.aurora.mpv('cycle', 'pause'); setCtxMenu(null); }}>{paused ? '播放' : '暂停'}</button>
          <button className="mi" onClick={() => { window.aurora.toggleFullscreen(); setCtxMenu(null); }}>全屏</button>
          <div className="sep" />
          <button className="mi" onClick={() => { window.aurora.openFile(); setCtxMenu(null); }}>打开文件…</button>
          <button className="mi" onClick={() => { window.aurora.stop(); setCtxMenu(null); }}>停止并返回首页</button>
        </div>
      )}
    </div>
  );
}
