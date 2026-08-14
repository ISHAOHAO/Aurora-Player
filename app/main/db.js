/**
 * Aurora Player — 媒体数据库（docs/02 §12；消化 D35）
 * node:sqlite（Node 22+ 内置，Electron 43 / Node 24.18 可用）替代 JSON：
 * 表 media / play_history / favorite / collection / playlist / playlist_items / meta。
 * WAL 模式、启动 integrity_check、迁移自旧 JSON（library.json / recent.json）。
 */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

const TABLES = `
CREATE TABLE IF NOT EXISTS media (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  season INTEGER,
  episode INTEGER,
  size INTEGER,
  mtime REAL,
  poster TEXT,
  specs_res TEXT,
  specs_hdr TEXT,
  specs_sub TEXT
);
CREATE TABLE IF NOT EXISTS play_history (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  at REAL NOT NULL,
  position REAL,
  duration REAL
);
CREATE TABLE IF NOT EXISTS favorite (
  path TEXT PRIMARY KEY,
  at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS collection (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS playlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS playlist_items (
  playlist_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, path)
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

let db = null;

function open(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (integrity && integrity.integrity_check !== 'ok') {
    console.error('[db] integrity_check:', integrity.integrity_check);
  }
  db.exec(TABLES);
  migrateJson(dbPath);
  return db;
}

function get() {
  if (!db) throw new Error('db not opened');
  return db;
}

/** 从旧 JSON 迁移（幂等：仅当表为空且 JSON 存在时导入） */
function migrateJson(dbPath) {
  const dir = path.dirname(dbPath);
  try {
    const lib = path.join(dir, 'library.json');
    const recent = path.join(dir, 'recent.json');
    const mediaCount = db.prepare('SELECT COUNT(*) c FROM media').get().c;
    if (mediaCount === 0 && fs.existsSync(lib)) {
      let items = [];
      const raw = JSON.parse(fs.readFileSync(lib, 'utf8'));
      if (Array.isArray(raw)) items = raw; else items = raw.items || [];
      const ins = db.prepare(`INSERT OR REPLACE INTO media
        (path,name,title,year,season,episode,size,mtime,poster,specs_res,specs_hdr,specs_sub)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      const tx = db.exec ? null : null;
      db.exec('BEGIN');
      for (const it of items) {
        ins.run(it.path, it.name, it.title, it.year ?? null, it.season ?? null, it.episode ?? null,
          it.size ?? 0, it.mtime ?? 0, it.poster ?? null,
          it.specs?.res ?? null, it.specs?.hdr ?? null, it.specs?.sub ?? null);
      }
      db.exec('COMMIT');
      fs.renameSync(lib, lib + '.bak');
    }
    const recCount = db.prepare('SELECT COUNT(*) c FROM play_history').get().c;
    if (recCount === 0 && fs.existsSync(recent)) {
      const items = JSON.parse(fs.readFileSync(recent, 'utf8'));
      const ins = db.prepare('INSERT OR REPLACE INTO play_history (path,name,at,position,duration) VALUES (?,?,?,?,?)');
      db.exec('BEGIN');
      for (const it of items) {
        ins.run(it.path, it.name, it.at, it.position ?? null, it.duration ?? null);
      }
      db.exec('COMMIT');
      fs.renameSync(recent, recent + '.bak');
    }
  } catch (e) {
    console.error('[db] migrate error', e.message);
  }
}

/* ---------------- media ---------------- */

function replaceMedia(items) {
  const ins = db.prepare(`INSERT OR REPLACE INTO media
    (path,name,title,year,season,episode,size,mtime,poster,specs_res,specs_hdr,specs_sub)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.exec('BEGIN');
  for (const it of items) {
    ins.run(it.path, it.name, it.title, it.year ?? null, it.season ?? null, it.episode ?? null,
      it.size ?? 0, it.mtime ?? 0, it.poster ?? null,
      it.specs?.res ?? null, it.specs?.hdr ?? null, it.specs?.sub ?? null);
  }
  db.exec('COMMIT');
}

function allMedia() {
  return db.prepare('SELECT * FROM media ORDER BY mtime DESC').all().map(rowToMedia);
}

function rowToMedia(r) {
  return {
    path: r.path, name: r.name, title: r.title,
    year: r.year ?? null, season: r.season ?? null, episode: r.episode ?? null,
    size: r.size, mtime: r.mtime, poster: r.poster ?? null,
    specs: { res: r.specs_res, hdr: r.specs_hdr, sub: r.specs_sub },
  };
}

function clearMedia() {
  db.exec('DELETE FROM media');
}

/* ---------------- play_history ---------------- */

function recentList() {
  return db.prepare('SELECT * FROM play_history ORDER BY at DESC LIMIT 100').all().map((r) => ({
    path: r.path, name: r.name, at: r.at,
    position: r.position ?? undefined, duration: r.duration ?? undefined,
  }));
}

function recentAdd(file, name, at) {
  db.prepare('DELETE FROM play_history WHERE path = ?').run(file);
  db.prepare('INSERT INTO play_history (path,name,at) VALUES (?,?,?)').run(file, name, at);
}

function recentUpdatePosition(file, position, duration) {
  db.prepare('UPDATE play_history SET position = ?, duration = ? WHERE path = ?').run(position, duration, file);
}

function recentClear() {
  db.exec('DELETE FROM play_history');
}

/* ---------------- favorite ---------------- */

function favoriteList() {
  return db.prepare('SELECT f.path, f.at, m.title, m.name, m.poster FROM favorite f LEFT JOIN media m ON f.path = m.path ORDER BY f.at DESC').all();
}

function favoriteToggle(file) {
  const exists = db.prepare('SELECT 1 FROM favorite WHERE path = ?').get(file);
  if (exists) { db.prepare('DELETE FROM favorite WHERE path = ?').run(file); return false; }
  db.prepare('INSERT INTO favorite (path, at) VALUES (?,?)').run(file, Date.now());
  return true;
}

function favoriteIsOn(file) {
  return !!db.prepare('SELECT 1 FROM favorite WHERE path = ?').get(file);
}

/* ---------------- playlist ---------------- */

function playlistList() {
  return db.prepare('SELECT * FROM playlist ORDER BY at DESC').all();
}

function playlistCreate(name) {
  db.prepare('INSERT INTO playlist (name, at) VALUES (?,?)').run(name, Date.now());
  return db.prepare('SELECT * FROM playlist WHERE name = ?').get(name);
}

function playlistDelete(id) {
  db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(id);
  db.prepare('DELETE FROM playlist WHERE id = ?').run(id);
}

function playlistAddItem(id, file) {
  const max = db.prepare('SELECT COALESCE(MAX(position),-1) m FROM playlist_items WHERE playlist_id = ?').get(id).m;
  db.prepare('INSERT OR IGNORE INTO playlist_items (playlist_id, path, position) VALUES (?,?,?)').run(id, file, max + 1);
}

function playlistItems(id) {
  return db.prepare(`SELECT pi.path, m.name, m.title, m.poster FROM playlist_items pi
    LEFT JOIN media m ON pi.path = m.path WHERE pi.playlist_id = ? ORDER BY pi.position`).all(id);
}

/* ---------------- collection ---------------- */

function collectionList() {
  return db.prepare('SELECT * FROM collection ORDER BY at DESC').all();
}

function collectionCreate(name) {
  db.prepare('INSERT INTO collection (name, at) VALUES (?,?)').run(name, Date.now());
  return db.prepare('SELECT * FROM collection WHERE name = ?').get(name);
}

module.exports = {
  open, get,
  replaceMedia, allMedia, clearMedia,
  recentList, recentAdd, recentUpdatePosition, recentClear,
  favoriteList, favoriteToggle, favoriteIsOn,
  playlistList, playlistCreate, playlistDelete, playlistAddItem, playlistItems,
  collectionList, collectionCreate,
  SCHEMA_VERSION,
};
