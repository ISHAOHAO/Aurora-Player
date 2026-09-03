const fs = require('node:fs');
const path = require('node:path');
function fileFromArgs(argv, defaultApp = process.defaultApp, isFile = p => fs.statSync(p).isFile()) {
  for (const value of argv.slice(defaultApp ? 2 : 1)) {
    if (value.startsWith('-')) continue;
    try { if (isFile(value)) return path.resolve(value); } catch { /* unavailable argument */ }
  }
  return null;
}
function resumePosition(history, remember, explicit, casting = false) {
  if (casting) return 0;
  if (Number.isFinite(explicit) && explicit === 0) return 0; // explicit restart
  if (!remember) return 0;
  const position = Number.isFinite(explicit) ? explicit : history?.position;
  if (!Number.isFinite(position) || position < 0) return 0;
  if (history?.duration && position >= history.duration - 10) return 0;
  return position;
}
module.exports = { fileFromArgs, resumePosition };
