const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseName, parseSpecs } = require('./media-metadata');
const db = require('./db');
const extensions = new Set(['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ts', 'm2ts', 'rmvb', 'mpg', 'mpeg']);
const posterNames = ['poster.jpg', 'poster.png', 'folder.jpg', 'cover.jpg', 'cover.png'];
async function scan({ folders, previous = [], limit = 10000 }) {
  const old = new Map(previous.map(item => [item.path, item]));
  const found = new Map();
  const errors = [];
  let inspected = 0;
  for (const root of [...new Set(folders)]) {
    const items = [];
    let complete = true;
    const walk = async (dir, depth) => {
      if (depth > 32 || inspected >= limit) { complete = false; return; }
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); }
      catch (e) { complete = false; errors.push({ folder: root, code: e.code }); return; }
      const names = new Map(entries.map(e => [e.name.toLowerCase(), e.name]));
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('$') || entry.isSymbolicLink()) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) { await walk(file, depth + 1); continue; }
        if (!entry.isFile() || !extensions.has(path.extname(entry.name).slice(1).toLowerCase())) continue;
        if (inspected++ >= limit) { complete = false; break; }
        let stat;
        try { stat = await fs.stat(file); } catch (e) { complete = false; errors.push({ folder: root, code: e.code }); continue; }
        const cached = old.get(file);
        if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) { items.push(cached); continue; }
        const base = path.basename(file, path.extname(file));
        const parsed = parseName(entry.name);
        let nfo = null;
        for (const name of [`${base}.nfo`, 'movie.nfo', 'tvshow.nfo']) {
          const actual = names.get(name.toLowerCase());
          if (!actual) continue;
          try {
            const nfoPath = path.join(dir, actual);
            if ((await fs.stat(nfoPath)).size > 1024 * 1024) continue;
            const xml = await fs.readFile(nfoPath, 'utf8');
            if (/<!DOCTYPE|<!ENTITY/i.test(xml)) continue;
            const title = xml.match(/<title>([^<]+)<\/title>/i)?.[1];
            const year = xml.match(/<year>(\d{4})<\/year>/i)?.[1];
            if (title) { nfo = { title: title.trim(), year: year ? +year : null }; break; }
          } catch (e) { errors.push({ folder: root, code: e.code || 'NFO_READ' }); }
        }
        const poster = [...posterNames, `${base}-poster.jpg`, `${base}.jpg`].map(n => names.get(n.toLowerCase())).find(Boolean);
        const specs = parseSpecs(entry.name);
        if (!specs.sub && entries.some(e => /\.ass$/i.test(e.name))) specs.sub = 'ASS';
        items.push({ path: file, name: entry.name, ...parsed, title: nfo?.title || parsed.title, year: nfo?.year || parsed.year,
          size: stat.size, mtime: stat.mtimeMs, poster: poster ? path.join(dir, poster) : null, specs });
        if (inspected % 100 === 0) parentPort?.postMessage({ type: 'progress', count: inspected });
      }
    };
    await walk(root, 0);
    // An offline/incomplete root keeps its existing rows. Removed configured roots do not.
    if (!complete) {
      errors.push({ folder: root, code: 'INCOMPLETE' });
      for (const item of previous) {
        const relative = path.relative(root, item.path);
        if (relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) found.set(item.path, item);
      }
    }
    for (const item of items) found.set(item.path, item);
  }
  return { items: [...found.values()].sort((a, b) => b.mtime - a.mtime), errors };
}
if (parentPort) {
  (async () => {
    const conn = db.open(workerData.dbPath);
    try {
      const result = await scan({ folders: workerData.folders, previous: db.allMedia() });
      db.syncMedia(result.items);
      parentPort.postMessage({ type: 'complete', items: db.allMedia(), errors: result.errors });
    } finally { conn.close(); }
  })().catch(e => { parentPort.postMessage({ type: 'error', message: e.message }); process.exitCode = 1; });
}
module.exports = { scan };
