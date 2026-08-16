/* ============================================================
   宿主壳 C — 三页面（home/settings/player）
   结构固定；颜色/玻璃/圆角/密度/透明度全部来自 --vs-* 主题令牌
   ============================================================ */

window.SHELL = {};

(function () {
  const P = () => window.PROTO;
  const D = () => window.PROTO.DATA;
  const S = () => P().state;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function nameOf(it) {
    if (it.kind === 'tv') {
      return `${it.title} ${it.season != null ? `S${String(it.season).padStart(2, '0')}E${String(it.ep).padStart(2, '0')}` : `第${it.ep}话`}`;
    }
    return it.title;
  }
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  /* ---------------- 左侧工具轨 ---------------- */
  function rail(active) {
    const Dt = D();
    const navItems = [
      ['np', '现在播放', Dt.RECENT[0] ? 'ACT' : 'IDLE', 'home'],
      ['recent', '最近播放', String(Math.min(Dt.RECENT.length, 10)), 'home'],
      ['lib', '媒体库', String(Dt.LIBRARY.length), 'home'],
      ['src', '来源', '04', 'home'],
      ['set', '设置', '07', 'settings'],
    ];
    const activeIdx = navItems.findIndex(([k]) => (active === 'settings' ? k === 'set' : k === active));
    return `
      <aside class="vs-rail">
        <div class="brand">AURORA<i>_</i></div>
        <div class="section-label">Navigator</div>
        <nav class="nav">
          ${navItems.map(([k, l, cnt, page], i) => `
            <button class="${i === activeIdx ? 'on' : ''}" data-act="${page === 'settings' ? 'page' : 'noop'}" data-v="${page}">
              <span class="n">0${i + 1}</span>${l}<span class="cnt">${cnt}</span>
            </button>`).join('')}
        </nav>
        <div class="section-label">Signal</div>
        <div class="dlna-state"><i></i><span>DLNA ${D().DLNA.running ? 'ONLINE' : 'STARTING…'} · ${D().DLNA.name}</span></div>
      </aside>`;
  }

  function statusbar() {
    const p = D().PLAYER;
    return `
      <div class="vs-statusbar">
        <span class="mode"><i class="led"></i><b>IDLE</b></span>
        <span class="mode">OUT · <b>D3D11VA</b></span>
        <span class="mode">HDR · <b>${p.hdr.mode}</b></span>
        <label class="vs-search">
          ${P().atoms.icon('search')}
          <input class="search-field" type="text" placeholder="检索媒体库…" value="${escapeHtml(S().query)}">
        </label>
        <div class="right">
          <button class="vs-icon-btn" data-act="console" title="Visual Console (V)">${P().atoms.icon('sliders')}</button>
          ${P().atoms.winControls()}
        </div>
      </div>`;
  }

  /* ---------------- 首页 ---------------- */
  function home() {
    const Dt = D();
    const head = Dt.RECENT[0];
    const recent = Dt.RECENT.slice(1, 9);
    const q = S().query.trim().toLowerCase();
    const lib = Dt.LIBRARY.filter((it) => S().filter === 'all' ? true : S().filter === 'movie' ? it.kind === 'movie' : it.kind === 'tv');
    const p = D().PLAYER;
    const metaGrid = `
      <span class="k">CODEC</span><span class="v">${p.status.codec}</span>
      <span class="k">RES</span><span class="v">${p.status.w}×${p.status.h}</span>
      <span class="k">HDR</span><span class="v sig">${p.hdr.kind}</span>
      <span class="k">FPS</span><span class="v">${p.status.fps.toFixed(2)}</span>
      <span class="k">HW</span><span class="v">${p.status.hwdec}</span>
      <span class="k">OUT</span><span class="v">${p.status.vo}</span>`;

    const searchResult = q ? `
      <section class="vs-sec-head"><h2>检索</h2><span class="count">${escapeHtml(S().query)}</span></section>
      ${(Dt.LIBRARY.filter((it) => nameOf(it).toLowerCase().includes(q)).length + Dt.RECENT.filter((it) => it.title.toLowerCase().includes(q)).length) === 0
        ? `<div class="vs-empty-hint">NO MATCH · ${escapeHtml(S().query)}</div>` : ''}
      <div class="vs-wall">
        ${Dt.LIBRARY.filter((it) => nameOf(it).toLowerCase().includes(q)).map(tile).join('')}
        ${Dt.RECENT.filter((it) => it.title.toLowerCase().includes(q)).map(tile).join('')}
      </div>` : '';

    return `
      <div class="vs-app">
        ${rail('np')}
        <main class="vs-main">
          ${statusbar()}
          ${searchResult || `
          <section class="vs-np">
            <div class="head">
              <span class="tag">Now Playing</span>
              <span class="title">${escapeHtml(head.title)}</span>
              <span class="pos">${head.pos}% · ${head.at}</span>
            </div>
            <div class="np-body">
              <div class="np-meta">${metaGrid}</div>
              <div class="np-ctrl">
                <div class="vs-seekbar">
                  <div class="played" style="width:${S().pct}%"></div>
                  ${[20, 40, 60, 80].map((t) => `<span class="tick" style="left:${t}%"></span>`).join('')}
                </div>
                <div class="vs-btns">
                  <button class="vs-cmd primary" data-act="play" data-name="${escapeHtml(head.title)}">RESUME ▶</button>
                  <button class="vs-cmd" data-act="player-menu" data-v="sub">字幕</button>
                  <button class="vs-cmd" data-act="player-menu" data-v="audio">音轨</button>
                </div>
              </div>
            </div>
          </section>

          <section class="vs-sources">
            ${[['local', 'open-file', '本地媒体', '浏览文件与文件夹', 'folder'], ['network', 'open-url', '网络媒体', 'HTTP / HLS / 串流', 'globe'], ['dlna', 'noop', 'DLNA 投屏', '等待手机投放', 'cast'], ['nas', 'open-nas', 'NAS / SMB', '网络共享文件夹', 'nas']].map(([k, act, l, sub, icon]) => `
              <button class="vs-src-btn" data-act="${act}" ${act === 'noop' ? 'disabled' : ''}>
                ${P().atoms.icon(icon)}
                <div class="t">${l}<small>${sub}</small></div>
              </button>`).join('')}
          </section>

          <section>
            <div class="vs-sec-head"><h2>最近播放</h2><span class="count">${Math.min(recent.length, 8)} ITEMS</span></div>
            ${recent.length === 0 ? `<div class="vs-empty-hint">NO HISTORY</div>` : `
            <div class="vs-wall">${recent.map(tile).join('')}</div>`}
          </section>

          <section>
            <div class="vs-sec-head">
              <h2>媒体库</h2><span class="count">${lib.length} ITEMS</span>
              <div class="filters">
                <button class="${S().filter === 'all' ? 'on' : ''}" data-act="filter" data-v="all">ALL</button>
                <button class="${S().filter === 'movie' ? 'on' : ''}" data-act="filter" data-v="movie">MOVIE</button>
                <button class="${S().filter === 'tv' ? 'on' : ''}" data-act="filter" data-v="tv">TV</button>
              </div>
            </div>
            ${lib.length === 0 ? `<div class="vs-empty-hint">EMPTY — <button class="vs-link-btn" data-act="open-file">ADD FOLDER</button></div>` : `
            <div class="vs-wall">${lib.map(tile).join('')}</div>`}
          </section>
          `}
          ${modalHTML()}
        </main>
      </div>`;
  }

  function tile(it) {
    return `
      <button class="vs-poster" data-act="play" data-name="${escapeHtml(nameOf(it))}">
        <div class="cover">
          <img src="${D().poster(it.seed)}" alt="" draggable="false" onerror="this.style.display='none'">
          ${it.kind === 'tv' && it.ep != null ? `<span class="ep">E${String(it.ep).padStart(2, '0')}</span>` : ''}
          ${it.pos ? `<div class="prog"><i style="width:${it.pos}%"></i></div>` : ''}
        </div>
        <div class="name">${escapeHtml(nameOf(it))}</div>
        <div class="meta">${it.year} · ${it.spec.split(' · ')[0]}</div>
      </button>`;
  }

  /* ---------------- 设置 ---------------- */
  const GROUPS = [
    ['play', '播放'], ['video', '视频'], ['audio', '音频'], ['sub', '字幕'], ['lib', '媒体库'], ['dlna', 'DLNA'], ['ui', 'UI'],
  ];
  const s = () => S().settings;
  function seg(key, options, current) {
    return `<div class="vs-seg">${options.map(([v, l]) =>
      `<button class="${String(current ?? s()[key]) === String(v) ? 'on' : ''}" data-act="seg" data-key="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }
  function sw(key, label) {
    return `<button class="vs-switch ${s()[key] ? 'on' : ''}" data-act="switch" data-key="${key}" aria-label="${label}"></button>`;
  }
  function range(key, min, max, step, suffix) {
    return `<input type="range" min="${min}" max="${max}" step="${step}" value="${s()[key]}" data-range="${key}" data-suffix="${suffix}"><span class="val" data-rangemirror="${key}">${s()[key]}${suffix}</span>`;
  }
  function row(label, sub, control) {
    return `<div class="row"><div class="lbl">${label}${sub ? `<small>${sub}</small>` : ''}</div>${control}</div>`;
  }
  function gpanel(code, title, rowsHtml) {
    return `<div class="vs-gpanel"><div class="gtitle"><i>${code}</i>${title}</div>${rowsHtml}</div>`;
  }

  function settings() {
    const st = s();
    let body = '';
    switch (S().group) {
      case 'play':
        body = gpanel('01', '播放', row('记住播放进度', null, sw('rememberPosition', '记住播放进度'))
          + row('滚轮音量步进', null, seg('volumeStep', [[2, '2%'], [5, '5%'], [10, '10%']], st.volumeStep))
          + row('最近播放记录', null, `<button class="vs-seg-action" data-act="action" data-key="clearRecent">CLEAR</button>`));
        break;
      case 'video':
        body = gpanel('02', '视频', row('HDR 默认模式', null, seg('hdrMode', [['auto', 'AUTO'], ['passthrough', 'PASS'], ['tonemap', 'TONEMAP']]))
          + row('默认色调映射算法', null, seg('hdrAlgo', [['spline', 'spline'], ['bt.2390', 'bt.2390'], ['hable', 'hable'], ['reinhard', 'reinhard'], ['clip', 'clip']], st.hdrAlgo)));
        break;
      case 'audio':
        body = gpanel('03', '音频', row('默认音量', null, range('defaultVolume', 30, 100, 1, '%'))
          + row('增益', null, range('audioGain', -60, 30, 1, 'dB'))
          + row('ReplayGain', null, seg('replayGain', [['off', 'OFF'], ['track', 'TRK'], ['album', 'ALB']]))
          + row('动态归一化', 'dynaudnorm', sw('audioNormalize', '动态归一化'))
          + row('WASAPI 独占', null, sw('audioExclusive', 'WASAPI 独占'))
          + row('Bitstream 透传', 'SPDIF / HDMI', seg('audioBitstream', [['none', 'OFF'], ['ac3', 'AC3'], ['dts', 'DTS']], st.audioBitstream)));
        break;
      case 'sub':
        body = gpanel('04', '字幕', row('默认字幕字号', null, range('subFontSize', 20, 56, 2, '')));
        break;
      case 'lib':
        body = gpanel('05', '媒体库', row('重新扫描', null, `<button class="vs-seg-action" data-act="action" data-key="rescan">RESCAN</button>`)
          + row('清空媒体库', '清除已刮削条目', `<button class="vs-seg-action" data-act="action" data-key="clearLib">WIPE</button>`));
        break;
      case 'dlna':
        body = gpanel('06', 'DLNA', row('启用 DLNA 投屏接收', null, sw('dlnaEnabled', '启用 DLNA'))
          + row('设备名称', null, `<input class="text" value="${escapeHtml(st.dlnaFriendlyName)}">`)
          + row('后台接收投屏', '驻留托盘', sw('bgCasting', '后台接收投屏'))
          + row('投屏控制权', null, seg('lockPolicy', [['none', 'NONE'], ['takeover', 'TAKEOVER'], ['full', 'FULL']])));
        break;
      case 'ui':
        body = gpanel('07', 'UI',
          row('视觉主题', 'Visual System', `<button class="vs-cmd" data-act="console" style="height:30px;padding:0 14px">打开 Visual Console</button>`)
          + row('主题', null, seg('theme', [['auto', 'AUTO'], ['light', 'LIGHT'], ['dark', 'DARK']], st.theme))
          + row('视觉模式（兼容）', '映射为视觉主题', seg('visualMode', [['cinema', 'CINEMA'], ['aurora', 'AURORA'], ['noir', 'NOIR'], ['oled', 'OLED']], st.visualMode)));
        break;
    }
    return `
      <div class="vs-settings-page">
        ${rail('settings')}
        <main class="vs-settings-main">
          <div class="vs-settings-head">
            <button class="back" data-act="page" data-v="home">${P().atoms.icon('left')}BACK</button>
            <h1>设置 · ${S().group.toUpperCase()}</h1>
            <div class="right">${P().atoms.winControls()}</div>
          </div>
          <div class="vs-groups">
            <div class="vs-gpanel" style="padding:6px;display:flex;flex-wrap:wrap;gap:4px">
              ${GROUPS.map(([k, l]) => `<button class="vs-cmd ${S().group === k ? 'primary' : ''}" data-act="group" data-v="${k}">${l}</button>`).join('')}
            </div>
            ${body}
          </div>
        </main>
      </div>`;
  }

  /* ---------------- 播放页 ---------------- */
  function player() {
    const p = D().PLAYER;
    return `
      <div class="vs-player">
        <div class="frame"></div>
        <div class="p-top">
          <span class="title">${p.title}</span>
          <span class="casting"><i></i>${p.cast}</span>
          <div class="readouts">
            <span class="ro">CODEC <b>${p.status.codec}</b></span>
            <span class="ro">RES <b>${p.status.w}×${p.status.h}</b></span>
            <span class="ro">HDR <b>${p.hdr.kind}</b></span>
            <span class="ro">FPS <b>${p.status.fps.toFixed(2)}</b></span>
            <span class="ro">VO <b>${p.status.vo}</b></span>
          </div>
        </div>

        <div class="deck">
          <div class="telemetry">
            <span>V-BITRATE <b>${p.status.vBitrate.toFixed(1)}Mbps</b></span>
            <span>A-BITRATE <b>${p.status.aBitrate}kbps</b></span>
            <span>DROPS <b>${p.status.drops}</b></span>
            <span>CACHE <b>${p.status.cache}s</b></span>
            <span style="margin-left:auto">${p.hdr.mode} · ${p.hdr.reason}</span>
          </div>
          <div class="vs-seekbar">
            <div class="played" style="width:${S().pct}%"></div>
            ${p.chapters.map((c) => `<span class="tick" style="left:${(c.t / 169) * 100}%"></span>`).join('')}
            <div class="knob" style="left:${S().pct}%"></div>
          </div>
          <div class="vs-row-ctl">
            <button class="vs-btn-play" data-act="player-pause">${S().paused ? P().atoms.icon('play') : P().atoms.icon('pause')}</button>
            <span class="vs-clock tc"><b>${p.cur}</b> / ${p.dur}</span>
            <div class="volume" style="display:flex;align-items:center;gap:6px">
              <button class="vs-icon-btn" data-act="noop">${S().mute || S().volume === 0 ? P().atoms.icon('mute') : P().atoms.icon('vol')}</button>
              <div class="vs-vol-track"><i style="width:${S().volume}%"></i></div>
            </div>
            <div class="vs-spacer"></div>
            <div class="vs-side">
              <button class="vs-icon-btn" data-act="player-menu" data-v="sub" title="字幕轨">${P().atoms.icon('sub')}</button>
              <button class="vs-icon-btn" data-act="player-menu" data-v="audio" title="音轨">${P().atoms.icon('track')}</button>
              <button class="vs-icon-btn" data-act="player-drawer" title="控制台">${P().atoms.icon('sliders')}</button>
              <button class="vs-icon-btn" data-act="player-fullscreen" title="全屏">${P().atoms.icon('full')}</button>
              <button class="vs-icon-btn" data-act="page" data-v="home" title="返回首页">${P().atoms.icon('home')}</button>
            </div>
          </div>
        </div>

        ${S().menu === 'sub' ? menu('字幕轨', p.subTracks) : ''}
        ${S().menu === 'audio' ? menu('音轨', p.audioTracks) : ''}
        ${S().drawer ? drawer() : ''}
      </div>`;
  }

  function menu(title, tracks) {
    return `
      <div class="vs-pop-menu">
        <div class="head">${title}</div>
        ${tracks.map((t) => `<button class="mi ${t.default ? 'on' : ''}" data-act="player-track" data-kind="${title === '音轨' ? 'audio' : 'sub'}" data-id="${t.id}">${t.label}${t.default ? '<span class="tag">DEF</span>' : ''}</button>`).join('')}
        <div class="sep"></div>
        <button class="mi" data-act="player-menu" data-v="none">关闭</button>
      </div>`;
  }

  function drawer() {
    return `
      <div class="vs-drawer">
        <div class="tabs">
          <button class="on">BASIC</button><button>VIDEO</button><button>AUDIO</button><button>SUB</button><button>ADV</button>
          <div style="flex:1"></div>
          <button class="vs-icon-btn" data-act="player-drawer" title="关闭">${P().atoms.icon('x')}</button>
        </div>
        <div class="body">
          <div class="row"><label>片源检测</label><div class="vs-info-grid">
            <span>片源</span><span>HDR10+ · BT.2020</span>
            <span>显示器</span><span>HDR 1000 nits</span>
            <span>决策</span><span>直通</span>
            <span>原因</span><span>HDR 片源 + HDR 显示器 → 直通</span>
          </div></div>
          <div class="row"><label>实时性能 2Hz</label><div class="vs-info-grid">
            <span>编码</span><span>HEVC</span><span>分辨率</span><span>3840×2160</span>
            <span>硬件解码</span><span>d3d11va</span><span>帧率</span><span>23.98</span>
            <span>丢帧</span><span>0</span><span>缓存</span><span>12.4s</span>
          </div></div>
        </div>
      </div>`;
  }

  /* ---------------- 模态 ---------------- */
  function modalHTML() {
    if (!S().modal) return '';
    if (S().modal === 'url') {
      return `
        <div class="vs-modal-mask" data-act="modal-close">
          <div class="vs-modal" data-act="modal-stop">
            <h3>OPEN NETWORK MEDIA</h3>
            <input class="modal-input" placeholder="HTTP / HLS / RTSP …">
            <div class="ops">
              <button data-act="modal-cancel">CANCEL</button>
              <button class="primary" data-act="modal-play">PLAY</button>
            </div>
          </div>
        </div>`;
    }
    const nas = [['dir', 'Movies'], ['dir', 'Series'], ['file', 'Interstellar.2014.2160p.mkv'], ['file', 'Dune.2021.2160p.mkv']];
    return `
      <div class="vs-modal-mask" data-act="modal-close">
        <div class="vs-modal" data-act="modal-stop">
          <h3>SMB / NAS</h3>
          <div class="vs-nas-path">${P().atoms.icon('left')}<span>\\\\NAS\\movies</span></div>
          <div class="vs-nas-list">
            ${nas.map(([t, n]) => `<button class="vs-nas-item" data-act="${t === 'dir' ? 'nas-open' : 'play'}" data-name="${escapeHtml(n)}">${P().atoms.icon(t === 'dir' ? 'folder' : 'film')}<span>${n}</span></button>`).join('')}
          </div>
          <div class="ops"><button data-act="modal-close">CLOSE</button></div>
        </div>
      </div>`;
  }

  window.SHELL = { home, settings, player };
})();
