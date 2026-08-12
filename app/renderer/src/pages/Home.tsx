import { useEffect, useState } from 'react';
import type { DlnaState, RecentItem } from '../bridge.d';

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
  const [urlModal, setUrlModal] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    window.aurora.getRecent().then(setRecent);
    window.aurora.getDlnaState().then(setDlna);
  }, []);

  const head = recent[0];
  const openFile = () => window.aurora.openFile();
  const playUrl = () => {
    const u = url.trim();
    if (!u) return;
    setUrlModal(false);
    setUrl('');
    window.aurora.openPath(u);
  };

  return (
    <>
      <div className="ambient-stage"><div className="particles" /></div>
      <div className="page">
        {/* 顶栏 */}
        <header className="topbar">
          <div className="logo">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.56.88l11-6.86a1.03 1.03 0 0 0 0-1.76l-11-6.86A1.03 1.03 0 0 0 8 5.14z"/></svg>
            Aurora
          </div>
          <div className="dlna-badge">
            <div className={`dot${dlna?.running ? '' : ' off'}`} />
            <span>{dlna?.running ? `DLNA 在线 · ${dlna.friendlyName}` : 'DLNA 启动中…'}</span>
          </div>
          <div className="spacer" />
          <button className="icon-btn theme-toggle" title="切换浅色/暗色" onClick={toggleTheme}>
            <svg className="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
            <svg className="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          </button>
          <button className="icon-btn" title="设置" onClick={() => { location.hash = '#/settings'; location.reload(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </header>

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
          <button className="tile" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="6" rx="2"/><rect x="2" y="11" width="20" height="6" rx="2"/><path d="M6 6h.01M6 14h.01M16 18l3 3m0-3l-3 3"/></svg>
            <div>NAS<small>SMB / WebDAV（P1）</small></div>
          </button>
        </section>

        {/* 最近播放 */}
        <section>
          <div className="section-head">
            <h2>最近播放</h2>
            <span>{recent.length} 个项目</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty-hint">还没有播放记录</div>
          ) : (
            <div className="rail">
              {recent.map((it, i) => (
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
    </>
  );
}
