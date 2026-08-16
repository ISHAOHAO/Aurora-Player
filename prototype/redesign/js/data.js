/* ============================================================
   Aurora Player — UI Redesign Prototype
   data.js — 使用真实页面结构与真实形态的数据（本地刮削封面以 picsum 占位）
   ============================================================ */

window.DATA = (function () {

  // 封面图：picsum 按 seed 稳定输出（离线时 onerror 回退到 CSS 艺术占位）
  const poster = (seed) => `https://picsum.photos/seed/${seed}/400/600`;
  const wide   = (seed) => `https://picsum.photos/seed/${seed}/640/360`;
  const thumb  = (seed) => `https://picsum.photos/seed/${seed}/160/90`;

  const LIBRARY = [
    { seed: 'interstellar', title: '星际穿越', year: 2014, kind: 'movie', spec: '4K · HDR10+ · HEVC', dur: '2h49m', pos: 64 },
    { seed: 'dune',         title: '沙丘', year: 2021, kind: 'movie', spec: '4K · Dolby Vision · HEVC', dur: '2h35m', pos: 0 },
    { seed: 'oppenheimer',  title: '奥本海默', year: 2023, kind: 'movie', spec: '4K · HDR10 · HEVC', dur: '3h00m', pos: 0 },
    { seed: 'blade2049',    title: '银翼杀手 2049', year: 2017, kind: 'movie', spec: '4K · Dolby Vision · HEVC', dur: '2h44m', pos: 88 },
    { seed: 'inception',    title: '盗梦空间', year: 2010, kind: 'movie', spec: '1080p · SDR · AVC', dur: '2h28m', pos: 0 },
    { seed: 'madmax',       title: '疯狂的麦克斯：狂暴之路', year: 2015, kind: 'movie', spec: '4K · HDR10 · HEVC', dur: '2h00m', pos: 0 },
    { seed: 'yourname',     title: '你的名字。', year: 2016, kind: 'movie', spec: '1080p · SDR · AVC', dur: '1h46m', pos: 0 },
    { seed: 'ghostshell',   title: '攻壳机动队', year: 1995, kind: 'movie', spec: '1080p · SDR · AVC', dur: '1h23m', pos: 0 },
    { seed: 'grandbudapest',title: '布达佩斯大饭店', year: 2014, kind: 'movie', spec: '1080p · SDR · AVC', dur: '1h39m', pos: 0 },
    { seed: 'bladerunner',  title: '银翼杀手', year: 1982, kind: 'movie', spec: '1080p · SDR · AVC', dur: '1h57m', pos: 0 },
    { seed: 'breaking01',   title: '绝命毒师', year: 2008, kind: 'tv', season: 1, ep: 1, spec: '1080p · SDR · AVC', dur: '47m', pos: 100 },
    { seed: 'breaking02',   title: '绝命毒师', year: 2008, kind: 'tv', season: 1, ep: 2, spec: '1080p · SDR · AVC', dur: '48m', pos: 0 },
    { seed: 'breaking03',   title: '绝命毒师', year: 2008, kind: 'tv', season: 1, ep: 3, spec: '1080p · SDR · AVC', dur: '47m', pos: 0 },
    { seed: 'planet01',     title: '地球脉动 III', year: 2023, kind: 'tv', season: 1, ep: 1, spec: '4K · HDR10 · HEVC', dur: '59m', pos: 100 },
    { seed: 'planet02',     title: '地球脉动 III', year: 2023, kind: 'tv', season: 1, ep: 2, spec: '4K · HDR10 · HEVC', dur: '58m', pos: 0 },
    { seed: 'steins01',     title: '命运石之门', year: 2011, kind: 'tv', season: 1, ep: 14, spec: '1080p · SDR · AVC', dur: '24m', pos: 12 },
    { seed: 'steins02',     title: '命运石之门', year: 2011, kind: 'tv', season: 1, ep: 15, spec: '1080p · SDR · AVC', dur: '24m', pos: 0 },
  ];

  const RECENT = [
    { seed: 'interstellar', title: '星际穿越', name: 'Interstellar.2014.2160p.mkv', spec: '4K · HDR10+ · HEVC', pos: 64, at: '今天 21:12' },
    { seed: 'breaking02',   title: '绝命毒师 S01E02', name: 'Breaking.Bad.S01E02.1080p.mkv', spec: '1080p · SDR · AVC', pos: 31, at: '今天 18:40' },
    { seed: 'planet02',     title: '地球脉动 III E02', name: 'Planet.Earth.III.E02.2160p.mkv', spec: '4K · HDR10 · HEVC', pos: 100, at: '昨天' },
    { seed: 'steins01',     title: '命运石之门 第14话', name: 'Steins.Gate.EP14.1080p.mkv', spec: '1080p · SDR · AVC', pos: 12, at: '昨天' },
    { seed: 'blade2049',    title: '银翼杀手 2049', name: 'Blade.Runner.2049.2017.2160p.mkv', spec: '4K · Dolby Vision · HEVC', pos: 88, at: '3 天前' },
    { seed: 'concert2025',  title: '跨年演唱会 2025', name: 'NYE.Concert.2025.1080p.mkv', spec: '1080p · SDR · AVC · LIVE', pos: 0, at: '5 天前' },
  ];

  const DLNA = { running: true, name: '王先生的影音室' };

  const SHORTCUTS = [
    { key: 'local', label: '本地媒体', sub: '浏览文件与文件夹', seed: 'local' },
    { key: 'network', label: '网络媒体', sub: 'HTTP / HLS / 串流地址', seed: 'network' },
    { key: 'dlna', label: 'DLNA 投屏', sub: '等待手机投放', seed: 'dlna' },
    { key: 'nas', label: 'NAS / SMB', sub: '网络共享文件夹', seed: 'nas' },
  ];

  // 播放页真实形态的规格数据
  const PLAYER = {
    title: '星际穿越',
    file: 'Interstellar.2014.2160p.mkv',
    spec: 'HEVC · 4K · HDR10+ · 23.976',
    cast: 'CASTING · 王先生的影音室',
    status: {
      codec: 'HEVC', w: 3840, h: 2160, hwdec: 'd3d11va', vo: 'direct3d',
      fps: 23.98, drops: 0, vBitrate: 38.2, aBitrate: 768, cache: 12.4,
    },
    hdr: { kind: 'HDR10+', mode: '直通', reason: 'HDR 片源 + HDR 显示器 → 直通保留原始信号', peak: 1000, display: true },
    dur: '2:49:11', cur: '1:47:22', pct: 64,
    chapters: [
      { t: 8,   name: '开场' },
      { t: 27,  name: '玉米地' },
      { t: 52,  name: '升空' },
      { t: 76,  name: '米勒星球' },
      { t: 104, name: '黑洞' },
      { t: 132, name: '五维空间' },
    ],
    audioTracks: [
      { id: 1, label: '中文 · 普通话', default: true },
      { id: 2, label: 'English · DTS-HD MA 5.1' },
      { id: 3, label: 'Français · AAC' },
    ],
    subTracks: [
      { id: 1, label: '中文 · ASS', default: true },
      { id: 2, label: 'English · SRT' },
    ],
    eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };

  return { LIBRARY, RECENT, DLNA, SHORTCUTS, PLAYER, poster, wide, thumb };
})();
