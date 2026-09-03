function parseName(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  let title = base, year = null, season = null, episode = null;
  let m = base.match(/[Ss](\d{1,2})[Ee](\d{1,3})/) || base.match(/第\s*(\d{1,3})\s*[集话]/);
  if (m) {
    if (m.length === 3) { season = +m[1]; episode = +m[2]; } else { episode = +m[1]; }
    title = base.slice(0, m.index);
  }
  // 年份取最后一个 19xx/20xx 匹配（片名自带数字年份时，发行年通常在后："Blade.Runner.2049.2017.1080p"）
  const years = [...title.matchAll(/(?:19|20)\d{2}/g)];
  if (years.length) {
    const last = years[years.length - 1];
    year = +last[0];
    title = title.slice(0, last.index);
  }
  title = title
    .replace(/[\[【(（].*?(?:[\]】)）])/g, ' ')    // 制作组/标签括号
    .replace(/[._]+/g, ' ')
    .replace(/\b(1080p|720p|2160p|4k|8k|bluray|blu-ray|web-?dl|webrip|hdtv|hdr|hevc|x26[45]|avc|aac|dts|remux)\b.*$/i, '')
    .replace(/[-–—\s]+$/, '')
    .trim();
  return { title: title || base, year, season, episode };
}

/** 规格标签提取（D27）：分辨率 / HDR / ASS 字幕，从文件名+同目录 .ass 探测 */
function parseSpecs(filename, dir) {
  const s = filename.replace(/\.[^.]+$/, '');
  const low = s.toLowerCase();
  const specs = { res: null, hdr: null, sub: null };
  if (/\b(2160p|4k|uhd)\b/.test(low)) specs.res = '4K';
  else if (/\b1080p\b/.test(low)) specs.res = '1080p';
  else if (/\b720p\b/.test(low)) specs.res = '720p';
  if (/\b(dv|dovi|dolby.?vision)\b/.test(low)) specs.hdr = 'Dolby Vision';
  else if (/\b(hdr10\+|hdr10plus)\b/.test(low)) specs.hdr = 'HDR10+';
  else if (/\b(hdr10|hdr|pq)\b/.test(low)) specs.hdr = 'HDR10';
  else if (/\bhlg\b/.test(low)) specs.hdr = 'HLG';
  if (/\bass\b/.test(low)) specs.sub = 'ASS';

  return specs;
}


module.exports = { parseName, parseSpecs };
