import { useEffect, useState } from 'react';
import type { DlnaState, LibraryItem, NasEntry, RecentItem } from '../bridge.d';
import { WindowControls, ResizeZones, dragHandler, useWindowDragRelease } from '../components/WindowChrome';
import { PlaybackProbe } from '../visual/playback';

/** 媒体库筛选（D27）：电影=无剧集号，剧集=有 episode；动漫/纪录片需刮削元数据，暂并入 */
type LibFilter = 'all' | 'movie' | 'tv';

function matchFilter(it: LibraryItem, f: LibFilter): boolean {
  if (f === 'all') return true;
  return f === 'movie' ? it.episode == null : it.episode != null;
}

/** 悬停规格标签（D27）：分辨率/HDR/ASS，纯文本 · 分隔（规范 v1.1：禁胶囊） */
function specLabel(it: LibraryItem): string {
  const s = it.specs;
  if (!s) return '';
  return [s.res, s.hdr, s.sub].filter(Boolean).join(' · ');
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('aurora-theme', next);
}

function fmtRemain(it: RecentItem): string {
  if (it.position == null || !it.duration) return '';
  const pct = Math.round((it.position / it.duration) * 100);
  const remain = Math.max(0, Math.round((it.duration - it.position) / 60));
  return `已看 ${pct}% · 剩余 ${remain} 分钟`;
}

export default function Home() {
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [dlna, setDlna] = useState<DlnaState | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [urlModal, setUrlModal] = useState(false);
  const [url, setUrl] = useState('');
  const [nasModal, setNasModal] = useState(false);
  const [nasInput, setNasInput] = useState('');
  const [nasPath, setNasPath] = useState('');   // 当前浏览目录，'' = 地址输入模式
  const [nasEntries, setNasEntries] = useState<NasEntry[] | null>(null);
  const [nasMsg, setNasMsg] = useState<{ text: string; unc?: string; needAuth?: boolean; ok?: boolean } | null>(null);
  const [libFilter, setLibFilter] = useState<LibFilter>('all');
  const [query, setQuery] = useState('');

  useWindowDragRelease();

  useEffect(() => {
    window.aurora.getRecent().then(setRecent);
    window.aurora.getDlnaState().then(setDlna);
    window.aurora.getLibrary().then(setLibrary);
    return window.aurora.onLibraryUpdated(setLibrary);
  }, []);

  // 视觉系统：把当前海报作为 cover palette 光源（Home 无播放帧）
  useEffect(() => {
    const p = library.find((it) => it.poster)?.poster;
    if (p) PlaybackProbe.update({ coverUrl: `file:///${p.replace(/\\/g, '/')}` });
    else PlaybackProbe.update({ coverUrl: null });
  }, [library]);

  const head = recent[0];
  const openFile = () => window.aurora.openFile();
  const q = query.trim().toLowerCase();
  const libMatches = q ? library.filter((it) => (it.title || '').toLowerCase().includes(q) || (it.name || '').toLowerCase().includes(q)) : [];
  const recentMatches = q ? recent.filter((it) => (it.name || '').toLowerCase().includes(q)) : [];
  const playUrl = () => {
    const u = url.trim();
    if (!u) return;
    setUrlModal(false);
    setUrl('');
    window.aurora.openPath(u);
  };
  const addNas = async () => {
    const input = nasInput.trim();
    if (!input) return;
    browseNas(input);
  };
  /** 在线浏览：列目录，不入库 */
  const browseNas = async (dir: string) => {
    setNasMsg({ text: '正在连接…' });
    setNasEntries(null);
    const r = await window.aurora.listNas(dir);
    if (r.ok) {
      setNasPath(r.unc!);
      setNasEntries(r.entries || []);
      setNasMsg(null);
    } else {
      setNasMsg({ text: r.error || '连接失败', unc: r.unc, needAuth: r.needAuth });
    }
  };
  /** 上级目录（到 \\服务器\共享 为止） */
  const nasUp = () => {
    const parts = nasPath.split('\\').filter(Boolean);   // [server, share, ...sub]
    if (parts.length <= 2) { setNasPath(''); setNasEntries(null); return; }
    browseNas('\\\\' + parts.slice(0, -1).join('\\'));
  };
  return (
    <>
      <ResizeZones />
      <div className="page">
        {/* 顶栏（透明窗无原生标题栏：顶栏整体可拖拽） */}
        <header className="topbar" onMouseDown={dragHandler()}>
          <div className="logo">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.03 1.03 0 0 0 0-1.76l-11-6.86A1.03 1.03 0 0 0 8 5.14z"/></svg>
            Aurora
          </div>
          <div className="dlna-badge">
            <div className={`dot${dlna?.running ? '' : ' off'}`} />
            <span>{dlna?.running ? `DLNA 在线 · ${dlna.friendlyName}` : 'DLNA 启动中…'}</span>
          </div>
          <div className="global-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              aria-label="全局搜索"
              placeholder="搜索媒体库与最近播放…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
            />
            {query && <button className="clear" onClick={() => setQuery('')} title="清除">✕</button>}
          </div>
          <div className="spacer" />
          <button className="icon-btn theme-toggle" title="切换浅色/暗色" onClick={toggleTheme}>
            <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
            <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          </button>
          <button className="icon-btn" title="设置" onClick={() => { location.hash = '#/settings'; }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <WindowControls />
        </header>

        {/* 全局搜索结果（D24）：查询非空时替换主页内容 */}
        {q ? (
          <section className="search-results">
            <div className="section-head">
              <h2>搜索“{query.trim()}”</h2>
              <span>{libMatches.length + recentMatches.length} 个结果</span>
            </div>
            {libMatches.length === 0 && recentMatches.length === 0 && (
              <div className="empty-hint">没有匹配“{query.trim()}”的内容</div>
            )}
            {libMatches.length > 0 && (
              <>
                <div className="section-head"><h2>媒体库</h2></div>
                <div className="rail">
                  {libMatches.map((it, i) => (
                    <button key={it.path} className="poster" onClick={() => window.aurora.openPath(it.path)}>
                      <div className="cover" style={it.poster ? {
                        backgroundImage: `url("file:///${it.poster.replace(/\\/g, '/')}")`,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                      } : {
                        background: `linear-gradient(170deg, hsl(${200 + i * 24}, 14%, var(--cv-hi)) 0%, hsl(${200 + i * 24}, 16%, var(--cv-lo)) 75%)`,
                      }}>
                        {!it.poster && <span className="ext">{it.name.split('.').pop()?.toUpperCase()}</span>}
                        <span className="spec-hover">{specLabel(it)}</span>
                      </div>
                      <div className="name">{it.title}</div>
                      <div className="info timecode">{it.year || ''}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {recentMatches.length > 0 && (
              <>
                <div className="section-head"><h2>最近播放</h2></div>
                <div className="rail">
                  {recentMatches.map((it, i) => (
                    <button key={it.path} className="poster" onClick={() => window.aurora.openPath(it.path, it.position)}>
                      <div className="cover" style={{
                        background: `linear-gradient(170deg, hsl(${220 + i * 24}, 14%, var(--cv-hi)) 0%, hsl(${220 + i * 24}, 16%, var(--cv-lo)) 75%)`,
                      }}>
                        <span className="ext">{it.name.split('.').pop()?.toUpperCase()}</span>
                      </div>
                      <div className="name">{it.name}</div>
                      <div className="info timecode">{fmtRemain(it) || new Date(it.at).toLocaleDateString()}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : (
          <>
        {/* Hero：继续播放 / 空态 */}
        {head ? (
          <section className="hero">
            <button className="hero-card" onClick={() => window.aurora.openPath(head.path, head.position)}>
              <div className="art"><span className="fname">{head.name}</span></div>
              {head.position != null && head.duration ? (
                <div className="progress"><i style={{ width: `${(head.position / head.duration) * 100}%` }} /></div>
              ) : null}
            </button>
            <div className="hero-meta">
              <div className="kicker">继续观看</div>
              <h1>{head.name}</h1>
              <div className="sub timecode">{fmtRemain(head)}</div>
              <button className="resume-btn" onClick={() => window.aurora.openPath(head.path, head.position)}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.03 1.03 0 0 0 0-1.76l-11-6.86A1.03 1.03 0 0 0 8 5.14z"/></svg>
                继续播放
              </button>
            </div>
          </section>
        ) : (
          <section className="hero">
            <div className="hero-meta">
              <div className="kicker">欢迎回来</div>
              <h1>打开一个视频开始观看</h1>
              <div className="sub">支持本地文件与网络串流，可从手机 DLNA 投屏</div>
              <button className="resume-btn" onClick={openFile}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>
                打开文件
              </button>
            </div>
          </section>
        )}

        {/* 快捷入口 */}
        <section className="shortcuts">
          <button className="tile" onClick={openFile}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>
            <div>本地媒体<small>浏览文件与文件夹</small></div>
          </button>
          <button className="tile" onClick={() => setUrlModal(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/></svg>
            <div>网络媒体<small>HTTP / HLS / 串流地址</small></div>
          </button>
          <button className="tile" disabled={!dlna?.running}
            title={dlna?.running ? '从手机/平板投屏到本机' : 'DLNA 服务未就绪'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12.55a11 11 0 0 1 14.08 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
            <div>DLNA 投屏<small>{dlna?.running ? '等待手机投放' : '启动中…'}</small></div>
          </button>
          <button className="tile" onClick={() => setNasModal(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="6" rx="2"/><rect x="2" y="11" width="20" height="6" rx="2"/><path d="M6 6h.01M6 14h.01M16 18l3 3m0-3l-3 3"/></svg>
            <div>NAS<small>SMB / 网络共享文件夹</small></div>
          </button>
        </section>

        {/* 最近播放（只显示最近 10 个） */}
        <section>
          <div className="section-head">
            <h2>最近播放</h2>
            <span>{Math.min(recent.length, 10)} 个项目</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty-hint">还没有播放记录</div>
          ) : (
            <div className="rail">
              {recent.slice(0, 10).map((it, i) => (
                <button key={it.path} className="poster" onClick={() => window.aurora.openPath(it.path, it.position)}>
                  <div className="cover" style={{
                    background: `linear-gradient(170deg, hsl(${220 + i * 24}, 14%, var(--cv-hi)) 0%, hsl(${220 + i * 24}, 16%, var(--cv-lo)) 75%)`,
                  }}>
                    <span className="ext">{it.name.split('.').pop()?.toUpperCase()}</span>
                    {it.position != null && it.duration ? (
                      <div className="prog"><i style={{ width: `${(it.position / it.duration) * 100}%` }} /></div>
                    ) : null}
                  </div>
                  <div className="name">{it.name}</div>
                  <div className="info timecode">{fmtRemain(it) || new Date(it.at).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 媒体库海报墙 */}
        <section>
          <div className="section-head">
            <h2>媒体库</h2>
            <span>{library.length} 个项目</span>
            <div className="filter-bar">
              {([['all', '全部'], ['movie', '电影'], ['tv', '剧集']] as [LibFilter, string][]).map(([v, l]) => (
                <button key={v} className={libFilter === v ? 'on' : ''} onClick={() => setLibFilter(v)}>{l}</button>
              ))}
            </div>
          </div>
          {library.length === 0 ? (
            <div className="empty-hint">
              还没有媒体库内容 —
              <button className="link-btn" onClick={() => window.aurora.addLibraryFolder()}>添加文件夹</button>
            </div>
          ) : (
            <div className="rail">
              {library.filter((it) => matchFilter(it, libFilter)).map((it, i) => (
                <button key={it.path} className="poster" onClick={() => window.aurora.openPath(it.path)}>
                  <div className="cover" style={it.poster ? {
                    backgroundImage: `url("file:///${it.poster.replace(/\\/g, '/')}")`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                  } : {
                    background: `linear-gradient(170deg, hsl(${200 + i * 24}, 14%, var(--cv-hi)) 0%, hsl(${200 + i * 24}, 16%, var(--cv-lo)) 75%)`,
                  }}>
                    {!it.poster && <span className="ext">{it.name.split('.').pop()?.toUpperCase()}</span>}
                    {it.episode != null && (
                      <span className="ep-tag">{it.season != null ? `S${String(it.season).padStart(2, '0')}E${String(it.episode).padStart(2, '0')}` : `E${String(it.episode).padStart(2, '0')}`}</span>
                    )}
                    <span className="spec-hover">{specLabel(it)}</span>
                  </div>
                  <div className="name">{it.title}</div>
                  <div className="info timecode">{[it.year, it.episode != null ? '剧集' : null].filter(Boolean).join(' · ')}</div>
                </button>
              ))}
            </div>
          )}
        </section>
          </>
        )}
      </div>

      {/* 网络媒体 URL 弹窗 */}
      {urlModal && (
        <div className="url-modal-mask" onClick={() => setUrlModal(false)}>
          <div className="url-modal" onClick={(e) => e.stopPropagation()}>
            <h3>打开网络媒体</h3>
            <input
              autoFocus
              placeholder="粘贴 HTTP / HLS / 串流地址…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') playUrl(); if (e.key === 'Escape') setUrlModal(false); }}
            />
            <div className="ops">
              <button onClick={() => setUrlModal(false)}>取消</button>
              <button className="primary" onClick={playUrl}>播放</button>
            </div>
          </div>
        </div>
      )}
      {/* NAS/SMB 在线浏览弹窗 */}
      {nasModal && (
        <div className="url-modal-mask" onClick={() => { setNasModal(false); setNasMsg(null); setNasPath(''); setNasEntries(null); }}>
          <div className="url-modal nas-browser" onClick={(e) => e.stopPropagation()}>
            <h3>NAS / SMB</h3>
            {!nasPath ? (
              <>
                <input
                  autoFocus
                  placeholder="\\服务器\共享（如 \\NAS\movies）"
                  value={nasInput}
                  onChange={(e) => { setNasInput(e.target.value); setNasMsg(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') addNas(); if (e.key === 'Escape') setNasModal(false); }}
                />
                {nasMsg && (
                  <div className={`nas-msg${nasMsg.ok ? ' ok' : ''}`}>
                    {nasMsg.text}
                    {nasMsg.needAuth && nasMsg.unc && (
                      <button className="link-btn" onClick={() => window.aurora.openNasExplorer(nasMsg.unc!)}>去登录</button>
                    )}
                  </div>
                )}
                <div className="ops">
                  <button onClick={() => setNasModal(false)}>取消</button>
                  <button className="primary" onClick={addNas}>连接</button>
                </div>
              </>
            ) : (
              <>
                <div className="nas-pathbar">
                  <button className="icon-btn" title="上一级" onClick={nasUp}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6"/></svg>
                  </button>
                  <span className="p" title={nasPath}>{nasPath}</span>
                </div>
                <div className="nas-list">
                  {(nasEntries || []).length === 0 && <div className="empty-hint">此目录没有视频文件</div>}
                  {(nasEntries || []).map((en) => (
                    <button key={en.path} className="nas-item"
                      onClick={() => en.isDir ? browseNas(en.path) : (window.aurora.openPath(en.path), setNasModal(false))}>
                      {en.isDir ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>
                      )}
                      <span>{en.name}</span>
                    </button>
                  ))}
                </div>
                <div className="ops">
                  <button onClick={() => { setNasModal(false); setNasPath(''); setNasEntries(null); }}>关闭</button>
                </div>
                {nasMsg && (
                  <div className={`nas-msg${nasMsg.ok ? ' ok' : ''}`}>
                    {nasMsg.text}
                    {nasMsg.needAuth && nasMsg.unc && (
                      <button className="link-btn" onClick={() => window.aurora.openNasExplorer(nasMsg.unc!)}>去登录</button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
