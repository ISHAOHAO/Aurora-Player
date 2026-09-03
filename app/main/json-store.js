const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') console.error('[settings] read failed', path.basename(file), error.message);
    return fallback;
  }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
module.exports = { readJson, writeJson };
